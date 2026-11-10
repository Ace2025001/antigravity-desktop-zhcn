// A running process does not prove that the user has no unsaved work, so the
// user gets a window to save and quit, plus explicit choices:
//   Y  force close now          N  never force, wait for a manual quit
//   no key within 60 s          request a normal quit, then force close
//   Ctrl+C                      cancel the whole operation
// A client that this tool launched itself only to read the UI holds no user
// work, so `owned` skips the waiting window and closes it straight away.

export class CloseCancelledError extends Error {}

/** Read single key presses from an interactive terminal; returns null when stdin is not a TTY. */
export function createTerminalKeys(stdin = process.stdin) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") return null;
  const pending = [];
  const onData = (data) => { for (const ch of String(data)) pending.push(ch); };
  stdin.setRawMode(true);
  stdin.resume();
  stdin.on("data", onData);
  return {
    next: () => pending.shift() ?? null,
    close: () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
    },
  };
}

async function waitUntilExited({ running, sleep, now, timeoutMs }) {
  const deadline = now() + timeoutMs;
  while (await running()) {
    if (now() >= deadline) return false;
    await sleep(500);
  }
  return true;
}

export async function closeWithPolicy({
  running,
  requestClose,
  forceClose,
  log = console.log,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
  responseMs = 60_000,
  gracefulMs = 15_000,
  forceMs = 15_000,
  exitHint = "",
  owned = false,
  keys,
}) {
  if (!(await running())) { log("客户端已退出，可以继续。"); return; }

  const forceAndConfirm = async (message) => {
    log(message);
    if (typeof forceClose === "function") {
      await forceClose();
    } else {
      throw new Error("客户端未退出，可能有未保存提示或任务阻止退出。已停止本次操作，请处理客户端提示后重试。");
    }
    if (!(await waitUntilExited({ running, sleep, now, timeoutMs: forceMs }))) {
      throw new Error("强制关闭后客户端仍在运行，已停止本次操作。请在任务管理器中结束 Antigravity 后重试。");
    }
    log("客户端已关闭，继续处理。");
  };

  if (owned) {
    log("正在关闭汉化工具临时打开的客户端…");
    await requestClose();
    if (await waitUntilExited({ running, sleep, now, timeoutMs: gracefulMs })) { log("客户端已退出，继续处理。"); return; }
    await forceAndConfirm("临时打开的客户端未及时退出，正在强制关闭…");
    return;
  }

  const input = keys === undefined ? createTerminalKeys() : keys;
  log("需要暂时退出 Antigravity。无法可靠判断是否有未完成任务，请先保存工作。");
  if (exitHint) log(exitHint);
  if (input) {
    log("按 Y：确认强制关闭，立即继续（未保存的内容会丢失）。");
    log("按 N：不强制关闭，一直等你手动退出。");
    log("不操作：60 秒后先请求正常退出，仍未退出则强制关闭。Ctrl+C 取消本次操作。");
  } else {
    log("60 秒内手动退出即可继续；超时后先请求正常退出，仍未退出则强制关闭。");
  }

  const deadline = now() + responseMs;
  let mode = "auto";
  let previous;
  const tick = () => {
    if (mode !== "auto") return;
    const remaining = Math.max(0, Math.ceil((deadline - now()) / 1000));
    if (remaining === previous) return;
    if (log === console.log && process.stdout.isTTY) process.stdout.write(`\r等待退出：剩余 ${String(remaining).padStart(2, " ")} 秒（Y 强制关闭 / N 不强制）  `);
    else if (remaining % 10 === 0) log(`等待退出：剩余 ${remaining} 秒。`);
    previous = remaining;
  };
  const endLine = () => { if (log === console.log && process.stdout.isTTY) process.stdout.write("\n"); };

  try {
    tick();
    while (await running()) {
      const key = input?.next();
      if (key === "\u0003") { endLine(); throw new CloseCancelledError("已取消本次操作，未修改任何安装文件。"); }
      if (key === "y" || key === "Y") { endLine(); await forceAndConfirm("已确认强制关闭，正在关闭客户端…"); return; }
      if ((key === "n" || key === "N") && mode === "auto") {
        endLine();
        mode = "manual";
        log("已取消自动强制关闭。请保存工作后手动退出客户端，退出后会自动继续；需要时仍可按 Y 强制关闭，Ctrl+C 取消。");
      }
      if (mode === "auto" && now() >= deadline) break;
      await sleep(250);
      tick();
    }
  } finally {
    input?.close();
  }
  endLine();
  if (!(await running())) { log("检测到客户端已退出，继续处理。"); return; }

  log("等待时间已到，正在请求客户端正常退出…");
  await requestClose();
  if (await waitUntilExited({ running, sleep, now, timeoutMs: gracefulMs })) { log("客户端已正常退出，继续处理。"); return; }
  await forceAndConfirm("客户端未响应正常退出，正在强制关闭…");
}

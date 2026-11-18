// A running process does not prove that the user has no unsaved work, so the
// user gets a window to save and quit, plus explicit choices:
//   Y  force close now          N  never force, wait for a manual quit
//   no key within 60 s          request a normal quit, then force close
//   Ctrl+C                      cancel the whole operation
// A client that this tool launched itself only to read the UI holds no user
// work, so `owned` skips the waiting window and closes it straight away.

import { SYMBOLS, color, endLiveLine, liveLine } from "./console-ui.mjs";

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
  autoContinueWhen = null,
}) {
  const say = {
    ok: (m) => log(`  ${color.green(SYMBOLS.ok)} ${m}`),
    warn: (m) => log(`  ${color.yellow(SYMBOLS.warn)} ${m}`),
    info: (m) => log(`  ${m}`),
    choice: (m) => log(`  ${color.yellow(SYMBOLS.bar)} ${m}`),
  };
  const live = log === console.log && process.stdout.isTTY;
  if (!(await running())) { say.ok("客户端已退出"); return; }

  const forceAndConfirm = async (message) => {
    say.info(message);
    if (typeof forceClose === "function") {
      await forceClose();
    } else {
      throw new Error("客户端未退出，可能有未保存提示或任务阻止退出。已停止本次操作，请处理客户端提示后重试。");
    }
    if (!(await waitUntilExited({ running, sleep, now, timeoutMs: forceMs }))) {
      throw new Error("强制关闭后客户端仍在运行，已停止本次操作。请在任务管理器中结束 Antigravity 后重试。");
    }
    say.ok("客户端已关闭");
  };

  if (owned) {
    say.info("正在关闭汉化工具临时打开的客户端…");
    await requestClose();
    if (await waitUntilExited({ running, sleep, now, timeoutMs: gracefulMs })) { say.ok("客户端已退出"); return; }
    await forceAndConfirm("临时打开的客户端未及时退出，正在强制关闭…");
    return;
  }

  const immediateReason = typeof autoContinueWhen === "function" ? await autoContinueWhen("initial") : null;
  if (immediateReason) {
    say.info(immediateReason);
    await requestClose();
    if (await waitUntilExited({ running, sleep, now, timeoutMs: Math.min(gracefulMs, 3_000) })) { say.ok("客户端已正常退出"); return; }
    await forceAndConfirm("正在结束客户端后台驻留进程…");
    return;
  }

  const input = keys === undefined ? createTerminalKeys() : keys;
  say.warn("需要暂时退出 Antigravity，请先保存工作");
  if (exitHint) say.info(exitHint);
  if (input) {
    say.choice("关闭 Antigravity 窗口后会自动继续");
    say.choice("1  立即关闭（未保存的内容会丢失）");
    say.choice("2  不强制，等我自己退出");
    say.info(color.dim("不操作：60 秒后先请求正常退出，仍未退出再强制关闭；Ctrl+C 取消"));
  } else {
    say.info("60 秒内关闭窗口或退出即可自动继续；超时后先请求正常退出，仍未退出则强制关闭。");
  }

  const deadline = now() + responseMs;
  let mode = "auto";
  let previous;
  const tick = () => {
    if (mode !== "auto") return;
    const remaining = Math.max(0, Math.ceil((deadline - now()) / 1000));
    if (remaining === previous) return;
    if (live) liveLine(`剩余 ${String(remaining).padStart(2, " ")} 秒，不操作将自动关闭…（1 立即关闭 / 2 不强制）`);
    else if (remaining % 10 === 0) say.info(`等待退出：剩余 ${remaining} 秒。`);
    previous = remaining;
  };
  const endLine = () => { if (live) endLiveLine(); };

  let autoTriggered = false;
  try {
    tick();
    while (await running()) {
      const key = input?.next();
      if (key === "\u0003") { endLine(); throw new CloseCancelledError("已取消本次操作，未修改任何安装文件。"); }
      // 1 / 2 match the numbered settings questions; Y / N stay accepted.
      if (key === "1" || key === "y" || key === "Y") { endLine(); await forceAndConfirm("已确认强制关闭，正在关闭客户端…"); return; }
      if ((key === "2" || key === "n" || key === "N") && mode === "auto") {
        endLine();
        mode = "manual";
        say.info("已取消自动强制关闭。保存工作后手动退出客户端即可自动继续；需要时仍可按 1 强制关闭，Ctrl+C 取消。");
      }
      if (mode === "auto" && typeof autoContinueWhen === "function") {
        const pollReason = await autoContinueWhen("poll");
        if (pollReason) {
          endLine();
          say.info(pollReason);
          autoTriggered = true;
          break;
        }
      }
      if (mode === "auto" && now() >= deadline) break;
      await sleep(250);
      tick();
    }
  } finally {
    input?.close();
  }
  endLine();
  if (!(await running())) { say.ok("检测到客户端已退出"); return; }

  say.info(autoTriggered ? "正在结束客户端后台驻留进程…" : "等待时间已到，正在请求客户端正常退出…");
  await requestClose();
  if (await waitUntilExited({ running, sleep, now, timeoutMs: autoTriggered ? Math.min(gracefulMs, 3_000) : gracefulMs })) { say.ok("客户端已正常退出"); return; }
  await forceAndConfirm(autoTriggered ? "正在清理客户端后台托盘驻留进程…" : "客户端未响应正常退出，正在强制关闭…");
}

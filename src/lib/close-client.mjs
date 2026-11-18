import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { closeWithPolicy, CloseCancelledError } from "./close-policy.mjs";
import path from "node:path";
import os from "node:os";

const exec = promisify(execFile);

/**
 * Classify an Antigravity process command line into main Electron app vs
 * Chromium subprocess (--type=...) vs background sidecar Node runner (sidecar_sdk / --import=).
 */
export function classifyAntigravityCommand(commandLine = "") {
  const cmd = String(commandLine || "");
  const isSidecar = /sidecar_sdk|--import=/i.test(cmd);
  const isSubprocess = /(?:^|\s)--type=[^\s]+/i.test(cmd);
  return {
    isSidecar,
    isSubprocess,
    isMainApp: !isSidecar && !isSubprocess,
  };
}

export function filterActiveClientProcesses(rawProcesses) {
  if (!Array.isArray(rawProcesses) || rawProcesses.length === 0) {
    return { active: [], orphans: [] };
  }
  const hasMainApp = rawProcesses.some((item) => item.isMainApp);
  if (hasMainApp) {
    return { active: rawProcesses, orphans: [] };
  }
  return { active: [], orphans: rawProcesses };
}

async function inspectWindowsRawProcesses() {
  const psScript = [
    "[Console]::OutputEncoding=[Text.Encoding]::UTF8",
    "$wins=@{}",
    "Get-Process -Name Antigravity -ErrorAction SilentlyContinue | ForEach-Object { $wins[[int]$_.Id]=[int64]$_.MainWindowHandle }",
    "$cim=@(Get-CimInstance Win32_Process -Filter \"Name='Antigravity.exe'\" -ErrorAction SilentlyContinue)",
    "if ($cim.Count -gt 0) {",
    "  $list=@($cim | ForEach-Object {",
    "    $id=[int]$_.ProcessId",
    "    $hwnd=if($wins.ContainsKey($id)){$wins[$id]}else{[int64]0}",
    "    [pscustomobject]@{ Id=$id; MainWindowHandle=$hwnd; Path=$_.ExecutablePath; CommandLine=$_.CommandLine }",
    "  })",
    "} else {",
    "  $list=@(Get-Process -Name Antigravity -ErrorAction SilentlyContinue | ForEach-Object {",
    "    [pscustomobject]@{ Id=[int]$_.Id; MainWindowHandle=[int64]$_.MainWindowHandle; Path=$_.Path; CommandLine='' }",
    "  })",
    "}",
    "ConvertTo-Json -InputObject $list -Compress",
  ].join("; ");
  const encoded = Buffer.from(psScript, "utf16le").toString("base64");
  const { stdout } = await exec(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
    { windowsHide: true, timeout: 10000, encoding: "utf8" }
  );
  const parsed = JSON.parse(stdout.replace(/^\uFEFF/, "").trim() || "[]");
  const items = (Array.isArray(parsed) ? parsed : [parsed]).map((item) => ({
    ...item,
    MainWindowHandle: Number(item.MainWindowHandle || 0),
    ...classifyAntigravityCommand(item.CommandLine),
  }));
  if (!process.env.AGY_INSTALL_PATH) return items;
  const expected = path.join(process.env.AGY_INSTALL_PATH, "Antigravity.exe").toLowerCase();
  return items.filter((item) => !item.Path || item.Path.toLowerCase() === expected);
}

async function cleanupOrphanProcesses(orphans) {
  if (!orphans.length) return;
  if (process.platform === "win32") {
    const args = ["/F", "/T", ...orphans.flatMap((item) => ["/PID", String(item.Id)])];
    await exec("taskkill.exe", args, { windowsHide: true, timeout: 10000 }).catch(() => {});
  } else if (process.platform === "darwin") {
    for (const item of orphans) {
      await exec("/bin/kill", ["-9", String(item.pid)], { timeout: 5000 }).catch(() => {});
    }
  }
}

export async function clientProcesses() {
  if (process.platform === "win32") {
    const raw = await inspectWindowsRawProcesses();
    const { active, orphans } = filterActiveClientProcesses(raw);
    if (orphans.length > 0) {
      await cleanupOrphanProcesses(orphans);
    }
    return active;
  }
  if (process.platform !== "darwin") throw new Error("不支持此系统的客户端退出操作。");
  const { stdout } = await exec("/bin/ps", ["-axo", "pid=,args="], { timeout: 5000 });
  const raw = stdout.split("\n").flatMap((line) => {
    const match = line.trim().match(/^(\d+)\s+(.+?\.app)\/Contents\/MacOS\/Antigravity(?:\s+(.*))?$/);
    if (!match) return [];
    const argsText = match[3] || "";
    return [{ pid: Number(match[1]), app: match[2], ...classifyAntigravityCommand(argsText) }];
  });
  const filtered = !process.env.AGY_MAC_SOURCE
    ? raw
    : raw.filter((item) =>
        [path.resolve(process.env.AGY_MAC_SOURCE), path.join(os.homedir(), "Applications/Antigravity 中文.app")].includes(item.app)
      );
  const { active, orphans } = filterActiveClientProcesses(filtered);
  if (orphans.length > 0) {
    await cleanupOrphanProcesses(orphans);
  }
  return active;
}

async function requestClose() {
  if (process.platform === "win32") {
    const ids = (await clientProcesses()).map((item) => item.Id);
    if (!ids.length) return;
    const psClose = "$ids=ConvertFrom-Json $env:AGY_CLOSE_PIDS; Get-Process -Id $ids -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 -and (!$env:AGY_CLOSE_EXECUTABLE -or $_.Path -eq $env:AGY_CLOSE_EXECUTABLE) } | ForEach-Object { [void]$_.CloseMainWindow() }";
    await exec(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(psClose, "utf16le").toString("base64")],
      {
        env: {
          ...process.env,
          AGY_CLOSE_PIDS: JSON.stringify(ids),
          AGY_CLOSE_EXECUTABLE: process.env.AGY_INSTALL_PATH ? path.join(process.env.AGY_INSTALL_PATH, "Antigravity.exe") : "",
        },
        windowsHide: true,
        timeout: 10000,
      }
    ).catch(() => {});
  } else {
    const apps = [...new Set((await clientProcesses()).map((item) => item.app))];
    for (const app of apps) {
      await exec("/usr/bin/osascript", ["-l", "JavaScript", "-e", "function run(argv) { Application(argv[0]).quit(); }", app], { timeout: 10000 }).catch(() => {});
    }
  }
}

async function forceClose() {
  const processes = await clientProcesses();
  if (!processes.length) return;
  if (process.platform === "win32") {
    const args = ["/F", "/T", ...processes.flatMap((item) => ["/PID", String(item.Id)])];
    await exec("taskkill.exe", args, { windowsHide: true, timeout: 15000 }).catch(async (error) => {
      if ((await clientProcesses()).length) throw new Error(`强制关闭客户端失败：${error.message}`);
    });
  } else {
    for (const item of processes) await exec("/bin/kill", ["-9", String(item.pid)], { timeout: 5000 }).catch(() => {});
  }
}

async function askSilentRelaunchConfirmation() {
  const psPrompt = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "$msg = \"检测到 Antigravity 客户端已更新，需要重启窗口以自动完成中文汉化。`r`n`r`n请先保存当前窗口中的工作，点击【确定】立即关闭并重新打开中文版；点击【取消】暂不更新。\"",
    "$res = [System.Windows.Forms.MessageBox]::Show($msg, 'Antigravity 中文自动跟进', [System.Windows.Forms.MessageBoxButtons]::OKCancel, [System.Windows.Forms.MessageBoxIcon]::Information)",
    "[Console]::Write($res.ToString())",
  ].join("; ");
  const encoded = Buffer.from(psPrompt, "utf16le").toString("base64");
  const { stdout } = await exec(
    "powershell.exe",
    ["-NoProfile", "-STA", "-EncodedCommand", encoded],
    { windowsHide: true, timeout: 120000, encoding: "utf8" }
  );
  return stdout.trim() === "OK";
}

async function countMacVisibleWindows() {
  try {
    const script = 'tell application "System Events" to count (every window of (every process whose name is "Antigravity"))';
    const { stdout } = await exec("/usr/bin/osascript", ["-e", script], { timeout: 3000, encoding: "utf8" });
    const n = Number.parseInt(stdout.trim(), 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Windows only: whether Antigravity's "run in background" setting is on. */
export async function runsInBackground() {
  if (process.platform !== "win32" || !process.env.APPDATA) return false;
  try {
    const settings = JSON.parse(await readFile(path.join(process.env.APPDATA, "Antigravity", "app_storage.json"), "utf8"));
    return String(settings.runInBackground) === "true";
  } catch {
    return false;
  }
}

export async function closeClientForChanges({ owned = false } = {}) {
  if (!owned && process.platform === "win32" && process.env.AGY_SILENT_LAUNCH === "1") {
    const current = await clientProcesses();
    if (!current.length) return;
    const hasVisibleWin = current.some((p) => Number(p.MainWindowHandle) !== 0);
    if (!hasVisibleWin) {
      await closeWithPolicy({ running: async () => (await clientProcesses()).length > 0, requestClose, forceClose, owned: true });
      return;
    }
    const confirmed = await askSilentRelaunchConfirmation();
    if (!confirmed) {
      const cancelled = new CloseCancelledError("已取消本次更新，未修改任何安装文件。");
      cancelled.silentUserCancelled = true;
      throw cancelled;
    }
    await closeWithPolicy({ running: async () => (await clientProcesses()).length > 0, requestClose, forceClose, owned: true });
    return;
  }

  let exitHint;
  if (process.platform === "win32") {
    exitHint = (await runsInBackground())
      ? "提示：你开启了“后台运行”，直接关闭窗口即可自动识别并继续汉化，也可按 Ctrl+Q 退出。"
      : "提示：直接关闭 Antigravity 窗口或按 Ctrl+Q 退出后将自动继续。";
  } else {
    exitHint = "请在 Antigravity 中按 ⌘Q 完全退出（关闭全部窗口后也会自动继续）。";
  }

  let hadVisibleWindow = false;
  let zeroWindowConfirmCount = 0;

  const autoContinueWhen = async (stage) => {
    if (process.platform === "win32") {
      const list = await clientProcesses();
      if (!list.length) return null;
      const visibleNow = list.some((p) => Number(p.MainWindowHandle) !== 0);
      if (visibleNow) {
        hadVisibleWindow = true;
        zeroWindowConfirmCount = 0;
        return null;
      }
      if (stage === "initial" && process.stdin.isTTY) {
        return "检测到 Antigravity 当前未打开窗口（仅后台托盘驻留），正在结束后台进程并继续…";
      }
      if (hadVisibleWindow) {
        zeroWindowConfirmCount += 1;
        if (zeroWindowConfirmCount >= 2) {
          return "检测到你已关闭 Antigravity 窗口，正在结束后台驻留进程并继续…";
        }
      }
      return null;
    }
    if (process.platform === "darwin") {
      const winCount = await countMacVisibleWindows();
      if (winCount === null) return null;
      if (winCount > 0) {
        hadVisibleWindow = true;
        zeroWindowConfirmCount = 0;
        return null;
      }
      if (hadVisibleWindow && winCount === 0) {
        zeroWindowConfirmCount += 1;
        if (zeroWindowConfirmCount >= 2) {
          return "检测到你已关闭 Antigravity 窗口，正在请求应用退出并继续…";
        }
      }
    }
    return null;
  };

  await closeWithPolicy({
    running: async () => (await clientProcesses()).length > 0,
    requestClose,
    forceClose,
    exitHint,
    owned,
    autoContinueWhen,
  });
}

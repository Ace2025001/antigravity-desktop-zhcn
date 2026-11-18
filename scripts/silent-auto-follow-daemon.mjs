// Started by the patched client when it quits (--post-quit), e.g. after the
// user clicks "restart to update". If the installer replaces the client files
// within a few minutes, the new version is localized right away according to
// the "客户端更新后怎么处理" setting; see src/lib/auto-follow-decision.mjs.
// A normal quit without an update just ends after the wait.
import { execFile, spawn } from "node:child_process";
import { appendFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { decideAutoFollow } from "../src/lib/auto-follow-decision.mjs";
import { toVbsAsciiExpr } from "../src/lib/auto-follow-task.mjs";
import { clientProcesses } from "../src/lib/close-client.mjs";
import { inspectInstallation } from "../src/lib/installation.mjs";
import { getStateRoot, projectRoot } from "../src/lib/paths.mjs";
import { readInstallState } from "../src/lib/state.mjs";
import { readUserSettings } from "../src/lib/user-settings.mjs";

const execFileAsync = promisify(execFile);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const mode = process.argv[2] || "";
const daemonDir = () => path.join(getStateRoot(), "daemon");
const INSTALL_WAIT_MS = 3 * 60 * 1000;
const POLL_MS = 5000;

async function logDaemon(message) {
  try {
    await mkdir(daemonDir(), { recursive: true });
    await appendFile(path.join(daemonDir(), "auto-follow.log"), `[${new Date().toISOString()}] [${mode}] ${message}\n`, "utf8");
  } catch {
    // Logging is best effort.
  }
}

async function readJson(file) {
  try { return JSON.parse(await readFile(file, "utf8")); } catch { return null; }
}

async function acquireLock(lockPath) {
  try {
    const info = await stat(lockPath);
    if (Date.now() - info.mtimeMs < 10 * 60 * 1000) return false;
    await rm(lockPath, { force: true });
  } catch {
    // No existing lock.
  }
  try {
    await mkdir(path.dirname(lockPath), { recursive: true });
    await writeFile(lockPath, String(process.pid), { flag: "wx" });
    return true;
  } catch {
    return false;
  }
}

/** Run the localizer in a visible window so the user sees what is happening. */
function runVisibleAutoFollowUpdate(extraArgs, installRoot) {
  const env = { ...process.env, AGY_INSTALL_PATH: installRoot };
  const script = path.join(projectRoot, "scripts", "auto-follow-update.mjs");
  const parts = [process.execPath, script, ...extraArgs];
  // "start" opens a new console the localizer writes to; "!" or quotes would break the command line.
  if (parts.some((part) => /[!"]/.test(part))) return runAutoFollowUpdate(extraArgs, installRoot);
  const quoted = parts.map((part) => `"${part}"`).join(" ");
  const line = `/d /v:on /s /c "start "Antigravity 汉化" /wait ${quoted} & exit !errorlevel!"`;
  return new Promise((resolve) => {
    const child = spawn("cmd.exe", [line], { env, windowsVerbatimArguments: true, windowsHide: true, stdio: "ignore" });
    child.once("error", () => resolve(1));
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

async function notify(message) {
  const file = path.join(os.tmpdir(), `agy-zhcn-note-${process.pid}.vbs`);
  const vbs = `MsgBox ${toVbsAsciiExpr(message)}, 48 + 4096, ${toVbsAsciiExpr("Antigravity 汉化包")}`;
  await writeFile(file, `${vbs}\r\n`, "ascii");
  await execFileAsync("wscript.exe", ["//NoLogo", file], { timeout: 24 * 60 * 60 * 1000 }).catch(() => {});
  await rm(file, { force: true }).catch(() => {});
}

function runAutoFollowUpdate(extraArgs, installRoot) {
  const env = { ...process.env, AGY_INSTALL_PATH: installRoot };
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(projectRoot, "scripts", "auto-follow-update.mjs"), ...extraArgs], { env, stdio: "ignore", windowsHide: true });
    child.once("error", () => resolve(1));
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

/** Yes/No dialog via WScript (pure-ASCII VBS so it works on any Windows locale). */
async function askUser(version) {
  const message = `已检测到 Antigravity 客户端更新${version ? `（${version}）` : ""}，界面变回了英文。\n\n是否现在一键汉化？\n\n选“是”会打开汉化窗口；如果客户端正在运行，会先提示你保存并退出。\n选“否”则这个版本不再提醒，需要时可双击“启动中文”。`;
  const vbs = `WScript.Quit MsgBox(${toVbsAsciiExpr(message)}, 4 + 32 + 4096, ${toVbsAsciiExpr("Antigravity 汉化包")})\r\n`;
  const file = path.join(os.tmpdir(), `agy-zhcn-ask-${process.pid}.vbs`);
  await writeFile(file, vbs, "ascii");
  try {
    await execFileAsync("wscript.exe", ["//NoLogo", file], { windowsHide: false, timeout: 24 * 60 * 60 * 1000 });
    return "error";
  } catch (error) {
    if (error.code === 6) return "yes"; // vbYes
    if (error.code === 7) return "no"; // vbNo
    return "error";
  } finally {
    await rm(file, { force: true }).catch(() => {});
  }
}

function openVisibleLauncher() {
  const packDir = process.env.AGY_LANGUAGE_PACK;
  const launcher = packDir ? path.join(path.dirname(packDir), "win启动", "启动中文.bat") : null;
  if (!launcher) return false;
  spawn("cmd.exe", ["/c", "start", "\"\"", launcher], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  return true;
}

/** Cheap pre-check: skip hashing when app.asar has the same size and timestamp as last time. */
async function detectUpdate(state) {
  const asarPath = path.join(state.installRoot, "resources", "app.asar");
  const info = await stat(asarPath).catch(() => null);
  if (!info) return null;
  const seenPath = path.join(daemonDir(), "last-seen.json");
  const seen = await readJson(seenPath);
  if (seen && seen.size === info.size && seen.mtimeMs === info.mtimeMs && seen.patchedAsarSha256 === state.patchedAsarSha256 && seen.unchanged) return null;
  const inspection = await inspectInstallation({ env: { ...process.env, AGY_INSTALL_PATH: state.installRoot }, allowRemoteCompatibility: false }).catch(() => null);
  if (!inspection) return null;
  const unchanged = inspection.appAsarSha256 === state.patchedAsarSha256;
  await mkdir(daemonDir(), { recursive: true });
  await writeFile(seenPath, JSON.stringify({ size: info.size, mtimeMs: info.mtimeMs, patchedAsarSha256: state.patchedAsarSha256, unchanged }), "utf8").catch(() => {});
  return unchanged ? null : inspection;
}

async function asarStamp(state) {
  const info = await stat(path.join(state.installRoot, "resources", "app.asar")).catch(() => null);
  return info ? `${info.size}:${info.mtimeMs}` : "missing";
}

/** Wait until the installer has replaced app.asar and the file stops changing. */
async function waitForInstalledUpdate(state) {
  const initial = await asarStamp(state);
  let previous = initial;
  const deadline = Date.now() + INSTALL_WAIT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    const current = await asarStamp(state);
    if (current !== initial && current !== "missing" && current === previous) return true;
    previous = current;
  }
  return false;
}

async function takeOver(state) {
  const code = await runVisibleAutoFollowUpdate(["--owned-restart"], state.installRoot);
  await logDaemon(`接管更新后重启的客户端并汉化，退出码 ${code}`);
  if (code !== 0) await notify("客户端已更新，但自动汉化没有完成。\n\n请双击 win启动 里的“启动中文”重新汉化。");
}

async function main() {
  if (mode !== "--post-quit") return; // Only the client's quit hook starts this script.
  const { settings } = await readUserSettings();
  if (settings.autoFollow === "off") return;
  const state = await readInstallState().catch(() => null);
  if (!state || state.status !== "installed" || !state.installRoot || !state.patchedAsarSha256) return;

  // A quit without an update ends here once the wait is over.
  if (!(await waitForInstalledUpdate(state))) return;
  await logDaemon("客户端退出后文件已被替换，开始检查新版本。");
  const update = await detectUpdate(state);
  if (!update) {
    await logDaemon("新文件与已汉化版本一致或无法识别，不处理。");
    return;
  }

  const lockPath = path.join(daemonDir(), "auto-follow.lock");
  if (!(await acquireLock(lockPath))) return;
  try {
    await sleep(8000); // "restart to update" relaunches the client right after installing
    const declinedPath = path.join(daemonDir(), "declined.json");
    const declined = (await readJson(declinedPath))?.appAsarSha256 === update.appAsarSha256;
    const running = (await clientProcesses().catch(() => [])).length > 0;
    const action = decideAutoFollow({ autoFollow: settings.autoFollow, updated: true, running, postQuit: true, declined });
    await logDaemon(`检测到客户端 ${update.packageVersion}，设置=${settings.autoFollow}，运行中=${running}，处理=${action}`);

    if (action === "localize") {
      // The client stayed closed (the update was installed on quit): localize quietly.
      const code = await runAutoFollowUpdate(["--no-launch", "--abort-if-running"], state.installRoot);
      await logDaemon(`后台汉化完成，退出码 ${code}`);
      if (code === 3) await takeOver(state); // the client was relaunched meanwhile
    } else if (action === "take-over") {
      await takeOver(state);
    } else if (action === "ask") {
      const answer = await askUser(update.packageVersion);
      if (answer === "yes") {
        await logDaemon(openVisibleLauncher() ? "用户选择一键汉化，已打开汉化窗口。" : "用户选择一键汉化，但未找到启动中文入口。");
      } else if (answer === "error") {
        await logDaemon("提示窗口未能正常显示。");
      } else {
        await writeFile(declinedPath, JSON.stringify({ appAsarSha256: update.appAsarSha256, version: update.packageVersion, at: new Date().toISOString() }), "utf8").catch(() => {});
        await logDaemon("用户选择暂不汉化，此版本不再提醒。");
      }
    }
  } finally {
    await rm(lockPath, { force: true }).catch(() => {});
  }
}

main().catch(async (error) => {
  await logDaemon(`出错：${error?.message ?? error}`);
  process.exitCode = 0;
});

// Started by the patched client when it quits (--post-quit), e.g. after the
// user clicks "restart to update". If the installer replaces the client files
// within a few minutes, the new version is localized right away according to
// the "客户端更新后怎么处理" setting; see src/lib/auto-follow-decision.mjs.
// A normal quit without an update just ends after the wait.
import { execFile, spawn } from "node:child_process";
import { appendFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { decideAutoFollow } from "../src/lib/auto-follow-decision.mjs";
import { clientProcesses } from "../src/lib/close-client.mjs";
import { inspectInstallation } from "../src/lib/installation.mjs";
import {
  getClientFollowDialogSpec,
  getPackExitDialogSpec,
  getWarnNotifyDialogSpec,
  showModernWindowsDialog,
} from "../src/lib/modern-dialog.mjs";
import { getStateRoot, projectRoot } from "../src/lib/paths.mjs";
import { readInstallState } from "../src/lib/state.mjs";
import { readUserSettings } from "../src/lib/user-settings.mjs";
import {
  checkLatestRelease,
  performSelfUpdate,
  readLocalPackVersion,
  readPackUpdateState,
  resolvePackRootFromCore,
  writePackUpdateState,
} from "../src/lib/self-update.mjs";

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
  await showModernWindowsDialog(getWarnNotifyDialogSpec({ message })).catch(() => {});
}

function runAutoFollowUpdate(extraArgs, installRoot) {
  const env = { ...process.env, AGY_INSTALL_PATH: installRoot };
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(projectRoot, "scripts", "auto-follow-update.mjs"), ...extraArgs], { env, stdio: "ignore", windowsHide: true });
    child.once("error", () => resolve(1));
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

async function askUser(version) {
  try {
    return await showModernWindowsDialog(getClientFollowDialogSpec({ version }));
  } catch {
    return "error";
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
export async function waitForInstalledUpdate(
  state,
  initialStamp = null,
  { getAsarStamp = asarStamp, pollMs = POLL_MS, maxWaitMs = INSTALL_WAIT_MS } = {},
) {
  const initial = initialStamp || (await getAsarStamp(state));
  let previous = initial;
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const current = await getAsarStamp(state);
    if (current !== initial && current !== "missing" && current === previous) return true;
    previous = current;
    await sleep(pollMs);
  }
  return false;
}

async function takeOver(state) {
  const code = await runVisibleAutoFollowUpdate(["--owned-restart"], state.installRoot);
  await logDaemon(`接管更新后重启的客户端并汉化，退出码 ${code}`);
  if (code !== 0) await notify("客户端已更新，但自动汉化没有完成。\n\n请双击 win启动 里的“启动中文”重新汉化。");
}

async function askPackUpdate(currentVersion, latestVersion) {
  try {
    return await showModernWindowsDialog(getPackExitDialogSpec({ currentVersion, latestVersion }));
  } catch {
    return "error";
  }
}

export async function waitForClientsClosed(
  state,
  initialAsarStamp,
  maxMs = 30_000,
  { getAsarStamp = asarStamp, listProcesses = clientProcesses, pollMs = 1000 } = {},
) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (state?.installRoot && initialAsarStamp && (await getAsarStamp(state)) !== initialAsarStamp) {
      return { closed: false, clientUpdatedDuringWait: true };
    }
    const procs = await listProcesses().catch(() => []);
    if (procs.length === 0) return { closed: true, clientUpdatedDuringWait: false };
    await sleep(pollMs);
  }
  const clientUpdatedDuringWait = Boolean(state?.installRoot && initialAsarStamp && (await getAsarStamp(state)) !== initialAsarStamp);
  const procs = await listProcesses().catch(() => []);
  return { closed: !clientUpdatedDuringWait && procs.length === 0, clientUpdatedDuringWait };
}

async function maybeApplyPendingOrRemotePackUpdate(settings, state, initialAsarStamp) {
  const packState = await readPackUpdateState().catch(() => ({}));
  if (packState?.pendingMainUpdate && state?.installRoot) {
    const waitRes = await waitForClientsClosed(state, initialAsarStamp, 30_000);
    if (waitRes.clientUpdatedDuringWait) {
      await logDaemon("等待期间检测到客户端文件变化，优先交给客户端更新跟进。");
      return false;
    }
    if (waitRes.closed) {
      const code = await runAutoFollowUpdate(["--no-launch", "--abort-if-running"], state.installRoot);
      await logDaemon(`退出后补齐待升级主进程补丁，退出码 ${code}`);
      if (code === 0) {
        await writePackUpdateState({ pendingMainUpdate: null }).catch(() => {});
      }
      return true;
    }
  }

  const packMode = settings?.packAutoUpdate || "ask";
  if (packMode === "off") return false;
  const packRoot = resolvePackRootFromCore(projectRoot);
  if (!packRoot) return false;
  const lastQuitAt = packState?.lastQuitCheckAt ? Date.parse(packState.lastQuitCheckAt) : 0;
  if (Number.isFinite(lastQuitAt) && Date.now() - lastQuitAt < 6 * 60 * 60 * 1000) return false;
  if (state?.installRoot && initialAsarStamp && (await asarStamp(state)) !== initialAsarStamp) return false;

  await writePackUpdateState({ lastQuitCheckAt: new Date().toISOString() }).catch(() => {});
  const currentVersion = await readLocalPackVersion(projectRoot);
  const check = await checkLatestRelease({ currentVersion, timeoutMs: 4000 }).catch(() => ({ ok: false }));
  if (!check.ok || !check.hasUpdate) return false;
  if (state?.installRoot && initialAsarStamp && (await asarStamp(state)) !== initialAsarStamp) return false;

  if ((await clientProcesses().catch(() => [])).length > 0) return false;
  if (packMode === "ask") {
    if (packState?.skippedVersion === check.latestVersion) return false;
    if (packState?.snoozedVersion === check.latestVersion && Number(packState?.snoozedUntil) > Date.now()) return false;
    const answer = await askPackUpdate(currentVersion, check.latestVersion);
    if (answer !== "yes") {
      if (answer === "no") {
        await writePackUpdateState({ skippedVersion: check.latestVersion }).catch(() => {});
      } else {
        await writePackUpdateState({
          snoozedVersion: check.latestVersion,
          snoozedUntil: Date.now() + 24 * 60 * 60 * 1000,
        }).catch(() => {});
      }
      return false;
    }
  }

  if (state?.installRoot && initialAsarStamp && (await asarStamp(state)) !== initialAsarStamp) return false;
  const res = await performSelfUpdate({ packRoot, coreRoot: projectRoot }).catch((err) => ({ status: "error", reason: err.message }));
  await logDaemon(`退出后检查汉化包更新结果：${JSON.stringify(res)}`);
  if (state?.installRoot && initialAsarStamp && (await asarStamp(state)) !== initialAsarStamp) return false;
  if (res?.status === "updated" && state?.installRoot && (await clientProcesses().catch(() => [])).length === 0) {
    const code = await runAutoFollowUpdate(["--no-launch", "--abort-if-running"], state.installRoot);
    await logDaemon(`汉化包升级至 v${res.latestVersion} 后后台应用完成，退出码 ${code}`);
  }
  return true;
}

async function main() {
  if (mode !== "--post-quit") return; // Only the client's quit hook starts this script.
  const { settings } = await readUserSettings();
  let state = await readInstallState().catch(() => null);
  const initialAsarStamp = state?.installRoot ? await asarStamp(state) : "missing";

  if (state && state.status === "installed" && state.installRoot) {
    await maybeApplyPendingOrRemotePackUpdate(settings, state, initialAsarStamp);
    state = (await readInstallState().catch(() => null)) || state;
  }

  if (settings.autoFollow === "off") return;
  if (!state || state.status !== "installed" || !state.installRoot || !state.patchedAsarSha256) return;

  // A quit without an update ends here once the wait is over.
  if (!(await waitForInstalledUpdate(state, initialAsarStamp))) return;
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
      } else if (answer === "no") {
        await writeFile(declinedPath, JSON.stringify({ appAsarSha256: update.appAsarSha256, version: update.packageVersion, at: new Date().toISOString() }), "utf8").catch(() => {});
        await logDaemon("用户选择此版本不提醒，已记录。");
      } else {
        await logDaemon("用户选择稍后再说。");
      }
    }
  } finally {
    await rm(lockPath, { force: true }).catch(() => {});
  }
}

const isEntrypoint = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  main().catch(async (error) => {
    await logDaemon(`出错：${error?.message ?? error}`);
    process.exitCode = 0;
  });
}

import { spawn } from "node:child_process";
import { appendFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { clientProcesses } from "../src/lib/close-client.mjs";
import { inspectInstallation } from "../src/lib/installation.mjs";
import { getStateRoot, projectRoot } from "../src/lib/paths.mjs";
import { readInstallState } from "../src/lib/state.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mode = process.argv[2] || "--periodic";

async function logDaemon(msg) {
  try {
    const logDir = path.join(getStateRoot(), "daemon");
    await mkdir(logDir, { recursive: true });
    const line = `[${new Date().toISOString()}] [${mode}] ${msg}\n`;
    await appendFile(path.join(logDir, "auto-follow.log"), line, "utf8");
  } catch {
    // Ignore log errors
  }
}

async function acquireLock(lockPath) {
  try {
    const info = await stat(lockPath);
    if (Date.now() - info.mtimeMs < 10 * 60 * 1000) {
      return false;
    }
    await rm(lockPath, { force: true });
  } catch {
    // No existing lock
  }
  try {
    await mkdir(path.dirname(lockPath), { recursive: true });
    await writeFile(lockPath, String(process.pid), { flag: "wx" });
    return true;
  } catch {
    return false;
  }
}

async function runAutoFollowUpdate(extraArgs = [], installRoot) {
  const scriptPath = path.join(projectRoot, "scripts", "auto-follow-update.mjs");
  const env = { ...process.env };
  if (installRoot) env.AGY_INSTALL_PATH = installRoot;
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath, ...extraArgs], {
      env,
      stdio: "ignore",
      windowsHide: true,
    });
    child.once("error", () => resolve(1));
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

async function main() {
  const state = await readInstallState().catch(() => null);
  if (!state || state.status !== "installed" || !state.installRoot || !state.patchedAsarSha256) {
    return;
  }

  const maxChecks = mode === "--post-quit" ? 7 : 1;
  if (mode === "--post-quit") {
    await sleep(6000);
  }

  let detectedUpdate = null;
  for (let i = 0; i < maxChecks; i++) {
    const inspection = await inspectInstallation({
      env: { ...process.env, AGY_INSTALL_PATH: state.installRoot },
      allowRemoteCompatibility: false,
    }).catch(() => null);

    if (inspection && inspection.appAsarSha256 !== state.patchedAsarSha256) {
      detectedUpdate = inspection;
      break;
    }
    if (i + 1 < maxChecks) {
      await sleep(5000);
    }
  }

  if (!detectedUpdate) {
    return;
  }

  const lockPath = path.join(getStateRoot(), "daemon", "auto-follow.lock");
  if (!(await acquireLock(lockPath))) {
    return;
  }

  try {
    const running = await clientProcesses().catch(() => []);
    if (running.length === 0) {
      await logDaemon(`检测到客户端已更新至 ${detectedUpdate.packageVersion}（客户端未运行），开始后台静默自动汉化…`);
      const code = await runAutoFollowUpdate(["--no-launch"], state.installRoot);
      await logDaemon(`后台静默自动汉化完成，退出码: ${code}`);
      return;
    }

    if (mode === "--post-quit") {
      await logDaemon(`检测到客户端点击“重启以更新”升级至 ${detectedUpdate.packageVersion}，开始自动无缝接管汉化并重开中文界面…`);
      const code = await runAutoFollowUpdate(["--owned-restart"], state.installRoot);
      await logDaemon(`重启更新接管完成，退出码: ${code}`);
      return;
    }

    // Periodic check while user is actively running an unpatched updated client:
    // Never forcefully kill an active working session; wait for next close or idle.
    await logDaemon(`检测到客户端已更新至 ${detectedUpdate.packageVersion}，但当前窗口正在运行中，为保护工作连续性暂不强关，将在关闭后自动完成汉化。`);
  } finally {
    await rm(lockPath, { force: true }).catch(() => {});
  }
}

main().catch(() => {
  process.exitCode = 0;
});

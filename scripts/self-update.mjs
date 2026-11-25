import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clientProcesses } from "../src/lib/close-client.mjs";
import { inspectInstallation } from "../src/lib/installation.mjs";
import { getStateRoot } from "../src/lib/paths.mjs";
import { readInstallState } from "../src/lib/state.mjs";
import {
  checkLatestRelease,
  performSelfUpdate,
  readLocalPackVersion,
  resolvePackRootFromCore,
  writePackHookMetadata,
  writePackUpdateState,
} from "../src/lib/self-update.mjs";

const coreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check-only");
const dryRun = args.has("--dry-run");
const force = args.has("--force");
const restartRequested = args.has("--restart");
const quiet = args.has("--quiet");
const fromClient = args.has("--from-client");

function log(msg) {
  if (!quiet) console.log(msg);
}

function runNodeScript(nodePath, scriptPath, scriptArgs, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn(nodePath, [scriptPath, ...scriptArgs], {
      env: { ...process.env, ...extraEnv },
      stdio: quiet ? "ignore" : "inherit",
      windowsHide: true,
    });
    child.once("error", () => resolve(1));
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

function spawnDetachedRelaunch(nodePath, scriptPath, extraEnv = {}) {
  const child = spawn(nodePath, [scriptPath, "--owned-restart"], {
    env: { ...process.env, ...extraEnv },
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

async function resolveBundledNode(packRoot) {
  const rel = process.platform === "win32" ? path.join("win启动", "配套程序", "node.exe") : path.join("mac启动", "配套程序", "node");
  const candidate = path.join(packRoot, rel);
  try {
    await access(candidate);
    return candidate;
  } catch {
    return process.execPath;
  }
}

async function main() {
  const packRootArgIndex = process.argv.indexOf("--pack-root");
  const explicitPackRoot = packRootArgIndex >= 0 ? process.argv[packRootArgIndex + 1] : undefined;
  const packRoot = explicitPackRoot || resolvePackRootFromCore(coreRoot);

  if (checkOnly) {
    const currentVersion = await readLocalPackVersion(coreRoot);
    const check = await checkLatestRelease({ currentVersion });
    console.log(JSON.stringify(check, null, 2));
    return;
  }

  if (!packRoot) {
    console.error("自更新未执行：当前脚本未处于标准 汉化包/语言包/核心程序 目录结构中。");
    process.exitCode = 1;
    return;
  }

  const result = await performSelfUpdate({ packRoot, coreRoot, dryRun, force });
  if (result.status === "check-failed") {
    log(`检查新版本未完成（${result.reason}），保持当前版本 v${result.currentVersion || "未知"}。`);
    return;
  }
  if (result.status === "up-to-date") {
    log(`当前汉化包已是最新版本 v${result.currentVersion}。`);
    return;
  }
  if (result.status === "update-available") {
    log(`发现新版本 v${result.latestVersion}（当前 v${result.currentVersion}），下载地址：${result.releaseUrl}`);
    return;
  }

  log(`汉化包目录已从 v${result.previousVersion} 更新至 v${result.latestVersion}。`);
  const langDir = path.join(packRoot, "语言包");
  const newCoreRoot = path.join(langDir, "核心程序");
  const nodePath = await resolveBundledNode(packRoot);
  const env = { AGY_LANGUAGE_PACK: langDir, AGY_SILENT_LAUNCH: "1" };

  await writePackHookMetadata({
    coreRoot: newCoreRoot,
    languagePackDir: langDir,
    nodePath,
    packVersion: result.latestVersion,
  }).catch(() => {});

  if (process.platform === "win32") {
    const state = await readInstallState().catch(() => null);
    if (!state || state.status !== "installed" || !state.installRoot) {
      log("本机尚未汉化客户端，后续请运行一次“启动中文”。");
      return;
    }
    env.AGY_INSTALL_PATH = state.installRoot;
    const running = (await clientProcesses().catch(() => [])).length > 0;
    if (!running) {
      const code = await runNodeScript(nodePath, path.join(newCoreRoot, "scripts", "auto-follow-update.mjs"), ["--no-launch"], env);
      if (code === 0) {
        await writePackUpdateState({ pendingMainUpdate: null }, getStateRoot()).catch(() => {});
        log(`客户端已同步升级到最新汉化版 v${result.latestVersion}。`);
      } else {
        log(`完整应用返回退出码 ${code}，请稍后双击“启动中文”完成应用。`);
      }
      return;
    }

    if (restartRequested) {
      await writePackUpdateState({ pendingMainUpdate: { version: result.latestVersion, at: new Date().toISOString() } }, getStateRoot()).catch(() => {});
      spawnDetachedRelaunch(nodePath, path.join(newCoreRoot, "scripts", "auto-follow-update.mjs"), env);
      log("已启动独立重应用进程，将在退出当前客户端后自动升级并重新打开中文版。");
      return;
    }

    // Client is running: hot-update UI bundle safely without killing current Antigravity session,
    // and queue full main-process patch for the quit hook.
    const hotCode = await runNodeScript(nodePath, path.join(newCoreRoot, "scripts", "hot-update.mjs"), [], env);
    await writePackUpdateState({
      pendingMainUpdate: { version: result.latestVersion, at: new Date().toISOString() },
    }, getStateRoot()).catch(() => {});
    if (hotCode === 0) {
      log("已无感热更新中文界面（“查看 → 重新加载”后立即可见）；主进程补丁已预约在下次退出客户端时后台自动完成。");
    } else {
      log("当前未能热更新（可能客户端刚升级了大版本）；已预约在下次退出客户端时自动全量升级，或手动双击“启动中文”。");
    }
    return;
  }

  if (process.platform === "darwin") {
    const { runningMacApps } = await import("../src/lib/macos.mjs");
    const running = (await runningMacApps().catch(() => [])).some((a) => String(a.executable).includes("Antigravity 中文.app"));
    if (!running) {
      const code = await runNodeScript(nodePath, path.join(newCoreRoot, "scripts", "macos.mjs"), ["install-auto"], env);
      if (code === 0) {
        log(`Mac 中文副本已更新并重签至 v${result.latestVersion}。`);
      } else {
        log(`本地包已更新至 v${result.latestVersion}；请运行 mac启动/启动中文.command 完成安装或重签。`);
      }
      return;
    }
    await writePackUpdateState({
      pendingMainUpdate: { version: result.latestVersion, at: new Date().toISOString() },
    }, getStateRoot()).catch(() => {});
    if (fromClient || !restartRequested) {
      log(`本地汉化包已更新至 v${result.latestVersion}，请按 ⌘Q 退出并重新打开一次“启动中文.command”以完成副本重签。`);
    }
  }
}

main().catch((err) => {
  console.error(`自更新失败：${err?.message ?? err}`);
  process.exitCode = 1;
});

import path from "node:path";
import { spawn } from "node:child_process";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { getStateRoot, projectRoot } from "../src/lib/paths.mjs";
import { resolveInteractiveInstallation } from "../src/lib/install-discovery.mjs";
import { ensureAutoShortcuts } from "../src/lib/auto-shortcuts.mjs";
import { askFirstRunSettings, runSettingsMenu } from "../src/lib/settings-prompts.mjs";
import { banner, failure, finish, formatElapsed, info, runTimedTask, step } from "../src/lib/console-ui.mjs";
import { maybeShowCompletionDialog } from "../src/lib/completion-dialog.mjs";
import { readUserSettings } from "../src/lib/user-settings.mjs";

const packageVersion = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8")).version;

const FOLLOW_SUMMARY = {
  auto: "以后在客户端里点更新后，会自动跟着重新汉化。",
  ask: "以后在客户端里点更新后，会弹窗问你是否一键汉化。",
  off: "以后客户端更新后，双击“启动中文”即可重新汉化。",
};

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === "EPERM";
  }
}

async function acquireSilentLaunchLock() {
  if (process.env.AGY_SILENT_LAUNCH !== "1" || process.platform !== "win32") return null;
  const lockFile = path.join(getStateRoot(), "silent-launch.lock");
  try {
    const info = await stat(lockFile);
    if (Date.now() - info.mtimeMs < 120_000) {
      const existingPid = Number.parseInt((await readFile(lockFile, "utf8")).trim(), 10);
      if (existingPid !== process.pid && isPidAlive(existingPid)) {
        return false;
      }
    }
    await rm(lockFile, { force: true });
  } catch {
    // No existing lock
  }
  try {
    await mkdir(path.dirname(lockFile), { recursive: true });
    await writeFile(lockFile, String(process.pid), { flag: "wx" });
    return lockFile;
  } catch {
    return false;
  }
}

let silentLockFile = null;
const launchStartedAt = Date.now();
try {
  const action = process.argv[2];
  const dryVerify = process.argv.includes("--dry-verify");
  if (!["start", "restore", "settings"].includes(action)) throw new Error("请使用启动中文、恢复英文或汉化设置入口。");
  if (action === "settings") {
    process.exitCode = await runSettingsMenu();
    process.exit(process.exitCode);
  }

  if (!dryVerify) {
    silentLockFile = await acquireSilentLaunchLock();
    if (silentLockFile === false) {
      process.exit(0);
    }
  }

  if (!dryVerify) banner(`Antigravity 汉化包 v${packageVersion}  ·  ${action === "start" ? "启动中文" : "恢复英文"}`);
  if (action === "start" && !dryVerify) await askFirstRunSettings();

  step("检查客户端");
  const selected = await runTimedTask({
    label: "正在查找本机 Antigravity…",
    doneText: "已定位客户端",
    work: () => resolveInteractiveInstallation(),
  });
  if (dryVerify) {
    process.exit(0);
  }
  const mac = process.platform === "darwin";
  const env = { ...process.env, [mac ? "AGY_MAC_SOURCE" : "AGY_INSTALL_PATH"]: selected };
  const args = mac
    ? [path.join(projectRoot, "scripts/macos.mjs"), action]
    : action === "start"
      ? [path.join(projectRoot, "scripts/auto-follow-update.mjs")]
      : [path.join(projectRoot, "src/cli.mjs"), "restore"];
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { env, stdio: "inherit", windowsHide: true });
    child.once("error", reject);
    child.once("exit", (value) => resolve(value ?? 1));
  });
  process.exitCode = code;
  const totalElapsed = formatElapsed(Math.max(0, Math.floor((Date.now() - launchStartedAt) / 1000)));
  if (code === 0 && action === "start") {
    try {
      await ensureAutoShortcuts(selected);
    } catch (error) {
      info(`后台设置未能完成：${error.message}。汉化本身已完成。`);
    }
    const { settings } = await readUserSettings();
    finish(`完成！Antigravity 已切换为中文（总用时 ${totalElapsed}）`, [
      process.platform === "win32" ? FOLLOW_SUMMARY[settings.autoFollow] : "以后客户端更新后，双击“启动中文”即可重新汉化。",
      "需要修改设置时，双击“汉化设置”。",
      "觉得好用的话，欢迎去 GitHub 点一颗免费 Star 支持：https://github.com/Ace2025001/antigravity-desktop-zhcn",
    ]);
    await maybeShowCompletionDialog({ action, exitCode: code, dryVerify });
  } else if (code === 0 && action === "restore") {
    finish(`已恢复英文原版（用时 ${totalElapsed}）`, ["想再用中文时，双击“启动中文”即可。"]);
  }
} catch (error) {
  failure(error.message, "保留这个窗口里的信息，确认客户端安装正常后重试；仍不行可到 GitHub 提交问题反馈。");
  process.exitCode = 1;
} finally {
  if (typeof silentLockFile === "string") {
    await rm(silentLockFile, { force: true }).catch(() => {});
  }
}

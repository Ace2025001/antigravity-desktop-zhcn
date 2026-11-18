import path from "node:path";
import { spawn } from "node:child_process";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { getStateRoot, projectRoot } from "../src/lib/paths.mjs";
import { resolveInteractiveInstallation } from "../src/lib/install-discovery.mjs";
import { ensureAutoShortcuts } from "../src/lib/auto-shortcuts.mjs";

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
try {
  const action = process.argv[2];
  const dryVerify = process.argv.includes("--dry-verify");
  if (!["start", "restore"].includes(action)) throw new Error("请使用启动中文或恢复英文入口。");

  if (!dryVerify) {
    silentLockFile = await acquireSilentLaunchLock();
    if (silentLockFile === false) {
      process.exit(0);
    }
  }

  console.log("正在查找本机 Antigravity，并检查安装位置，请稍候…");
  const progress = setInterval(() => console.log("仍在查找或等待客户端选择，请勿重复打开启动器…"), 10000);
  let selected;
  try {
    selected = await resolveInteractiveInstallation();
  } finally {
    clearInterval(progress);
  }
  console.log("客户端位置已确认，正在检查版本、汉化状态和语言包…");
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
  if (code === 0 && action === "start") {
    try {
      await ensureAutoShortcuts(selected);
    } catch (error) {
      console.log(`中文启动已完成，但快捷方式未能创建：${error.message}。仍可使用启动中文。`);
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (typeof silentLockFile === "string") {
    await rm(silentLockFile, { force: true }).catch(() => {});
  }
}

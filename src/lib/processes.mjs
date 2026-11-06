import { execFile, spawn } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function launchAntigravity(executablePath) {
  if (process.platform === "win32") {
    await new Promise((resolve, reject) => {
      const child = spawn(executablePath, [], {
        cwd: path.dirname(executablePath),
        detached: true,
        stdio: "ignore",
        windowsHide: false,
      });
      child.once("error", reject);
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    });
    return;
  }

  if (process.platform === "darwin") {
    const appIndex = executablePath.indexOf(".app");
    const appPath = appIndex >= 0 ? executablePath.slice(0, appIndex + 4) : executablePath;
    await new Promise((resolve, reject) => {
      const child = spawn("/usr/bin/open", ["-a", appPath], {
        detached: true,
        stdio: "ignore",
      });
      child.once("error", reject);
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    });
    return;
  }

  throw new Error("自动启动 Antigravity 仅支持 Windows 和 macOS。");
}

export async function isAntigravityRunning() {
  if (process.platform === "win32") {
    try {
      const { stdout } = await execFileAsync(
        "tasklist.exe",
        ["/FI", "IMAGENAME eq Antigravity.exe", "/FO", "CSV", "/NH"],
        { windowsHide: true, encoding: "utf8" },
      );
      return /"Antigravity\.exe"/i.test(stdout);
    } catch {
      return false;
    }
  }

  if (process.platform === "darwin") {
    try {
      const { stdout } = await execFileAsync("pgrep", ["-f", "Antigravity.app"], {
        encoding: "utf8",
      });
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  return false;
}

export async function waitForAntigravityExit({
  timeoutMs = 180_000,
  pollIntervalMs = 1_000,
} = {}) {
  const startedAt = Date.now();
  while (await isAntigravityRunning()) {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error("等待 Antigravity 退出超时，未修改任何安装文件。");
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

export async function gracefulCloseAntigravity({ maxWaitMs = 5_000 } = {}) {
  if (!(await isAntigravityRunning())) return;

  if (process.platform === "win32") {
    // 1. 优先尝试温和请求关闭（不带 /F 强制终止），给 Electron 机会落盘与持久化状态
    await execFileAsync("taskkill.exe", ["/T", "/IM", "Antigravity.exe"], {
      windowsHide: true,
    }).catch(() => {});

    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      if (!(await isAntigravityRunning())) return;
    }

    // 2. 超时未响应时才兜底强制终止
    await execFileAsync(
      "taskkill.exe",
      ["/F", "/T", "/IM", "Antigravity.exe"],
      { windowsHide: true },
    ).catch((error) => {
      if (error?.code !== 128) throw error;
    });
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    return;
  }

  if (process.platform === "darwin") {
    // 1. 优先尝试温和请求关闭（通过 AppleScript 发送 quit）
    await execFileAsync(
      "osascript",
      ["-e", 'tell application "Antigravity" to quit'],
      { encoding: "utf8" },
    ).catch(() => {});

    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      if (!(await isAntigravityRunning())) return;
    }

    // 2. 超时未响应时兜底强制终止所有相关进程（包含 Helper 等）
    await execFileAsync("pkill", ["-f", "Antigravity.app"]).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    return;
  }
}


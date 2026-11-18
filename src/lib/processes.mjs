import { clientProcesses, closeClientForChanges } from "./close-client.mjs";
import { spawn } from "node:child_process";
import path from "node:path";

export async function launchAntigravity(executablePath) {
  if (process.platform !== "win32") {
    throw new Error("自动启动 Antigravity 仅支持 Windows。");
  }

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
}

export async function isAntigravityRunning() {
  if (process.platform !== "win32" && process.platform !== "darwin") {
    return false;
  }

  try {
    return (await clientProcesses()).length > 0;
  } catch {
    return false;
  }
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

export async function gracefulCloseAntigravity({ owned = false } = {}) {
  await closeClientForChanges({ owned });
}

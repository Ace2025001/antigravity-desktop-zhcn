import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";

export const exec = promisify(execFile);
export const macStateRoot = path.join(os.homedir(), "Library", "Application Support", "AntigravityZhcnMac");
export const macUserData = path.join(os.homedir(), "Library", "Application Support", "Antigravity");
export const macAppPath = path.join(os.homedir(), "Applications", "Antigravity 中文.app");

export function macResources(appPath) {
  return path.join(appPath, "Contents", "Resources");
}

// Electron's embedded integrity value covers the ASAR JSON header, not the file.
export function asarHeaderHash(buffer) {
  if (buffer.length < 16) throw new Error("ASAR 文件头不完整。");
  const length = buffer.readUInt32LE(12);
  if (length < 1 || length > 16 * 1024 * 1024 || 16 + length > buffer.length) {
    throw new Error("ASAR 文件头尺寸异常。");
  }
  JSON.parse(buffer.subarray(16, 16 + length).toString("utf8"));
  return createHash("sha256").update(buffer.subarray(16, 16 + length)).digest("hex");
}

export async function findMacOriginal() {
  const candidates = process.env.AGY_MAC_SOURCE
    ? [path.resolve(process.env.AGY_MAC_SOURCE)]
    : ["/Applications/Antigravity.app", path.join(os.homedir(), "Applications", "Antigravity.app")];
  for (const candidate of candidates) {
    try {
      if (candidate === macAppPath) throw new Error("不能将中文副本作为官方原版。");
      await access(path.join(macResources(candidate), "app.asar"));
      await access(path.join(candidate, "Contents", "MacOS", "Antigravity"));
      return candidate;
    } catch { /* Try the next official installation. */ }
  }
  throw new Error("未找到 Antigravity Desktop Mac 版；可用 AGY_MAC_SOURCE 指定原版 .app。");
}

export async function findMacUiPort() {
  const log = await readFile(path.join(os.homedir(), "Library", "Logs", "Antigravity", "main.log"), "utf8");
  return [...log.matchAll(/Local:\s+https:\/\/127\.0\.0\.1:(\d+)\//g)].at(-1)?.[1] ?? null;
}

export async function signMacApp(appPath, { execFile = exec } = {}) {
  const plistPath = path.join(appPath, "Contents", "Info.plist");
  const archive = await readFile(path.join(macResources(appPath), "app.asar"));
  const { stdout } = await execFile("/usr/bin/plutil", ["-extract", "ElectronAsarIntegrity", "json", "-o", "-", plistPath]);
  const integrity = JSON.parse(stdout);
  if (integrity["Resources/app.asar"]?.algorithm !== "SHA256") {
    throw new Error("Mac 原版 ASAR 校验配置发生变化，拒绝签名。");
  }
  integrity["Resources/app.asar"].hash = asarHeaderHash(archive);
  await execFile("/usr/bin/plutil", ["-replace", "ElectronAsarIntegrity", "-json", JSON.stringify(integrity), plistPath]);
  await execFile("/usr/bin/plutil", ["-replace", "CFBundleDisplayName", "-string", "Antigravity 中文", plistPath]);
  // Sign the entire bundle copy (--deep) with its entitlements so dyld never
  // rejects Google-signed nested frameworks against the ad-hoc main binary.
  await execFile("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", "--preserve-metadata=entitlements", appPath], { timeout: 120_000 });
  await execFile("/usr/bin/codesign", ["--verify", "--deep", "--strict", appPath], { timeout: 120_000 });
}

export async function runningMacApps() {
  const { stdout } = await exec("/bin/ps", ["-axo", "pid=,args="]);
  const raw = stdout.split("\n").flatMap((line) => {
    const match = line.trim().match(/^(\d+)\s+(.+?\.app\/Contents\/MacOS\/Antigravity)(?:\s+(.*))?$/);
    if (!match) return [];
    const argsText = match[3] || "";
    const isSidecar = /sidecar_sdk|--import=/i.test(argsText);
    const isSubprocess = /(?:^|\s)--type=[^\s]+/i.test(argsText);
    return [{ pid: Number(match[1]), executable: match[2], isMainApp: !isSidecar && !isSubprocess }];
  });
  const hasMain = raw.some((item) => item.isMainApp);
  if (!hasMain) {
    for (const orphan of raw) {
      await exec("/bin/kill", ["-9", String(orphan.pid)], { timeout: 5000 }).catch(() => {});
    }
    return [];
  }
  return raw.filter((item) => item.isMainApp).map(({ pid, executable }) => ({ pid, executable }));
}

export async function requireMacAppsClosed() {
  if ((await runningMacApps()).length) {
    throw new Error("请先保存工作并通过 ⌘Q 退出 Antigravity，再重试；不会强制结束任何任务。");
  }
}

export async function openMacApp(appPath) {
  await exec("/usr/bin/open", ["-n", appPath]);
}

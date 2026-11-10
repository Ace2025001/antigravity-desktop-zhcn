import https from "node:https";
import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { sha256Buffer, sha256File } from "./hash.mjs";
import { getAntigravityUserDataRoot, getStateRoot } from "./paths.mjs";

const MAX_BUNDLE_BYTES = 50 * 1024 * 1024;

// This Windows x64 build ships main.js in a ZIP inside language_server.exe.
const WINDOWS_230_EMBEDDED_UI = {
  asarSha256: "00153A89EA4D870D192B7BEACAE2C26057FA6D698AB8EE777017105C582E60EE",
  entryOffset: 168_770_270,
  compressedSize: 3_478_740,
  size: 11_711_794,
  sha256: "35E0DA21894A7F6560075EAE2501C88FEDE5204EB6067FAC2653E2C7A63DC403",
};

export async function readEmbeddedWindowsUi(inspection) {
  const target = WINDOWS_230_EMBEDDED_UI;
  if (inspection.packageVersion !== "2.30.0" || inspection.appAsarSha256 !== target.asarSha256) return null;

  const executable = path.join(path.dirname(inspection.appAsarPath), "bin", "language_server.exe");
  const file = await open(executable, "r");
  try {
    const entry = Buffer.alloc(37 + target.compressedSize);
    const { bytesRead } = await file.read(entry, 0, entry.length, target.entryOffset);
    if (bytesRead !== entry.length ||
        entry.readUInt32LE(0) !== 0x04034b50 ||
        entry.readUInt16LE(6) !== 0 ||
        entry.readUInt16LE(8) !== 8 ||
        entry.readUInt32LE(18) !== target.compressedSize ||
        entry.readUInt32LE(22) !== target.size ||
        entry.readUInt16LE(26) !== 7 ||
        entry.readUInt16LE(28) !== 0 ||
        entry.toString("ascii", 30, 37) !== "main.js") {
      throw new Error("本机内置界面资源结构与已验证构建不一致。");
    }
    const buffer = inflateRawSync(entry.subarray(37), { maxOutputLength: target.size });
    if (buffer.length !== target.size || sha256Buffer(buffer) !== target.sha256) {
      throw new Error("本机内置界面资源校验失败。");
    }
    return { buffer, source: "embedded" };
  } finally {
    await file.close();
  }
}

export async function findLatestUiPort() {
  const logPath = path.join(getAntigravityUserDataRoot(), "logs", "main.log");
  let log;
  try {
    log = await readFile(logPath, "utf8");
  } catch {
    return null;
  }

  const matches = [...log.matchAll(/Local:\s+https:\/\/127\.0\.0\.1:(\d+)\//g)];
  return matches.at(-1)?.[1] ?? null;
}

export async function fetchUiBundle(port) {
  if (!/^\d{1,5}$/.test(String(port))) {
    throw new Error("Antigravity UI 端口无效。");
  }

  return new Promise((resolve, reject) => {
    const request = https.get(
      {
        hostname: "127.0.0.1",
        port: Number(port),
        path: "/main.js",
        method: "GET",
        rejectUnauthorized: false,
        timeout: 15_000,
      },
      (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`读取运行时 UI 失败：HTTP ${response.statusCode}`));
          return;
        }

        const chunks = [];
        let totalBytes = 0;
        response.on("data", (chunk) => {
          totalBytes += chunk.length;
          if (totalBytes > MAX_BUNDLE_BYTES) {
            request.destroy(new Error("运行时 UI 文件异常过大，已停止读取。"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => resolve(Buffer.concat(chunks)));
        response.on("error", reject);
      },
    );
    request.on("timeout", () => request.destroy(new Error("读取运行时 UI 超时。")));
    request.on("error", reject);
  });
}

export function inspectUiBundle(buffer) {
  return {
    sha256: sha256Buffer(buffer),
    size: buffer.length,
  };
}

export function getCachedBundlePath(target) {
  return path.join(
    getStateRoot(),
    "cache",
    target.appVersion,
    target.uiBundleSha256,
    "main.js",
  );
}

export async function loadCompatibleUiBundle(target, { allowLiveFetch = true } = {}) {
  const cachedPath = getCachedBundlePath(target);
  try {
    const cachedHash = await sha256File(cachedPath);
    if (cachedHash === target.uiBundleSha256) {
      const buffer = await readFile(cachedPath);
      if (buffer.length === target.uiBundleSize) {
        return { buffer, source: "cache", path: cachedPath };
      }
    }
  } catch {
    // Cache is optional.
  }

  if (!allowLiveFetch) {
    throw new Error("没有找到与当前版本匹配的 UI 缓存，请先运行 Antigravity。");
  }

  const port = await findLatestUiPort();
  if (!port) {
    throw new Error("没有找到运行中的 Antigravity UI 端口，请先打开 Antigravity。");
  }

  const buffer = await fetchUiBundle(port);
  const inspected = inspectUiBundle(buffer);
  if (
    inspected.sha256 !== target.uiBundleSha256 ||
    inspected.size !== target.uiBundleSize
  ) {
    throw new Error(
      `运行时 UI 指纹不匹配：${inspected.sha256} (${inspected.size} bytes)。`,
    );
  }

  await mkdir(path.dirname(cachedPath), { recursive: true });
  await writeFile(cachedPath, buffer, { flag: "w" });
  return { buffer, source: "live", path: cachedPath };
}

export async function waitForCompatibleUiBundle(
  target,
  { timeoutMs = 120_000, pollIntervalMs = 1_000 } = {},
) {
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      return await loadCompatibleUiBundle(target);
    } catch (error) {
      if (/指纹不匹配|异常过大/.test(error.message)) {
        throw error;
      }
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(
    "等待 Antigravity 主界面加载超时。请确认客户端已正常进入主界面。",
    { cause: lastError },
  );
}

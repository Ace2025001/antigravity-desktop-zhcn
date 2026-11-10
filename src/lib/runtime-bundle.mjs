import https from "node:https";
import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { crc32, inflateRawSync } from "node:zlib";
import { sha256Buffer, sha256File } from "./hash.mjs";
import { getAntigravityUserDataRoot, getStateRoot } from "./paths.mjs";

const MAX_BUNDLE_BYTES = 50 * 1024 * 1024;
const MIN_BUNDLE_BYTES = 500_000;
const ZIP_LOCAL_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const ENTRY_NAME = "main.js";
// Stable UI strings that must appear in the real desktop UI bundle.
const UI_MARKERS = ["New Conversation", "Automations", "Plugins", "Settings"];

/**
 * Find every ZIP local-file entry named exactly `main.js` in a binary buffer.
 * Exported for tests; the caller decides how many candidates are acceptable.
 */
export function findEmbeddedUiEntries(buffer, baseOffset = 0) {
  const entries = [];
  let index = buffer.indexOf(ZIP_LOCAL_HEADER);
  while (index >= 0) {
    if (index + 30 <= buffer.length) {
      const nameLength = buffer.readUInt16LE(index + 26);
      const nameEnd = index + 30 + nameLength;
      if (nameLength === ENTRY_NAME.length && nameEnd <= buffer.length &&
          buffer.toString("latin1", index + 30, nameEnd) === ENTRY_NAME) {
        entries.push({
          offset: baseOffset + index,
          flags: buffer.readUInt16LE(index + 6),
          method: buffer.readUInt16LE(index + 8),
          crc: buffer.readUInt32LE(index + 14),
          compressedSize: buffer.readUInt32LE(index + 18),
          size: buffer.readUInt32LE(index + 22),
          nameLength,
          extraLength: buffer.readUInt16LE(index + 28),
        });
      }
    }
    index = buffer.indexOf(ZIP_LOCAL_HEADER, index + 1);
  }
  return entries;
}

/** Decode and validate one embedded entry. Returns the UI buffer or a reason string. */
export function decodeEmbeddedUiEntry(entry, data) {
  // Bit 0: encrypted. Bit 3: sizes live in a trailing descriptor, so the header is unusable.
  if (entry.flags & 0b1001) return { reason: "压缩条目带加密或延迟尺寸标记" };
  if (entry.method !== 0 && entry.method !== 8) return { reason: `不支持的压缩方式 ${entry.method}` };
  if (entry.size < MIN_BUNDLE_BYTES || entry.size > MAX_BUNDLE_BYTES) return { reason: `界面文件尺寸异常（${entry.size} 字节）` };
  if (data.length !== entry.compressedSize) return { reason: "压缩数据不完整" };
  let buffer;
  try {
    buffer = entry.method === 8 ? inflateRawSync(data, { maxOutputLength: entry.size }) : Buffer.from(data);
  } catch (error) {
    return { reason: `解压失败：${error.message}` };
  }
  if (buffer.length !== entry.size) return { reason: "解压后尺寸与记录不一致" };
  if (crc32(buffer) !== entry.crc) return { reason: "CRC 校验失败" };
  const text = buffer.toString("utf8");
  const missing = UI_MARKERS.filter((marker) => !text.includes(marker));
  if (missing.length) return { reason: `缺少界面标记：${missing.join("、")}` };
  return { buffer };
}

/**
 * Read the original UI bundle that Windows builds embed in a ZIP inside
 * bin/language_server.exe. No version allow-list: the entry is located by
 * name, verified by its ZIP CRC and by UI markers, and the patcher's own
 * structural gate still runs afterwards. Returns null to fall back to the
 * running client when the layout is absent or ambiguous.
 */
export async function readEmbeddedWindowsUi(inspection, { log = console.log } = {}) {
  const executable = path.join(path.dirname(inspection.appAsarPath), "bin", "language_server.exe");
  let file;
  try {
    file = await open(executable, "r");
  } catch {
    return null;
  }
  try {
    const { size } = await file.stat();
    const chunkSize = 16 * 1024 * 1024;
    const overlap = 64;
    const candidates = [];
    for (let position = 0; position < size; position += chunkSize - overlap) {
      const chunk = Buffer.alloc(Math.min(chunkSize, size - position));
      const { bytesRead } = await file.read(chunk, 0, chunk.length, position);
      for (const entry of findEmbeddedUiEntries(chunk.subarray(0, bytesRead), position)) {
        if (!candidates.some((item) => item.offset === entry.offset)) candidates.push(entry);
      }
      if (position + chunk.length >= size) break;
    }
    if (candidates.length !== 1) {
      if (candidates.length > 1) log(`安装目录中找到 ${candidates.length} 份界面资源，无法确定使用哪一份，改为从客户端读取。`);
      return null;
    }
    const [entry] = candidates;
    const data = Buffer.alloc(entry.compressedSize);
    const dataOffset = entry.offset + 30 + entry.nameLength + entry.extraLength;
    const { bytesRead } = await file.read(data, 0, data.length, dataOffset);
    const result = decodeEmbeddedUiEntry(entry, data.subarray(0, bytesRead));
    if (!result.buffer) {
      log(`安装目录中的界面资源未通过校验（${result.reason}），改为从客户端读取。`);
      return null;
    }
    return { buffer: result.buffer, source: "embedded" };
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

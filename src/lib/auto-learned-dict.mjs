import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const AUTO_LEARNED_DICT_FILENAME = "auto-learned-translations.json";

export function resolveCrossPlatformStateRoot() {
  if (process.env.AGY_ZHCN_STATE_DIR) {
    return path.resolve(process.env.AGY_ZHCN_STATE_DIR);
  }
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, "AntigravityZhcn");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "AntigravityZhcn");
  }
  return path.join(os.homedir(), ".local", "share", "AntigravityZhcn");
}

export function getAutoLearnedDictPath() {
  return path.join(resolveCrossPlatformStateRoot(), AUTO_LEARNED_DICT_FILENAME);
}

export async function readAutoLearnedDict() {
  const filePath = getAutoLearnedDictPath();
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const exact = parsed.exact && typeof parsed.exact === "object" ? parsed.exact : parsed;
      const clean = {};
      for (const [k, v] of Object.entries(exact)) {
        if (typeof k === "string" && typeof v === "string" && k.trim() && v.trim()) {
          clean[k] = v;
        }
      }
      return clean;
    }
  } catch {
    // Return empty dict if file doesn't exist yet or is malformed
  }
  return {};
}

export async function mergeAutoLearnedEntries(newEntries) {
  if (!newEntries || typeof newEntries !== "object") return 0;
  const validEntries = Object.entries(newEntries).filter(
    ([k, v]) => typeof k === "string" && typeof v === "string" && k.trim().length > 0 && v.trim().length > 0
  );
  if (validEntries.length === 0) return 0;

  const filePath = getAutoLearnedDictPath();
  await mkdir(path.dirname(filePath), { recursive: true });
  const current = await readAutoLearnedDict();
  let addedOrUpdated = 0;
  for (const [k, v] of validEntries) {
    if (current[k] !== v) {
      current[k] = v;
      addedOrUpdated += 1;
    }
  }
  if (addedOrUpdated === 0) return 0;

  const payload = JSON.stringify(
    {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      count: Object.keys(current).length,
      exact: current,
    },
    null,
    2
  );
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(tempPath, `${payload}\n`, "utf8");
    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
  return addedOrUpdated;
}

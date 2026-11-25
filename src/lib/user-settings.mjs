// User-facing switches chosen on first run and editable via “汉化设置”.
// The patched client's main process reads the same file (see patcher.mjs),
// so the directory logic here must stay in sync with getZhcnSettingsDir there.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const AUTO_FOLLOW_MODES = Object.freeze(["auto", "ask", "off"]);
export const PACK_UPDATE_MODES = Object.freeze(["auto", "ask", "off"]);
export const DEFAULT_SETTINGS = Object.freeze({
  autoFollow: "auto",
  packAutoUpdate: "auto",
  onlineTranslate: true,
  titleAutoTranslate: true,
  titleWriteBack: false,
});
const SETTINGS_FILE = "settings.json";

export function getSettingsDir(env = process.env, platform = process.platform) {
  if (env.AGY_ZHCN_STATE_DIR) return path.resolve(env.AGY_ZHCN_STATE_DIR);
  if (platform === "win32") {
    if (!env.LOCALAPPDATA) throw new Error("环境变量 LOCALAPPDATA 不存在。");
    return path.join(env.LOCALAPPDATA, "AntigravityZhcn");
  }
  if (platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "AntigravityZhcn");
  return path.join(os.homedir(), ".antigravity-zhcn");
}

export function getSettingsPath(env = process.env, platform = process.platform) {
  return path.join(getSettingsDir(env, platform), SETTINGS_FILE);
}

function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  const text = String(value ?? "").trim().toLowerCase();
  if (["1", "true", "on", "yes", "开启", "开"].includes(text)) return true;
  if (["0", "false", "off", "no", "关闭", "关"].includes(text)) return false;
  return undefined;
}

/** Merge stored values over defaults, migrating legacy onlineTranslate flags cleanly.
 *  When upgrading an existing settings payload that predates packAutoUpdate, keep
 *  packAutoUpdate at "ask" rather than opting existing users into silent downloads. */
export function normalizeSettings(raw = {}, { legacyExisting = null } = {}) {
  const settings = { ...DEFAULT_SETTINGS };
  const autoFollow = String(raw.autoFollow ?? "").trim().toLowerCase();
  if (AUTO_FOLLOW_MODES.includes(autoFollow)) settings.autoFollow = autoFollow;
  const packAutoUpdate = String(raw.packAutoUpdate ?? "").trim().toLowerCase();
  if (PACK_UPDATE_MODES.includes(packAutoUpdate)) {
    settings.packAutoUpdate = packAutoUpdate;
  } else if (
    raw.packAutoUpdate === undefined &&
    (legacyExisting === true || (legacyExisting === null && raw && typeof raw === "object" && Object.keys(raw).length > 0))
  ) {
    settings.packAutoUpdate = "ask";
  }
  // UI online fill-in. A settings file written before this switch existed (or by
  // v3.1.4–v3.1.5, which dropped it) stays off until the user is asked once.
  const online = parseBoolean(raw.onlineTranslate);
  if (online !== undefined) {
    settings.onlineTranslate = online;
  } else if (legacyExisting === true || (legacyExisting === null && raw && typeof raw === "object" && Object.keys(raw).length > 0)) {
    settings.onlineTranslate = false;
  }
  const titleAuto = parseBoolean(raw.titleAutoTranslate);
  if (titleAuto !== undefined) {
    settings.titleAutoTranslate = titleAuto;
  } else {
    const legacyOnline = parseBoolean(raw.onlineTranslate);
    const legacyTitles = parseBoolean(raw.autoTranslateTitles);
    if (legacyOnline === false || legacyTitles === false) {
      settings.titleAutoTranslate = false;
    }
  }
  const writeBack = parseBoolean(raw.titleWriteBack);
  if (writeBack !== undefined) settings.titleWriteBack = writeBack;
  return settings;
}

/** Environment overrides for unattended installs (AI agents, scripts). */
export function settingsFromEnv(env = process.env) {
  const overrides = {};
  const mode = String(env.AGY_AUTO_FOLLOW ?? "").trim().toLowerCase();
  if (AUTO_FOLLOW_MODES.includes(mode)) overrides.autoFollow = mode;
  const packMode = String(env.AGY_PACK_AUTO_UPDATE ?? "").trim().toLowerCase();
  if (PACK_UPDATE_MODES.includes(packMode)) overrides.packAutoUpdate = packMode;
  const online = parseBoolean(env.AGY_ONLINE_TRANSLATE);
  if (online !== undefined) overrides.onlineTranslate = online;
  const titleAuto = parseBoolean(env.AGY_TITLE_AUTO_TRANSLATE);
  if (titleAuto !== undefined) {
    overrides.titleAutoTranslate = titleAuto;
  } else {
    const legacyOnline = online;
    const legacyTitles = parseBoolean(env.AGY_AUTO_TRANSLATE_TITLES);
    if (legacyOnline !== undefined || legacyTitles !== undefined) {
      overrides.titleAutoTranslate = legacyOnline !== false && legacyTitles !== false;
    }
  }
  return overrides;
}

/** Returns { settings, exists, needsPackAutoUpdatePrompt, needsOnlineTranslatePrompt } — exists is false before the first-run questions. */
export async function readUserSettings({ env = process.env, platform = process.platform } = {}) {
  try {
    const raw = JSON.parse(await readFile(getSettingsPath(env, platform), "utf8"));
    const hasPackUpdate = typeof raw?.packAutoUpdate === "string" && PACK_UPDATE_MODES.includes(raw.packAutoUpdate.trim().toLowerCase());
    return {
      settings: normalizeSettings(raw, { legacyExisting: true }),
      exists: true,
      needsPackAutoUpdatePrompt: !hasPackUpdate,
      needsOnlineTranslatePrompt: parseBoolean(raw?.onlineTranslate) === undefined,
    };
  } catch (error) {
    if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    return { settings: { ...DEFAULT_SETTINGS }, exists: false, needsPackAutoUpdatePrompt: false, needsOnlineTranslatePrompt: false };
  }
}

export async function writeUserSettings(settings, { env = process.env, platform = process.platform } = {}) {
  const normalized = normalizeSettings(settings);
  const target = getSettingsPath(env, platform);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify({ schemaVersion: 1, ...normalized, updatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
  await rename(temporary, target);
  return normalized;
}

export function describeSettings(settings, platform = process.platform) {
  const follow = { auto: "自动汉化", ask: "先问我", off: "不处理" }[settings.autoFollow];
  const packUpdate = { auto: "自动更新", ask: "先问我", off: "关闭" }[settings.packAutoUpdate];
  const lines = [];
  if (platform === "win32") lines.push(`客户端更新后：${follow}`);
  lines.push(`汉化包自动更新：${packUpdate}`);
  lines.push(`界面联网补充翻译：${settings.onlineTranslate ? "开启" : "关闭"}`);
  lines.push(`标题自动翻译：${settings.titleAutoTranslate ? "开启" : "关闭"}`);
  return lines;
}

export const AUTO_FOLLOW_QUESTION = [
  "【设置】客户端更新后怎么处理？",
  "  Antigravity 自动更新后会变回英文。",
  "  1. 自动汉化：在客户端里点更新后，自动跟着重新汉化（推荐）",
  "  2. 先问我：更新完成后弹窗问你是否一键汉化",
  "  3. 不处理：需要时自己双击“启动中文”",
];

export const PACK_AUTO_UPDATE_QUESTION = [
  "【设置】是否自动检查并更新汉化包？",
  "  打开或退出 Antigravity 时自动核对 GitHub 最新汉化包并做 SHA-256 校验。",
  "  界面词库全部来自人工精校汉化包，更新后可第一时间补齐新版本翻译。",
  "  1. 自动更新：发现新版本时自动更新（推荐）",
  "  2. 先问我：检查到新版本后弹窗询问是否更新",
  "  3. 关闭：不联网检查汉化包更新",
];

export const ONLINE_TRANSLATE_QUESTION = [
  "【设置】是否开启界面联网补充翻译？",
  "  Antigravity 更新后常会多出新功能和新按钮，汉化包还没来得及收录时会显示英文。",
  "  开启后，这些还没收录的界面文字会通过谷歌翻译临时显示成中文；等汉化包收录了人工译文，会自动换成人工译文。",
  "  只发送界面上的按钮、菜单、提示文字；对话内容、代码、终端输出、文件名、链接、路径、账号信息和你输入的内容都不会发送。",
  "  1. 开启（推荐）   2. 关闭（未收录的文字保持英文）",
];

export const TITLE_AUTO_TRANSLATE_QUESTION = [
  "【设置】是否开启对话标题自动翻译？",
  "  Antigravity 生成的新对话标题默认为英文，开启后自动将纯英文标题译成中文。",
  "  手动重命名过的对话会自动保留原名。",
  "  1. 开启（推荐）   2. 关闭（保持所有对话标题为原语言）",
];

/** Parse a menu answer; empty input picks the default. Returns undefined for invalid input. */
export function parseChoice(answer, map, fallback) {
  const text = String(answer ?? "").trim();
  if (!text) return fallback;
  return Object.hasOwn(map, text) ? map[text] : undefined;
}

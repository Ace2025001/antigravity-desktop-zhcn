// User-facing switches chosen on first run and editable via “汉化设置”.
// The patched client's main process reads the same file (see patcher.mjs),
// so the directory logic here must stay in sync with getZhcnSettingsDir there.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const AUTO_FOLLOW_MODES = Object.freeze(["auto", "ask", "off"]);
export const DEFAULT_SETTINGS = Object.freeze({
  autoFollow: "auto",
  onlineTranslate: true,
  titleWriteBack: false,
  // null = follow defaultDesktopShortcut(); true/false = user's explicit choice.
  desktopShortcut: null,
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

/** Merge stored values over defaults, ignoring anything malformed. */
export function normalizeSettings(raw = {}) {
  const settings = { ...DEFAULT_SETTINGS };
  if (AUTO_FOLLOW_MODES.includes(raw.autoFollow)) settings.autoFollow = raw.autoFollow;
  const online = parseBoolean(raw.onlineTranslate);
  if (online !== undefined) settings.onlineTranslate = online;
  const writeBack = parseBoolean(raw.titleWriteBack);
  if (writeBack !== undefined) settings.titleWriteBack = writeBack;
  const desktop = parseBoolean(raw.desktopShortcut);
  if (desktop !== undefined) settings.desktopShortcut = desktop;
  return settings;
}

/** Environment overrides for unattended installs (AI agents, scripts). */
export function settingsFromEnv(env = process.env) {
  const overrides = {};
  const mode = String(env.AGY_AUTO_FOLLOW ?? "").trim().toLowerCase();
  if (AUTO_FOLLOW_MODES.includes(mode)) overrides.autoFollow = mode;
  const online = parseBoolean(env.AGY_ONLINE_TRANSLATE);
  if (online !== undefined) overrides.onlineTranslate = online;
  const desktop = parseBoolean(env.AGY_DESKTOP_SHORTCUT);
  if (desktop !== undefined) overrides.desktopShortcut = desktop;
  return overrides;
}

/** Returns { settings, exists } — exists is false before the first-run questions. */
export async function readUserSettings({ env = process.env, platform = process.platform } = {}) {
  try {
    const raw = JSON.parse(await readFile(getSettingsPath(env, platform), "utf8"));
    return { settings: normalizeSettings(raw), exists: true };
  } catch (error) {
    if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    return { settings: { ...DEFAULT_SETTINGS }, exists: false };
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

/** Desktop shortcut is redundant when Windows auto-follow already handles updates. */
export function defaultDesktopShortcut(settings, platform = process.platform) {
  return platform !== "win32" || settings.autoFollow !== "auto";
}

export function wantsDesktopShortcut(settings, platform = process.platform) {
  return typeof settings.desktopShortcut === "boolean" ? settings.desktopShortcut : defaultDesktopShortcut(settings, platform);
}

export function describeSettings(settings, platform = process.platform) {
  const follow = { auto: "自动汉化", ask: "先问我", off: "不处理" }[settings.autoFollow];
  const lines = [];
  if (platform === "win32") lines.push(`客户端更新后：${follow}`);
  lines.push(`联网补充翻译：${settings.onlineTranslate ? "开启" : "关闭"}`);
  lines.push(`桌面“Antigravity自动汉化”快捷方式：${wantsDesktopShortcut(settings, platform) ? "创建" : "不创建"}`);
  lines.push(`对话标题写回记录：${settings.titleWriteBack ? "开启" : "关闭（只在界面上显示中文）"}`);
  return lines;
}

export const AUTO_FOLLOW_QUESTION = [
  "【设置】客户端更新后怎么处理？",
  "  Antigravity 自动更新后会变回英文。",
  "  1. 自动汉化：检测到更新后在后台自动重新汉化，无需任何操作（推荐）",
  "  2. 先问我：检测到更新时弹窗提示“已检测到客户端更新，是否一键汉化？”",
  "  3. 不处理：需要时自己双击“启动中文”",
];

export const ONLINE_TRANSLATE_QUESTION = [
  "【设置】是否联网补充翻译？",
  "  汉化包已收录 1.6 万条译文，但客户端更新后可能出现新的英文。",
  "  开启后，遇到还没收录的英文会联网用谷歌翻译成中文，界面更完整。",
  "  只会发送界面上的文字和对话标题；对话内容、代码、文件和你输入的内容都不会发送。",
  "  机器翻译偶尔不够通顺。",
  "  1. 开启（推荐）   2. 关闭",
];

export function desktopShortcutQuestion(defaultYes) {
  return [
    "【设置】是否在桌面创建“Antigravity自动汉化”快捷方式？",
    "  用它打开 Antigravity 时，会先检查汉化是否有效，客户端更新过就自动重新汉化再打开。",
    ...(defaultYes
      ? ["  1. 创建（推荐）   2. 不创建"]
      : ["  已开启“自动汉化”时后台会自动处理更新，一般不需要。", "  1. 创建   2. 不创建（推荐）"]),
  ];
}

/** Parse a menu answer; empty input picks the default. Returns undefined for invalid input. */
export function parseChoice(answer, map, fallback) {
  const text = String(answer ?? "").trim();
  if (!text) return fallback;
  return Object.hasOwn(map, text) ? map[text] : undefined;
}

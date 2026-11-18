// First-run questions and the “汉化设置” menu. Both only talk to a real
// terminal; unattended runs (silent launcher, background task, AI agents)
// fall back to defaults plus AGY_* environment overrides.
import { createInterface } from "node:readline/promises";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { applyAutoFollowSetting } from "./auto-follow-task.mjs";
import { ensureAutoShortcuts } from "./auto-shortcuts.mjs";
import { getStateRoot } from "./paths.mjs";
import {
  AUTO_FOLLOW_QUESTION,
  ONLINE_TRANSLATE_QUESTION,
  defaultDesktopShortcut,
  describeSettings,
  desktopShortcutQuestion,
  parseChoice,
  readUserSettings,
  settingsFromEnv,
  writeUserSettings,
} from "./user-settings.mjs";

const AUTO_FOLLOW_CHOICES = { 1: "auto", 2: "ask", 3: "off" };
const YES_NO = { 1: true, 2: false };

async function ask(rl, lines, prompt, map, fallback) {
  console.log("");
  for (const line of lines) console.log(line);
  for (;;) {
    const value = parseChoice(await rl.question(prompt), map, fallback);
    if (value !== undefined) return value;
    console.log("输入无效，请重新输入。");
  }
}

function isInteractive(input = process.stdin, output = process.stdout) {
  return Boolean(input.isTTY && output.isTTY) && process.env.AGY_SILENT_LAUNCH !== "1";
}

/** Ask once, before the first localization. Existing settings are left untouched. */
export async function askFirstRunSettings({ platform = process.platform } = {}) {
  const { settings, exists } = await readUserSettings();
  if (exists) return settings;
  const chosen = { ...settings, ...settingsFromEnv() };
  if (isInteractive()) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      console.log("首次使用，先确认几项设置（之后可以随时在“汉化设置”里修改）。");
      if (platform === "win32") {
        chosen.autoFollow = await ask(rl, AUTO_FOLLOW_QUESTION, "请输入 1、2 或 3，直接回车选 1：", AUTO_FOLLOW_CHOICES, chosen.autoFollow);
      }
      chosen.onlineTranslate = await ask(rl, ONLINE_TRANSLATE_QUESTION, "请输入 1 或 2，直接回车选 1：", YES_NO, chosen.onlineTranslate);
      const desktopDefault = typeof chosen.desktopShortcut === "boolean" ? chosen.desktopShortcut : defaultDesktopShortcut(chosen, platform);
      chosen.desktopShortcut = await ask(rl, desktopShortcutQuestion(desktopDefault), `请输入 1 或 2，直接回车选 ${desktopDefault ? 1 : 2}：`, YES_NO, desktopDefault);
    } finally {
      rl.close();
    }
  }
  const saved = await writeUserSettings(chosen);
  console.log("");
  console.log("已保存设置：");
  for (const line of describeSettings(saved, platform)) console.log(`  ${line}`);
  console.log("");
  return saved;
}

async function rememberedClient() {
  try {
    return JSON.parse(await readFile(path.join(getStateRoot(), "selected-installation.json"), "utf8")).path ?? null;
  } catch {
    return null;
  }
}

/** Interactive settings editor. Returns a process exit code. */
export async function runSettingsMenu({ platform = process.platform } = {}) {
  if (!isInteractive()) {
    console.log("请双击“汉化设置”打开设置窗口。");
    return 1;
  }
  let { settings } = await readUserSettings();
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let changed = false;
  try {
    for (;;) {
      console.log("");
      console.log("===== Antigravity 汉化设置 =====");
      describeSettings(settings, platform).forEach((line, index) => console.log(`  ${index + 1}. ${line}`));
      console.log("  0. 保存并退出");
      const options = platform === "win32" ? ["autoFollow", "onlineTranslate", "desktopShortcut", "titleWriteBack"] : ["onlineTranslate", "desktopShortcut", "titleWriteBack"];
      const pick = (await rl.question("请输入要修改的序号：")).trim();
      if (pick === "0" || pick === "") break;
      const key = options[Number(pick) - 1];
      if (!key) { console.log("输入无效，请重新输入。"); continue; }
      if (key === "autoFollow") {
        settings.autoFollow = await ask(rl, AUTO_FOLLOW_QUESTION, "请输入 1、2 或 3：", AUTO_FOLLOW_CHOICES, settings.autoFollow);
      } else if (key === "onlineTranslate") {
        settings.onlineTranslate = await ask(rl, ONLINE_TRANSLATE_QUESTION, "请输入 1 或 2：", YES_NO, settings.onlineTranslate);
      } else if (key === "desktopShortcut") {
        const current = typeof settings.desktopShortcut === "boolean" ? settings.desktopShortcut : defaultDesktopShortcut(settings, platform);
        settings.desktopShortcut = await ask(rl, desktopShortcutQuestion(current), "请输入 1 或 2：", YES_NO, current);
      } else if (key === "titleWriteBack") {
        settings.titleWriteBack = await ask(rl, [
          "【高级】是否把中文对话标题写回对话记录？",
          "  关闭（推荐）：只在界面上显示中文，你的对话记录不变，恢复英文后标题自动变回原样。",
          "  开启：把翻译后的标题保存进对话记录，可能同步到你的账号，之后无法自动还原。",
          "  1. 开启   2. 关闭",
        ], "请输入 1 或 2：", YES_NO, settings.titleWriteBack);
      }
      changed = true;
    }
  } finally {
    rl.close();
  }
  if (!changed) { console.log("设置未改动。"); return 0; }
  settings = await writeUserSettings(settings);
  console.log("设置已保存。");
  if (platform === "win32") {
    const result = await applyAutoFollowSetting(settings).catch((error) => ({ registered: false, reason: error.message }));
    console.log(settings.autoFollow === "off" ? "已关闭后台检查。" : result.registered ? "后台检查已按新设置生效。" : `后台检查未能设置：${result.reason}`);
  }
  const client = await rememberedClient();
  if (client) {
    await ensureAutoShortcuts(client).catch((error) => console.log(`快捷方式未能更新：${error.message}`));
  } else {
    console.log("快捷方式设置会在下次运行“启动中文”时生效。");
  }
  console.log("联网补充翻译和标题设置会在重新打开 Antigravity 后生效，无需重新汉化。");
  return 0;
}

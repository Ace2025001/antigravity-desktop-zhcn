// First-run questions and the “汉化设置” menu. Both only talk to a real
// terminal; unattended runs (silent launcher, background task, AI agents)
// fall back to defaults plus AGY_* environment overrides.
import { createInterface } from "node:readline/promises";
import { SYMBOLS, banner, color } from "./console-ui.mjs";
import { applyAutoFollowSetting } from "./auto-follow-task.mjs";
import {
  AUTO_FOLLOW_QUESTION,
  PACK_AUTO_UPDATE_QUESTION,
  TITLE_AUTO_TRANSLATE_QUESTION,
  describeSettings,
  parseChoice,
  readUserSettings,
  settingsFromEnv,
  writeUserSettings,
} from "./user-settings.mjs";

const AUTO_OR_ASK_CHOICES = { 1: "auto", 2: "ask", 3: "off" };
const YES_NO = { 1: true, 2: false };

// Question title in bold with a “?” marker, description dimmed, options indented.
async function ask(rl, lines, prompt, map, fallback) {
  const [title, ...rest] = lines;
  console.log("");
  console.log(`  ${color.cyan("?")} ${color.bold(title.replace(/^【[^】]*】/, ""))}`);
  for (const line of rest) {
    const trimmed = line.trim();
    console.log(/^\d\./.test(trimmed) ? `    ${trimmed}` : `    ${color.dim(trimmed)}`);
  }
  for (;;) {
    const value = parseChoice(await rl.question(`  ${prompt}`), map, fallback);
    if (value !== undefined) return value;
    console.log(`  ${color.yellow(SYMBOLS.warn)} 输入无效，请重新输入。`);
  }
}

function isInteractive(input = process.stdin, output = process.stdout) {
  return Boolean(input.isTTY && output.isTTY) && process.env.AGY_SILENT_LAUNCH !== "1";
}

/** Ask once, before the first localization; also prompts legacy users once for packAutoUpdate. */
export async function askFirstRunSettings({ platform = process.platform } = {}) {
  const { settings, exists, needsPackAutoUpdatePrompt } = await readUserSettings();
  const envOverrides = settingsFromEnv();
  if (exists && (!needsPackAutoUpdatePrompt || envOverrides.packAutoUpdate !== undefined)) {
    if (needsPackAutoUpdatePrompt && envOverrides.packAutoUpdate !== undefined) {
      return writeUserSettings({ ...settings, ...envOverrides });
    }
    return settings;
  }
  if (exists && needsPackAutoUpdatePrompt) {
    if (!isInteractive()) return settings;
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const updated = { ...settings };
    try {
      console.log("");
      console.log(`  ${color.bold("新增“汉化包自动更新”设置")}  ${color.dim("直接回车即用推荐值，之后随时可在“汉化设置”里修改")}`);
      updated.packAutoUpdate = await ask(rl, PACK_AUTO_UPDATE_QUESTION, "请输入 1、2 或 3，直接回车选 1：", AUTO_OR_ASK_CHOICES, "auto");
    } finally {
      rl.close();
    }
    const saved = await writeUserSettings(updated);
    console.log("");
    for (const line of describeSettings(saved, platform)) console.log(`  ${color.green(SYMBOLS.ok)} ${line}`);
    return saved;
  }
  const chosen = { ...settings, ...envOverrides };
  if (isInteractive()) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      console.log("");
      console.log(`  ${color.bold("首次使用，先确认设置")}  ${color.dim("直接回车即用推荐值，之后可在“汉化设置”里修改")}`);
      if (platform === "win32") {
        chosen.autoFollow = await ask(rl, AUTO_FOLLOW_QUESTION, "请输入 1、2 或 3，直接回车选 1：", AUTO_OR_ASK_CHOICES, chosen.autoFollow);
      }
      chosen.packAutoUpdate = await ask(rl, PACK_AUTO_UPDATE_QUESTION, "请输入 1、2 或 3，直接回车选 1：", AUTO_OR_ASK_CHOICES, chosen.packAutoUpdate);
      chosen.titleAutoTranslate = await ask(rl, TITLE_AUTO_TRANSLATE_QUESTION, "请输入 1 或 2，直接回车选 1：", YES_NO, chosen.titleAutoTranslate);
    } finally {
      rl.close();
    }
  }
  const saved = await writeUserSettings(chosen);
  console.log("");
  for (const line of describeSettings(saved, platform)) console.log(`  ${color.green(SYMBOLS.ok)} ${line}`);
  return saved;
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
      banner("Antigravity 汉化设置");
      console.log("");
      describeSettings(settings, platform).forEach((line, index) => console.log(`  ${color.cyan(String(index + 1))}  ${line}`));
      console.log(`  ${color.cyan("0")}  保存并退出`);
      console.log("");
      const options = platform === "win32"
        ? ["autoFollow", "packAutoUpdate", "titleAutoTranslate"]
        : ["packAutoUpdate", "titleAutoTranslate"];
      const pick = (await rl.question("  请输入要修改的序号，直接回车保存并退出：")).trim();
      if (pick === "0" || pick === "") break;
      const key = options[Number(pick) - 1];
      if (!key) { console.log(`  ${color.yellow(SYMBOLS.warn)} 输入无效，请重新输入。`); continue; }
      if (key === "autoFollow") {
        settings.autoFollow = await ask(rl, AUTO_FOLLOW_QUESTION, "请输入 1、2 或 3：", AUTO_OR_ASK_CHOICES, settings.autoFollow);
      } else if (key === "packAutoUpdate") {
        settings.packAutoUpdate = await ask(rl, PACK_AUTO_UPDATE_QUESTION, "请输入 1、2 或 3：", AUTO_OR_ASK_CHOICES, settings.packAutoUpdate);
      } else if (key === "titleAutoTranslate") {
        settings.titleAutoTranslate = await ask(rl, TITLE_AUTO_TRANSLATE_QUESTION, "请输入 1 或 2：", YES_NO, settings.titleAutoTranslate);
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
    console.log(settings.autoFollow === "off" ? "已关闭更新后自动汉化。" : result.registered ? "更新后自动汉化已按新设置生效。" : `更新后自动汉化未能设置：${result.reason}`);
  }
  console.log("汉化包自动更新与标题自动翻译的改动会在下次启动或重新加载客户端时生效，无需重新汉化。");
  return 0;
}

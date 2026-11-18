// First-run questions and the “汉化设置” menu. Both only talk to a real
// terminal; unattended runs (silent launcher, background task, AI agents)
// fall back to defaults plus AGY_* environment overrides.
import { createInterface } from "node:readline/promises";
import { SYMBOLS, banner, color } from "./console-ui.mjs";
import { applyAutoFollowSetting } from "./auto-follow-task.mjs";
import {
  AUTO_FOLLOW_QUESTION,
  ONLINE_TRANSLATE_QUESTION,
  describeSettings,
  parseChoice,
  readUserSettings,
  settingsFromEnv,
  writeUserSettings,
} from "./user-settings.mjs";

const AUTO_FOLLOW_CHOICES = { 1: "auto", 2: "ask", 3: "off" };
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

/** Ask once, before the first localization. Existing settings are left untouched. */
export async function askFirstRunSettings({ platform = process.platform } = {}) {
  const { settings, exists } = await readUserSettings();
  if (exists) return settings;
  const chosen = { ...settings, ...settingsFromEnv() };
  if (isInteractive()) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      console.log("");
      console.log(`  ${color.bold("首次使用，先确认两项设置")}  ${color.dim("直接回车即用推荐值，之后可在“汉化设置”里修改")}`);
      if (platform === "win32") {
        chosen.autoFollow = await ask(rl, AUTO_FOLLOW_QUESTION, "请输入 1、2 或 3，直接回车选 1：", AUTO_FOLLOW_CHOICES, chosen.autoFollow);
      }
      chosen.onlineTranslate = await ask(rl, ONLINE_TRANSLATE_QUESTION, "请输入 1 或 2，直接回车选 1：", YES_NO, chosen.onlineTranslate);
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
      const options = platform === "win32" ? ["autoFollow", "onlineTranslate"] : ["onlineTranslate"];
      const pick = (await rl.question("  请输入要修改的序号，直接回车保存并退出：")).trim();
      if (pick === "0" || pick === "") break;
      const key = options[Number(pick) - 1];
      if (!key) { console.log(`  ${color.yellow(SYMBOLS.warn)} 输入无效，请重新输入。`); continue; }
      if (key === "autoFollow") {
        settings.autoFollow = await ask(rl, AUTO_FOLLOW_QUESTION, "请输入 1、2 或 3：", AUTO_FOLLOW_CHOICES, settings.autoFollow);
      } else if (key === "onlineTranslate") {
        settings.onlineTranslate = await ask(rl, ONLINE_TRANSLATE_QUESTION, "请输入 1 或 2：", YES_NO, settings.onlineTranslate);
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
  console.log("联网补充翻译的改动会在重新打开 Antigravity 后生效，无需重新汉化。");
  return 0;
}

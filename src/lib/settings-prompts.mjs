// First-run questions and the “汉化设置” menu. Both only talk to a real
// terminal; unattended runs (silent launcher, background task, AI agents)
// fall back to defaults plus AGY_* environment overrides.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { SYMBOLS, banner, color, info, note, ok, warn } from "./console-ui.mjs";
import { applyAutoFollowSetting } from "./auto-follow-task.mjs";
import { projectRoot } from "./paths.mjs";
import {
  checkLatestRelease,
  performSelfUpdate,
  readLocalPackVersion,
  resolvePackRootFromCore,
} from "./self-update.mjs";
import {
  AUTO_FOLLOW_QUESTION,
  ONLINE_TRANSLATE_QUESTION,
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

/** Ask once, before the first localization; also asks existing users once for settings added later. */
export async function askFirstRunSettings({ platform = process.platform } = {}) {
  const { settings, exists, needsPackAutoUpdatePrompt, needsOnlineTranslatePrompt } = await readUserSettings();
  const envOverrides = settingsFromEnv();
  if (exists) {
    // Settings added after this user's first run: environment presets answer them silently,
    // otherwise ask once in an interactive terminal. Until answered they stay at the safe value.
    const askPack = needsPackAutoUpdatePrompt && envOverrides.packAutoUpdate === undefined;
    const askOnline = needsOnlineTranslatePrompt && envOverrides.onlineTranslate === undefined;
    const presets = {};
    if (needsPackAutoUpdatePrompt && envOverrides.packAutoUpdate !== undefined) presets.packAutoUpdate = envOverrides.packAutoUpdate;
    if (needsOnlineTranslatePrompt && envOverrides.onlineTranslate !== undefined) presets.onlineTranslate = envOverrides.onlineTranslate;
    if (!askPack && !askOnline) {
      return Object.keys(presets).length ? writeUserSettings({ ...settings, ...presets }) : settings;
    }
    if (!isInteractive()) {
      return Object.keys(presets).length ? writeUserSettings({ ...settings, ...presets }) : settings;
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const updated = { ...settings, ...presets };
    try {
      console.log("");
      console.log(`  ${color.bold("汉化包新增了设置")}  ${color.dim("直接回车即用推荐值，之后随时可在“汉化设置”里修改")}`);
      if (askPack) {
        updated.packAutoUpdate = await ask(rl, PACK_AUTO_UPDATE_QUESTION, "请输入 1、2 或 3，直接回车选 1：", AUTO_OR_ASK_CHOICES, "auto");
      }
      if (askOnline) {
        updated.onlineTranslate = await ask(rl, ONLINE_TRANSLATE_QUESTION, "请输入 1 或 2，直接回车选 1：", YES_NO, true);
      }
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
      chosen.onlineTranslate = await ask(rl, ONLINE_TRANSLATE_QUESTION, "请输入 1 或 2，直接回车选 1：", YES_NO, chosen.onlineTranslate);
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

async function checkLatestSummary(currentVersion, fetchImpl, checkRelease = checkLatestRelease) {
  const res = await checkRelease({ currentVersion, fetchImpl, timeoutMs: 2500 }).catch(() => ({ ok: false, reason: "network-error" }));
  if (!res.ok) return { kind: "dim", text: `当前版本：v${currentVersion || "未知"}（暂未连上 GitHub 检查更新：${res.reason}）` };
  if (res.hasUpdate) return { kind: "warn", text: `发现新版本 v${res.latestVersion}（当前 v${currentVersion || "未知"}），可在下方选择立即更新` };
  return { kind: "ok", text: `当前已是最新版本 v${currentVersion || res.latestVersion}` };
}

async function applyUpdatedPackToClient({ packRoot, platform }) {
  if (!packRoot) return null;
  const newCoreRoot = path.join(packRoot, "语言包", "核心程序");
  if (platform === "win32") {
    const { isAntigravityRunning } = await import("./processes.mjs");
    const running = await isAntigravityRunning().catch(() => false);
    const scriptName = running ? "hot-update.mjs" : "auto-follow-update.mjs";
    const extraArgs = running ? [] : ["--no-launch"];
    const env = { ...process.env, AGY_LANGUAGE_PACK: path.join(packRoot, "语言包"), AGY_SILENT_LAUNCH: "1" };
    const res = spawnSync(process.execPath, [path.join(newCoreRoot, "scripts", scriptName), ...extraArgs], {
      env,
      stdio: "inherit",
      windowsHide: true,
    });
    return { mode: running ? "hot" : "full", ok: res.status === 0 };
  }
  if (platform === "darwin") {
    const { runningMacApps } = await import("./macos.mjs");
    const running = (await runningMacApps().catch(() => [])).some((a) => String(a.executable).includes("Antigravity 中文.app"));
    if (!running) {
      const env = { ...process.env, AGY_LANGUAGE_PACK: path.join(packRoot, "语言包"), AGY_SILENT_LAUNCH: "1" };
      const res = spawnSync(process.execPath, [path.join(newCoreRoot, "scripts", "macos.mjs"), "install-auto"], {
        env,
        stdio: "inherit",
        windowsHide: true,
      });
      return { mode: "mac-full", ok: res.status === 0 };
    }
    return { mode: "mac-running", ok: true };
  }
  return null;
}

/** Interactive settings editor. Returns a process exit code. */
export async function runSettingsMenu({
  platform = process.platform,
  coreRoot = projectRoot,
  fetchImpl = fetch,
  checkRelease = checkLatestRelease,
  runSelfUpdate = performSelfUpdate,
  applyUpdatedClient = applyUpdatedPackToClient,
  input = process.stdin,
  output = process.stdout,
} = {}) {
  if (!isInteractive(input, output)) {
    console.log("请双击“汉化设置”打开设置窗口。");
    return 1;
  }
  let { settings } = await readUserSettings();
  let currentVersion = await readLocalPackVersion(coreRoot);
  const packRoot = resolvePackRootFromCore(coreRoot);
  const checkOptionIndex = platform === "win32" ? 5 : 4;
  let versionNotice =
    settings.packAutoUpdate === "off"
      ? { kind: "dim", text: `当前版本：v${currentVersion || "未知"}（已关闭自动检查，可输入 ${checkOptionIndex} 手动检查）` }
      : await checkLatestSummary(currentVersion, fetchImpl, checkRelease);

  const rl = createInterface({ input, output });
  let changed = false;
  let updatedPack = false;
  try {
    for (;;) {
      banner(`Antigravity 汉化设置${currentVersion ? `  ·  当前 v${currentVersion}` : ""}`);
      console.log("");
      if (versionNotice.kind === "ok") ok(versionNotice.text);
      else if (versionNotice.kind === "warn") warn(versionNotice.text);
      else note(versionNotice.text);
      console.log("");
      describeSettings(settings, platform).forEach((line, index) => console.log(`  ${color.cyan(String(index + 1))}  ${line}`));
      console.log(`  ${color.cyan(String(checkOptionIndex))}  立即检查并更新汉化包`);
      console.log(`  ${color.cyan("0")}  保存并退出`);
      console.log("");
      const options = platform === "win32"
        ? ["autoFollow", "packAutoUpdate", "onlineTranslate", "titleAutoTranslate", "checkNow"]
        : ["packAutoUpdate", "onlineTranslate", "titleAutoTranslate", "checkNow"];
      const pick = (await rl.question("  请输入要修改的序号，直接回车保存并退出：")).trim();
      if (pick === "0" || pick === "") break;
      const key = options[Number(pick) - 1];
      if (!key) { console.log(`  ${color.yellow(SYMBOLS.warn)} 输入无效，请重新输入。`); continue; }
      if (key === "checkNow") {
        info("正在连接 GitHub 检查汉化包最新版本…");
        const res = await checkRelease({ currentVersion, fetchImpl, timeoutMs: 5000 }).catch(() => ({ ok: false, reason: "network-error" }));
        if (!res.ok) {
          versionNotice = { kind: "warn", text: `检查更新失败（${res.reason}），请检查网络或稍后重试。` };
          warn(versionNotice.text);
        } else if (!res.hasUpdate) {
          versionNotice = { kind: "ok", text: `当前汉化包已是最新版本 v${currentVersion || res.latestVersion}。` };
          ok(versionNotice.text);
        } else if (!packRoot) {
          versionNotice = { kind: "warn", text: `发现新版本 v${res.latestVersion}（当前 v${currentVersion || "未知"}）；当前为源码目录，请通过 git pull 或发布页获取。` };
          warn(versionNotice.text);
          info(`发布页：${res.releaseUrl}`);
        } else {
          const confirm = (await rl.question(`  发现新版本 v${res.latestVersion}（当前 v${currentVersion || "未知"}），是否立即下载校验并更新？[Y/n]：`)).trim().toLowerCase();
          if (confirm === "" || confirm === "y" || confirm === "yes" || confirm === "是") {
            info("正在下载并校验 SHA-256，请稍候…");
            try {
              const result = await runSelfUpdate({ packRoot, coreRoot, platform, fetchImpl });
              if (result?.status === "updated") {
                currentVersion = result.latestVersion || currentVersion;
                updatedPack = true;
                versionNotice = { kind: "ok", text: `汉化包已更新至最新版本 v${currentVersion}。` };
                ok(versionNotice.text);
                const applied = await applyUpdatedClient({ packRoot, platform }).catch(() => null);
                if (applied?.mode === "hot" && applied.ok) {
                  ok("已无感热更新客户端中文界面，在客户端窗口按 Ctrl+R 刷新即可生效。");
                } else if (applied?.mode === "full" && applied.ok) {
                  ok("已同步更新本机客户端中文界面。");
                } else if (applied?.mode === "mac-running") {
                  info("请按 ⌘Q 退出中文版客户端后，重新运行一次“启动中文.command”完成重签。");
                } else if (applied?.mode === "mac-full" && applied.ok) {
                  ok("Mac 中文副本已同步更新并完成重签。");
                }
              } else {
                info(`当前状态：${result?.status || "无需更新"}。`);
              }
            } catch (err) {
              warn(`更新未完成：${err?.message || err}`);
            }
          }
        }
        continue;
      }
      if (key === "autoFollow") {
        settings.autoFollow = await ask(rl, AUTO_FOLLOW_QUESTION, "请输入 1、2 或 3：", AUTO_OR_ASK_CHOICES, settings.autoFollow);
      } else if (key === "packAutoUpdate") {
        settings.packAutoUpdate = await ask(rl, PACK_AUTO_UPDATE_QUESTION, "请输入 1、2 或 3：", AUTO_OR_ASK_CHOICES, settings.packAutoUpdate);
      } else if (key === "onlineTranslate") {
        settings.onlineTranslate = await ask(rl, ONLINE_TRANSLATE_QUESTION, "请输入 1 或 2：", YES_NO, settings.onlineTranslate);
      } else if (key === "titleAutoTranslate") {
        settings.titleAutoTranslate = await ask(rl, TITLE_AUTO_TRANSLATE_QUESTION, "请输入 1 或 2：", YES_NO, settings.titleAutoTranslate);
      }
      changed = true;
    }
  } finally {
    rl.close();
  }
  if (!changed) {
    console.log(updatedPack ? "已退出设置。" : "设置未改动。");
    return 0;
  }
  settings = await writeUserSettings(settings);
  console.log("设置已保存。");
  if (platform === "win32") {
    const result = await applyAutoFollowSetting(settings).catch((error) => ({ registered: false, reason: error.message }));
    console.log(settings.autoFollow === "off" ? "已关闭更新后自动汉化。" : result.registered ? "更新后自动汉化已按新设置生效。" : `更新后自动汉化未能设置：${result.reason}`);
  }
  console.log("汉化包自动更新、界面联网补充翻译与标题自动翻译的改动会在刷新客户端窗口（Windows 按 Ctrl+R）或重新打开客户端后生效，无需重新汉化。");
  return 0;
}

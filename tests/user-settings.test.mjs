import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  parseChoice,
  readUserSettings,
  settingsFromEnv,
  writeUserSettings,
} from "../src/lib/user-settings.mjs";

test("默认：更新后自动汉化、汉化包自动更新、界面联网补充翻译与标题自动翻译开启、标题不写回", () => {
  assert.equal(DEFAULT_SETTINGS.autoFollow, "auto");
  assert.equal(DEFAULT_SETTINGS.packAutoUpdate, "auto");
  assert.equal(DEFAULT_SETTINGS.onlineTranslate, true);
  assert.equal(DEFAULT_SETTINGS.titleAutoTranslate, true);
  assert.equal(DEFAULT_SETTINGS.titleWriteBack, false);
});

test("无效值回落到默认值，且兼容迁移旧版联网配置", () => {
  const settings = normalizeSettings({ autoFollow: "maybe", packAutoUpdate: "later", onlineTranslate: "maybe", titleAutoTranslate: "invalid", titleWriteBack: 3 });
  // 已有设置但没有明确开启界面联网补充翻译：保持关闭，等用户补答
  assert.deepEqual(settings, { ...DEFAULT_SETTINGS, onlineTranslate: false });
  assert.equal(normalizeSettings({}).onlineTranslate, true, "全新用户默认开启");
  assert.equal(normalizeSettings({ onlineTranslate: "on" }).onlineTranslate, true);
  assert.equal(normalizeSettings({ onlineTranslate: false }).onlineTranslate, false);
  assert.equal(normalizeSettings({ packAutoUpdate: "ASK" }).packAutoUpdate, "ask");
  assert.equal(normalizeSettings({ titleAutoTranslate: "off" }).titleAutoTranslate, false);
  // 旧版两个字段共同关闭或联网关闭时迁移为关闭标题自动翻译
  assert.equal(normalizeSettings({ onlineTranslate: false, autoTranslateTitles: true }).titleAutoTranslate, false);
  assert.equal(normalizeSettings({ onlineTranslate: true, autoTranslateTitles: false }).titleAutoTranslate, false);
  assert.equal(normalizeSettings({ onlineTranslate: true, autoTranslateTitles: true }).titleAutoTranslate, true);
});

test("无人值守安装可用环境变量预设", () => {
  const env = { AGY_AUTO_FOLLOW: "ASK", AGY_PACK_AUTO_UPDATE: "off", AGY_TITLE_AUTO_TRANSLATE: "0" };
  assert.deepEqual(settingsFromEnv(env), { autoFollow: "ask", packAutoUpdate: "off", titleAutoTranslate: false });
  assert.deepEqual(settingsFromEnv({ AGY_ONLINE_TRANSLATE: "off" }), { onlineTranslate: false, titleAutoTranslate: false });
  assert.deepEqual(settingsFromEnv({ AGY_ONLINE_TRANSLATE: "on", AGY_TITLE_AUTO_TRANSLATE: "0" }), { onlineTranslate: true, titleAutoTranslate: false });
  assert.deepEqual(settingsFromEnv({}), {});
});

test("菜单输入：空回车取默认，非法输入返回 undefined", () => {
  const map = { 1: true, 2: false };
  assert.equal(parseChoice("", map, true), true);
  assert.equal(parseChoice(" 2 ", map, true), false);
  assert.equal(parseChoice("9", map, true), undefined);
});

test("首次运行前没有设置文件；保存后可读回；旧配置缺少 packAutoUpdate 时标记需补问并先走询问", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agy-settings-"));
  const env = { AGY_ZHCN_STATE_DIR: dir };
  try {
    assert.equal((await readUserSettings({ env })).exists, false);
    const { writeFile: fsWriteFile } = await import("node:fs/promises");
    await fsWriteFile(path.join(dir, "settings.json"), JSON.stringify({ autoFollow: "auto", onlineTranslate: true }), "utf8");
    const legacy = await readUserSettings({ env });
    assert.equal(legacy.exists, true);
    assert.equal(legacy.needsPackAutoUpdatePrompt, true);
    assert.equal(legacy.settings.packAutoUpdate, "ask");
    // 旧配置里明确开着联网翻译：沿用，不再补问
    assert.equal(legacy.needsOnlineTranslatePrompt, false);
    assert.equal(legacy.settings.onlineTranslate, true);

    // v3.1.4–v3.1.5 写出的配置没有 onlineTranslate：先保持关闭并标记需补问
    await fsWriteFile(path.join(dir, "settings.json"), JSON.stringify({ autoFollow: "auto", packAutoUpdate: "auto", titleAutoTranslate: true }), "utf8");
    const mid = await readUserSettings({ env });
    assert.equal(mid.needsOnlineTranslatePrompt, true);
    assert.equal(mid.settings.onlineTranslate, false);

    await writeUserSettings({ autoFollow: "off", packAutoUpdate: "ask", onlineTranslate: true, titleAutoTranslate: false }, { env });
    const { settings, exists, needsPackAutoUpdatePrompt, needsOnlineTranslatePrompt } = await readUserSettings({ env });
    assert.equal(exists, true);
    assert.equal(needsPackAutoUpdatePrompt, false);
    assert.equal(needsOnlineTranslatePrompt, false);
    assert.deepEqual(settings, { autoFollow: "off", packAutoUpdate: "ask", onlineTranslate: true, titleAutoTranslate: false, titleWriteBack: false });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

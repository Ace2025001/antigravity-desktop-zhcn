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

test("默认：更新后自动汉化、联网补充翻译开启、标题不写回", () => {
  assert.equal(DEFAULT_SETTINGS.autoFollow, "auto");
  assert.equal(DEFAULT_SETTINGS.onlineTranslate, true);
  assert.equal(DEFAULT_SETTINGS.titleWriteBack, false);
});

test("无效值回落到默认值", () => {
  const settings = normalizeSettings({ autoFollow: "maybe", onlineTranslate: "?", titleWriteBack: 3 });
  assert.deepEqual(settings, { ...DEFAULT_SETTINGS });
  assert.equal(normalizeSettings({ onlineTranslate: "false" }).onlineTranslate, false);
});

test("无人值守安装可用环境变量预设", () => {
  const env = { AGY_AUTO_FOLLOW: "ASK", AGY_ONLINE_TRANSLATE: "off" };
  assert.deepEqual(settingsFromEnv(env), { autoFollow: "ask", onlineTranslate: false });
  assert.deepEqual(settingsFromEnv({}), {});
});

test("菜单输入：空回车取默认，非法输入返回 undefined", () => {
  const map = { 1: true, 2: false };
  assert.equal(parseChoice("", map, true), true);
  assert.equal(parseChoice(" 2 ", map, true), false);
  assert.equal(parseChoice("9", map, true), undefined);
});

test("首次运行前没有设置文件；保存后可读回", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agy-settings-"));
  const env = { AGY_ZHCN_STATE_DIR: dir };
  try {
    assert.equal((await readUserSettings({ env })).exists, false);
    await writeUserSettings({ autoFollow: "off", onlineTranslate: false }, { env });
    const { settings, exists } = await readUserSettings({ env });
    assert.equal(exists, true);
    assert.deepEqual(settings, { autoFollow: "off", onlineTranslate: false, titleWriteBack: false });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

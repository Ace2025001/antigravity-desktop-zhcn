import test from "node:test";
import assert from "node:assert/strict";
import { createLocalizedBundle, loadDomTranslations } from "../src/lib/translator.mjs";
import { createLocalizedBundleWithProgress, formatElapsed } from "../src/lib/localize-progress.mjs";

test("已用时格式：秒与分秒", () => {
  assert.equal(formatElapsed(0), "0 秒");
  assert.equal(formatElapsed(59), "59 秒");
  assert.equal(formatElapsed(125), "2 分 5 秒");
});

test("后台线程生成结果与直接生成完全一致，并报告用时", async () => {
  const dictionary = await loadDomTranslations();
  const source = Buffer.from('const a="Settings";const b="New Conversation";const c="Automations";');
  const expected = createLocalizedBundle(source, dictionary);
  const logs = [];
  const actual = await createLocalizedBundleWithProgress(source, dictionary, { log: (s) => logs.push(s), stdout: { isTTY: false } });
  assert.equal(actual.sha256, expected.sha256);
  assert.deepEqual(actual.buffer, expected.buffer);
  assert.ok(logs.at(-1).startsWith("中文界面已生成，用时"));
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { decideAutoFollow } from "../src/lib/auto-follow-decision.mjs";
import { AUTO_FOLLOW_TASK_NAME, removeAutoFollowDaemon } from "../src/lib/auto-follow-task.mjs";
import { createRuntimeOverlay } from "../src/lib/translator.mjs";

test("自动跟进决策表", () => {
  const d = (o) => decideAutoFollow({ updated: true, running: false, ...o });
  assert.equal(d({ autoFollow: "off" }), "none");
  assert.equal(d({ autoFollow: "auto", updated: false }), "none");
  assert.equal(d({ autoFollow: "auto" }), "localize");
  assert.equal(d({ autoFollow: "auto", running: true }), "wait-then-localize");
  assert.equal(d({ autoFollow: "auto", running: true, postQuit: true }), "take-over");
  assert.equal(d({ autoFollow: "ask" }), "ask");
  assert.equal(d({ autoFollow: "ask", running: true }), "ask");
  assert.equal(d({ autoFollow: "ask", declined: true }), "none");
});

test("不再注册定时计划任务，只清理旧版任务", async () => {
  const source = await readFile(new URL("../src/lib/auto-follow-task.mjs", import.meta.url), "utf8");
  assert.ok(!source.includes("Register-ScheduledTask"), "不得注册计划任务");
  assert.ok(!source.includes('"/Create"'), "不得用 schtasks 创建任务");
  assert.ok(source.includes('"/Delete", "/TN", AUTO_FOLLOW_TASK_NAME'), "必须清理旧版计划任务");
});

test("后台脚本只由客户端退出钩子启动", async () => {
  const daemon = await readFile(new URL("../scripts/silent-auto-follow-daemon.mjs", import.meta.url), "utf8");
  assert.ok(daemon.includes('if (mode !== "--post-quit") return;'), "后台脚本只响应退出钩子");
  const patcher = await readFile(new URL("../src/lib/patcher.mjs", import.meta.url), "utf8");
  assert.match(patcher, /'--post-quit'/);
});

test("恢复英文 / 卸载会删除计划任务", { skip: process.platform !== "win32" }, async () => {
  const calls = [];
  // Redirect both the state dir and the client's userData dir so the test never
  // deletes the real quit-hook file on the developer's machine.
  const { mkdtemp, writeFile: write, access } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const sandbox = await mkdtemp(join(tmpdir(), "agy-zhcn-test-"));
  const saved = { state: process.env.AGY_ZHCN_STATE_DIR, userData: process.env.AGY_USER_DATA_PATH };
  process.env.AGY_ZHCN_STATE_DIR = join(sandbox, "state");
  process.env.AGY_USER_DATA_PATH = sandbox;
  const restore = (key, value) => { if (value === undefined) delete process.env[key]; else process.env[key] = value; };
  try {
    const hookFile = join(sandbox, "agy_zhcn_autofollow_hook.json");
    await write(hookFile, "{}");
    const result = await removeAutoFollowDaemon({ exec: async (file, args) => { calls.push([file, ...args]); } });
    assert.equal(result.removed, true);
    assert.deepEqual(calls[0], ["schtasks.exe", "/Delete", "/TN", AUTO_FOLLOW_TASK_NAME, "/F"]);
    await assert.rejects(access(hookFile), "沙盒里的钩子文件应被删除");
  } finally {
    restore("AGY_ZHCN_STATE_DIR", saved.state);
    restore("AGY_USER_DATA_PATH", saved.userData);
  }
});

test("红线：恢复英文与完全卸载都调用计划任务清理", async () => {
  const cli = await readFile(new URL("../src/cli.mjs", import.meta.url), "utf8");
  assert.ok((cli.match(/removeAutoFollowDaemon\(\)/g) || []).length >= 2);
});

test("红线：客户端页面内不得直接联网翻译，只能经主进程代理", () => {
  const overlay = createRuntimeOverlay({ exact: {}, patterns: [] });
  assert.ok(!overlay.includes("translate.googleapis.com"), "页面叠加层不得包含直连翻译地址");
  assert.ok(!/fetch\(\s*["'`]https?:/.test(overlay), "页面叠加层不得直接请求外部网址");
});

test("红线：主进程翻译代理先检查标题自动翻译开关再发请求", async () => {
  const patcher = await readFile(new URL("../src/lib/patcher.mjs", import.meta.url), "utf8");
  const route = patcher.indexOf("reqUrl.hostname === 'translate'");
  const gate = patcher.indexOf("titleAutoTranslate", route);
  const request = patcher.indexOf("translate.googleapis.com", route);
  assert.ok(route > 0 && gate > route && gate < request, "标题自动翻译开关检查必须位于请求之前");
});

test("红线：标题默认只显示不写回", () => {
  const overlay = createRuntimeOverlay({ exact: {}, patterns: [] });
  assert.match(overlay, /titleWriteBack !== true/);
});

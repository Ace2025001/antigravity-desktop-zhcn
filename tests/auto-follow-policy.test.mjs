import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { decideAutoFollow } from "../src/lib/auto-follow-decision.mjs";
import { AUTO_FOLLOW_INTERVAL_MINUTES, AUTO_FOLLOW_TASK_NAME, removeAutoFollowDaemon } from "../src/lib/auto-follow-task.mjs";
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

test("后台检查间隔不短于 30 分钟", () => {
  assert.ok(AUTO_FOLLOW_INTERVAL_MINUTES >= 30);
});

test("恢复英文 / 卸载会删除计划任务", { skip: process.platform !== "win32" }, async () => {
  const calls = [];
  const prev = process.env.AGY_ZHCN_STATE_DIR;
  process.env.AGY_ZHCN_STATE_DIR = (await import("node:os")).tmpdir();
  try {
    const result = await removeAutoFollowDaemon({ exec: async (file, args) => { calls.push([file, ...args]); } });
    assert.equal(result.removed, true);
    assert.deepEqual(calls[0], ["schtasks.exe", "/Delete", "/TN", AUTO_FOLLOW_TASK_NAME, "/F"]);
  } finally {
    if (prev === undefined) delete process.env.AGY_ZHCN_STATE_DIR; else process.env.AGY_ZHCN_STATE_DIR = prev;
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

test("红线：主进程翻译代理先检查联网开关再发请求", async () => {
  const patcher = await readFile(new URL("../src/lib/patcher.mjs", import.meta.url), "utf8");
  const route = patcher.indexOf("reqUrl.hostname === 'translate'");
  const gate = patcher.indexOf("onlineTranslate", route);
  const request = patcher.indexOf("translate.googleapis.com", route);
  assert.ok(route > 0 && gate > route && gate < request, "联网开关检查必须位于请求之前");
});

test("红线：标题默认只显示不写回", () => {
  const overlay = createRuntimeOverlay({ exact: {}, patterns: [] });
  assert.match(overlay, /titleWriteBack !== true/);
});

test("计划任务的登录触发器限定为当前用户（普通权限即可注册）", async () => {
  const source = await readFile(new URL("../src/lib/auto-follow-task.mjs", import.meta.url), "utf8");
  // Inside the JS template literal the PowerShell backslash must be doubled.
  assert.ok(source.includes('$user = "$env:USERDOMAIN\\$env:USERNAME"'), "域名与用户名之间必须保留反斜杠");
  assert.match(source, /-AtLogOn -User \$user/);
  assert.match(source, /-Principal \$principal/);
});

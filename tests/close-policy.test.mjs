import test from "node:test";
import assert from "node:assert/strict";
const { closeWithPolicy, CloseCancelledError } = await import("../src/lib/close-policy.mjs");
const { classifyAntigravityCommand, filterActiveClientProcesses } = await import("../src/lib/close-client.mjs");

// A fake client: `quitOn` decides which request makes it exit ("graceful", "force" or "never").
function fixture({ quitOn = "graceful", keysAt = {} } = {}) {
  let time = 0, active = true, graceful = 0, forced = 0;
  const logs = [];
  const pressed = new Set();
  const keys = {
    next: () => {
      for (const [at, key] of Object.entries(keysAt)) {
        if (time >= Number(at) && !pressed.has(at)) { pressed.add(at); return key; }
      }
      return null;
    },
    close: () => {},
  };
  const f = {
    logs,
    get time() { return time; },
    get graceful() { return graceful; },
    get forced() { return forced; },
    set active(value) { active = value; },
    args: {
      running: async () => active,
      requestClose: async () => { graceful++; if (quitOn === "graceful") active = false; },
      forceClose: async () => { forced++; if (quitOn !== "never") active = false; },
      now: () => time,
      sleep: async (ms) => { time += ms; },
      log: (s) => logs.push(s),
      keys,
    },
  };
  return f;
}

test("客户端未运行时直接继续，不请求关闭", async () => {
  const f = fixture();
  f.active = false;
  await closeWithPolicy(f.args);
  assert.equal(f.time, 0);
  assert.equal(f.graceful + f.forced, 0);
});

test("等待期间手动退出会被自动识别，不请求关闭", async () => {
  const f = fixture();
  const sleep = f.args.sleep;
  f.args.sleep = async (ms) => { await sleep(ms); if (f.time >= 10_000) f.active = false; };
  await closeWithPolicy(f.args);
  assert.ok(f.time >= 10_000 && f.time < 11_000);
  assert.equal(f.graceful + f.forced, 0);
  assert.ok(f.logs.some((s) => s.includes("已退出")));
});

test("按 Y 立即强制关闭，不等满 60 秒", async () => {
  const f = fixture({ keysAt: { 5000: "y" } });
  await closeWithPolicy(f.args);
  assert.equal(f.forced, 1);
  assert.equal(f.graceful, 0);
  assert.ok(f.time < 10_000);
});

test("按 N 后不再自动强制关闭，一直等到手动退出", async () => {
  const f = fixture({ keysAt: { 3000: "n" } });
  const sleep = f.args.sleep;
  f.args.sleep = async (ms) => { await sleep(ms); if (f.time >= 300_000) f.active = false; };
  await closeWithPolicy(f.args);
  assert.equal(f.graceful + f.forced, 0);
  assert.ok(f.time >= 300_000);
  assert.ok(f.logs.some((s) => s.includes("已取消自动强制关闭")));
});

test("按 N 之后仍可按 Y 强制关闭", async () => {
  const f = fixture({ keysAt: { 2000: "n", 90_000: "Y" } });
  await closeWithPolicy(f.args);
  assert.equal(f.forced, 1);
  assert.ok(f.time >= 90_000);
});

test("60 秒无操作时先请求正常退出，退出成功就不强制关闭", async () => {
  const f = fixture({ quitOn: "graceful" });
  await closeWithPolicy(f.args);
  assert.ok(f.time >= 60_000);
  assert.equal(f.graceful, 1);
  assert.equal(f.forced, 0);
});

test("后台运行导致正常退出无效时，超时后自动强制关闭", async () => {
  const f = fixture({ quitOn: "force" });
  await closeWithPolicy(f.args);
  assert.equal(f.graceful, 1);
  assert.equal(f.forced, 1);
  assert.ok(f.logs.some((s) => s.includes("正在强制关闭")));
});

test("强制关闭后仍未退出时报错，不继续修改文件", async () => {
  const f = fixture({ quitOn: "never", keysAt: { 1000: "y" } });
  await assert.rejects(closeWithPolicy(f.args), /强制关闭后客户端仍在运行/);
});

test("Ctrl+C 取消本次操作", async () => {
  const f = fixture({ keysAt: { 1000: "\u0003" } });
  await assert.rejects(closeWithPolicy(f.args), CloseCancelledError);
  assert.equal(f.graceful + f.forced, 0);
});

test("无交互终端时同样按 60 秒规则处理", async () => {
  const f = fixture({ quitOn: "force" });
  f.args.keys = null;
  await closeWithPolicy(f.args);
  assert.ok(f.time >= 60_000);
  assert.equal(f.forced, 1);
});

test("工具自己临时打开的客户端不等待 60 秒，直接关闭", async () => {
  const f = fixture({ quitOn: "force" });
  await closeWithPolicy({ ...f.args, owned: true });
  assert.ok(f.time < 60_000);
  assert.equal(f.graceful, 1);
  assert.equal(f.forced, 1);
});

test("无法读取进程状态时不当作已退出", async () => {
  const f = fixture();
  f.args.running = async () => { throw Error("读取失败"); };
  await assert.rejects(closeWithPolicy(f.args), /读取失败/);
  assert.equal(f.graceful + f.forced, 0);
});

test("倒计时期间用户关闭主窗口但后台托盘驻留时，立即自动结束等待并清理", async () => {
  const f = fixture({ quitOn: "force" });
  await closeWithPolicy({
    ...f.args,
    autoContinueWhen: async (stage) => {
      if (stage === "poll" && f.time >= 3_500) {
        return "检测到你已关闭 Antigravity 窗口，正在结束后台驻留进程并继续…";
      }
      return null;
    },
  });
  assert.ok(f.time < 10_000, `Expected immediate continuation without waiting 60s, got ${f.time}ms`);
  assert.equal(f.forced, 1);
  assert.ok(f.logs.some((s) => s.includes("检测到你已关闭 Antigravity 窗口")));
});

test("初始已无可见窗口仅后台托盘驻留时，跳过 60 秒倒计时直接继续", async () => {
  const f = fixture({ quitOn: "force" });
  await closeWithPolicy({
    ...f.args,
    autoContinueWhen: async (stage) =>
      stage === "initial" ? "检测到 Antigravity 当前未打开窗口（仅后台托盘驻留），正在结束后台进程并继续…" : null,
  });
  assert.ok(f.time < 5_000);
  assert.equal(f.forced, 1);
});

test("进程分类器精准区分 Electron 主进程、Chromium 子进程与孤儿 sidecar_sdk 进程（Win/Mac 双端）", () => {
  const winMain = classifyAntigravityCommand('"C:\\Users\\MI\\AppData\\Local\\Programs\\antigravity\\Antigravity.exe"');
  const winRenderer = classifyAntigravityCommand('"C:\\Antigravity.exe" --type=renderer --lang=zh-CN');
  const winSidecar = classifyAntigravityCommand('"C:\\Antigravity.exe" --import=file:///C:/Users/MI/.gemini/antigravity/lib/node_modules/sidecar_sdk/register_loader.js main.mjs');
  const macMain = classifyAntigravityCommand("");
  const macSidecar = classifyAntigravityCommand("--import=file:///Users/test/.gemini/antigravity/lib/node_modules/sidecar_sdk/register_loader.js main.mjs");

  assert.equal(winMain.isMainApp, true);
  assert.equal(winRenderer.isMainApp, false);
  assert.equal(winRenderer.isSubprocess, true);
  assert.equal(winSidecar.isMainApp, false);
  assert.equal(winSidecar.isSidecar, true);
  assert.equal(macMain.isMainApp, true);
  assert.equal(macSidecar.isMainApp, false);

  // 当主进程已退出、仅剩孤儿 sidecar 和子进程时，active 为空、orphans 被回收
  const onlyOrphans = filterActiveClientProcesses([
    { Id: 49284, ...winSidecar },
    { Id: 48524, ...winRenderer },
  ]);
  assert.equal(onlyOrphans.active.length, 0);
  assert.equal(onlyOrphans.orphans.length, 2);

  // 当主进程仍在运行时，active 保留全部以便完整关闭
  const withMain = filterActiveClientProcesses([
    { Id: 35188, ...winMain },
    { Id: 49284, ...winSidecar },
  ]);
  assert.equal(withMain.active.length, 2);
  assert.equal(withMain.orphans.length, 0);
});

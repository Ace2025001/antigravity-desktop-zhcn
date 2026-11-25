import test from "node:test";
import assert from "node:assert/strict";
import {
  COMPLETION_DIALOG_BUTTONS,
  COMPLETION_DIALOG_TITLE,
  REPO_URL,
  buildWindowsCompletionDialogScript,
  maybeShowCompletionDialog,
  shouldShowCompletionDialog,
} from "../src/lib/completion-dialog.mjs";

test("完成点赞弹窗仅在交互式启动中文成功时显示，静默跟进与测试环境跳过", () => {
  const cleanEnv = {};
  assert.equal(shouldShowCompletionDialog({ action: "start", exitCode: 0, dryVerify: false, env: cleanEnv, platform: "win32" }), true);
  assert.equal(shouldShowCompletionDialog({ action: "start", exitCode: 0, dryVerify: false, env: cleanEnv, platform: "darwin" }), true);
  assert.equal(shouldShowCompletionDialog({ action: "restore", exitCode: 0, dryVerify: false, env: cleanEnv, platform: "win32" }), false);
  assert.equal(shouldShowCompletionDialog({ action: "start", exitCode: 1, dryVerify: false, env: cleanEnv, platform: "win32" }), false);
  assert.equal(shouldShowCompletionDialog({ action: "start", exitCode: 0, dryVerify: true, env: cleanEnv, platform: "win32" }), false);
  assert.equal(shouldShowCompletionDialog({ action: "start", exitCode: 0, dryVerify: false, env: { AGY_SILENT_LAUNCH: "1" }, platform: "win32" }), false);
  assert.equal(shouldShowCompletionDialog({ action: "start", exitCode: 0, dryVerify: false, env: { AGY_NO_STAR_PROMPT: "1" }, platform: "win32" }), false);
  assert.equal(shouldShowCompletionDialog({ action: "start", exitCode: 0, dryVerify: false, env: { CI: "true" }, platform: "win32" }), false);
});

test("Windows 完成弹窗脚本包含标题、拉赞文案、两个按钮及仓库直达跳转", () => {
  const script = buildWindowsCompletionDialogScript();
  assert.ok(script.includes(COMPLETION_DIALOG_TITLE));
  assert.ok(script.includes("汉化已完成！"));
  assert.ok(script.includes(COMPLETION_DIALOG_BUTTONS.star));
  assert.ok(script.includes(COMPLETION_DIALOG_BUTTONS.close));
  assert.ok(script.includes("ShowWindow($form.Handle, 5)"));
  assert.ok(script.includes(`Start-Process '${REPO_URL}'`));
});

test("macOS 点击去 GitHub 点 Star 按钮时打开仓库地址，点击关闭仅结束", async () => {
  const calls = [];
  const starResult = await maybeShowCompletionDialog({
    action: "start",
    exitCode: 0,
    dryVerify: false,
    env: {},
    platform: "darwin",
    exec: async (cmd, args) => {
      calls.push({ cmd, args });
      if (cmd === "/usr/bin/osascript") return { stdout: `${COMPLETION_DIALOG_BUTTONS.star}\n` };
      return { stdout: "" };
    },
  });
  assert.equal(starResult, "star");
  assert.equal(calls.length, 2);
  assert.equal(calls[1].cmd, "/usr/bin/open");
  assert.deepEqual(calls[1].args, [REPO_URL]);

  const closeCalls = [];
  const closeResult = await maybeShowCompletionDialog({
    action: "start",
    exitCode: 0,
    dryVerify: false,
    env: {},
    platform: "darwin",
    exec: async (cmd, args) => {
      closeCalls.push({ cmd, args });
      return { stdout: `${COMPLETION_DIALOG_BUTTONS.close}\n` };
    },
  });
  assert.equal(closeResult, "close");
  assert.equal(closeCalls.length, 1);
});

test("Windows 弹窗异常时安全降级为 null，不抛出中断主流程", async () => {
  const result = await maybeShowCompletionDialog({
    action: "start",
    exitCode: 0,
    dryVerify: false,
    env: {},
    platform: "win32",
    exec: async () => {
      throw new Error("模拟无图形界面失败");
    },
  });
  assert.equal(result, null);
});

test("全部 Windows 更新与跟进弹窗复用同一现代卡片组件且按钮明确", async () => {
  const {
    buildModernWindowsDialogScript,
    getClientFollowDialogSpec,
    getPackExitDialogSpec,
    getPackStartupDialogSpec,
    getRelaunchConfirmDialogSpec,
    getWarnNotifyDialogSpec,
  } = await import("../src/lib/modern-dialog.mjs");

  const startup = buildModernWindowsDialogScript(getPackStartupDialogSpec({ currentVersion: "3.1.3", latestVersion: "3.1.4" }));
  const exitPack = buildModernWindowsDialogScript(getPackExitDialogSpec({ currentVersion: "3.1.3", latestVersion: "3.1.4" }));
  const follow = buildModernWindowsDialogScript(getClientFollowDialogSpec({ version: "2.36.0" }));
  const relaunch = buildModernWindowsDialogScript(getRelaunchConfirmDialogSpec());
  const warn = buildModernWindowsDialogScript(getWarnNotifyDialogSpec({ message: "测试提示" }));

  for (const s of [startup, exitPack, follow, relaunch, warn]) {
    assert.ok(s.includes("DwmSetWindowAttribute"), "统一使用圆角现代卡片窗口");
    assert.ok(s.includes("ShowWindow($form.Handle, 5)"));
  }
  assert.ok(startup.includes("立即更新") && startup.includes("跳过此版本"));
  assert.ok(exitPack.includes("立即更新") && exitPack.includes("跳过此版本"));
  assert.ok(follow.includes("立即汉化") && follow.includes("此版本不提醒"));
  assert.ok(relaunch.includes("立即重启并汉化") && relaunch.includes("暂不更新"));
  assert.ok(warn.includes("知道了") && warn.includes("自动跟进未能完成"));
});

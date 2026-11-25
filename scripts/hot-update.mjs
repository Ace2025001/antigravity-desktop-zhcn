// 热更新：不关闭客户端，用当前仓库（或语言包）里的词库和引擎重新生成中文界面文件并原子替换。
// 新界面在客户端按 Ctrl+R 刷新窗口、或退出后重新打开时生效（客户端没有“查看”菜单）。
// 只适用于 Windows、并且已经用“启动中文”汉化过的同一个客户端版本；客户端版本变了要走“启动中文”。
import path from "node:path";
import { writeFile, rm } from "node:fs/promises";
import { inspectInstallation } from "../src/lib/installation.mjs";
import { readEmbeddedWindowsUi } from "../src/lib/runtime-bundle.mjs";
import { loadDomTranslations } from "../src/lib/translator.mjs";
import { createLocalizedBundleWithProgress } from "../src/lib/localize-progress.mjs";
import { atomicReplaceFile } from "../src/lib/patcher.mjs";
import { readInstallState, writeInstallState } from "../src/lib/state.mjs";
import { sha256Buffer, sha256File } from "../src/lib/hash.mjs";
import { getAntigravityUserDataRoot } from "../src/lib/paths.mjs";
import { localizationFingerprint } from "../src/lib/language-pack.mjs";
import { projectRoot } from "../src/lib/paths.mjs";
import { finalizePackLaunchers, resolvePackRootFromCore } from "../src/lib/self-update.mjs";

const BUNDLE_NAME = "agy_zhcn_ui_main.js";
const dryRun = process.argv.includes("--dry-run");

function fail(message) {
  console.error(`热更新未执行：${message}`);
  process.exit(1);
}

if (process.platform !== "win32") fail("只支持 Windows；Mac 请用 mac启动/启动中文.command。");

// 老版本自更新后会调用新版的本脚本：顺带整理改名前残留的旧入口（仓库内运行时找不到汉化包目录，自动跳过）。
await finalizePackLaunchers(resolvePackRootFromCore(projectRoot)).catch(() => {});

const state = await readInstallState();
if (state?.status !== "installed" || !state.installRoot) fail("客户端还没有汉化过，请先运行“启动中文”。");

process.env.AGY_INSTALL_PATH = state.installRoot;
const inspection = await inspectInstallation({ allowRemoteCompatibility: false });
if (state.appVersion !== inspection.packageVersion || state.patchedAsarSha256 !== inspection.appAsarSha256) {
  fail(`客户端已变为 ${inspection.packageVersion}，与汉化时的 ${state.appVersion} 不同，需要运行“启动中文”。`);
}

const bundlePath = path.join(getAntigravityUserDataRoot(), BUNDLE_NAME);
const currentHash = await sha256File(bundlePath).catch(() => null);
if (!currentHash || currentHash !== state.localizedBundleSha256) {
  fail("当前中文界面文件与安装记录不一致（可能被其他程序改过），为安全起见不覆盖。请运行“启动中文”。");
}

const original = await readEmbeddedWindowsUi(inspection, { log: (line) => console.log(line) });
if (!original) fail("无法从安装目录读取原版界面，请运行“启动中文”。");

// 先校验词库格式，再生成。
const dictionary = await loadDomTranslations();
const localized = await createLocalizedBundleWithProgress(original.buffer, dictionary, { skipCoverage: true });
const newHash = sha256Buffer(localized.buffer);
const toolFingerprint = await localizationFingerprint("win32");

if (newHash === currentHash) {
  console.log("中文界面已是最新，无需更新。");
  if (!dryRun && state.toolFingerprint !== toolFingerprint) {
    await writeInstallState({ ...state, toolFingerprint, updatedAt: new Date().toISOString() });
  }
  process.exit(0);
}

if (dryRun) {
  console.log(`试运行：会把中文界面从 ${currentHash.slice(0, 12)} 更新为 ${newHash.slice(0, 12)}，未写入任何文件。`);
  process.exit(0);
}

const preparedPath = `${bundlePath}.${process.pid}.hot.tmp`;
await writeFile(preparedPath, localized.buffer, { flag: "wx" });
let replacement;
try {
  replacement = await atomicReplaceFile({
    currentPath: bundlePath,
    replacementPath: preparedPath,
    currentExpectedHash: currentHash,
    replacementExpectedHash: newHash,
  });
  if ((await sha256File(bundlePath)) !== newHash) throw new Error("替换后复检失败。");
  await writeInstallState({ ...state, toolFingerprint, localizedBundleSha256: newHash, updatedAt: new Date().toISOString() });
  await replacement.finalize().catch(() => {});
} catch (error) {
  if (replacement) await replacement.rollback().catch(() => {});
  await rm(preparedPath, { force: true }).catch(() => {});
  fail(`${error.message}（已回滚，原中文界面保持不变）`);
}

console.log(`热更新完成：中文界面已更新（${newHash.slice(0, 12)}）。`);
console.log("在客户端窗口按 Ctrl+R 刷新即可看到，或退出客户端后重新打开；不需要现在关闭客户端。");

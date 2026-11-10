import { showClient } from "../src/lib/show-client.mjs";
import { copyFile, mkdtemp, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { execFile, spawnSync } from "node:child_process";
import { localizationFingerprint } from "../src/lib/language-pack.mjs";
import { projectRoot } from "../src/lib/paths.mjs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { inspectInstallation } from "../src/lib/installation.mjs";
import { readFileFromAsar } from "../src/lib/asar-reader.mjs";
import { sha256Buffer, sha256File } from "../src/lib/hash.mjs";
import { atomicReplaceFile, buildPatchedAsar, patchCustomSchemeSource } from "../src/lib/patcher.mjs";
import { getAntigravityUserDataRoot, getStateRoot } from "../src/lib/paths.mjs";
import { findLatestUiPort, fetchUiBundle } from "../src/lib/runtime-bundle.mjs";
import { createLocalizedBundle, loadDomTranslations, writeLocalizedBundle } from "../src/lib/translator.mjs";
import { readInstallState, writeInstallState } from "../src/lib/state.mjs";
import { gracefulCloseAntigravity, launchAntigravity } from "../src/lib/processes.mjs";
import { clientProcesses } from "../src/lib/close-client.mjs";

const execFileAsync = promisify(execFile);
const CUSTOM_SCHEME_PATH = "dist/customScheme.js";
const BUNDLE_NAME = "agy_zhcn_ui_main.js";

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForRuntimeUi(executablePath) {
  if (!(await clientProcesses()).length) {
    console.log("需要临时打开原版 Antigravity 读取界面。请等终端提示后再退出客户端。");
    await launchAntigravity(executablePath);
  }
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (attempt > 0 && attempt % 10 === 0) console.log("仍在等待客户端界面就绪…");
    const port = await findLatestUiPort();
    if (port) {
      try {
        const buffer = await fetchUiBundle(port);
        if (buffer.length > 500_000) return { buffer, source: `https://127.0.0.1:${port}/main.js` };
      } catch {
        // The local server can be available before main.js is ready.
      }
    }
    await sleep(1_000);
  }
  throw new Error("两分钟内未能读取新版本运行时 UI，未修改 app.asar。");
}

async function ensureBackup(sourcePath, backupPath, expectedHash) {
  await mkdir(path.dirname(backupPath), { recursive: true });
  const existing = await sha256File(backupPath).catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
  if (existing === expectedHash) return;
  if (existing) throw new Error("发现同一版本但哈希不同的备份，拒绝覆盖。");
  const temporary = `${backupPath}.${process.pid}.tmp`;
  await copyFile(sourcePath, temporary);
  if ((await sha256File(temporary)) !== expectedHash) {
    await rm(temporary, { force: true });
    throw new Error("原始 app.asar 备份校验失败。");
  }
  await rename(temporary, backupPath);
}

async function replaceBundle(bundlePath, buffer, expectedExistingHash) {
  const expectedNewHash = sha256Buffer(buffer);
  const existingHash = await sha256File(bundlePath).catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
  const preparedPath = `${bundlePath}.${process.pid}.tmp`;
  await mkdir(path.dirname(bundlePath), { recursive: true });
  await writeFile(preparedPath, buffer, { flag: "wx" });
  if ((await sha256File(preparedPath)) !== expectedNewHash) throw new Error("中文 UI 暂存文件校验失败。");
  if (existingHash === null) {
    await rename(preparedPath, bundlePath);
    return { sha256: expectedNewHash, created: true };
  }
  if (existingHash !== expectedExistingHash) {
    await rm(preparedPath, { force: true });
    throw new Error("现有中文 UI 已被未知程序修改，拒绝覆盖。");
  }
  const replacement = await atomicReplaceFile({
    currentPath: bundlePath,
    replacementPath: preparedPath,
    currentExpectedHash: expectedExistingHash,
    replacementExpectedHash: expectedNewHash,
  });
  return { sha256: expectedNewHash, replacement };
}

console.log("正在读取客户端版本、校验汉化资源和语言包，请稍候…");
const previousState = await readInstallState();
const inspection = await inspectInstallation({ allowRemoteCompatibility: false });
const toolFingerprint = await localizationFingerprint("win32");
// Reject malformed language updates before restoring or modifying an installation.
await loadDomTranslations();
if (
  previousState?.status === "installed" &&
  previousState.installRoot?.toLowerCase() === inspection.installRoot.toLowerCase() &&
  previousState.appVersion === inspection.packageVersion &&
  previousState.patchedAsarSha256 === inspection.appAsarSha256
) {
  const currentBundleHash = await sha256File(path.join(getAntigravityUserDataRoot(), BUNDLE_NAME)).catch(error => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (previousState.toolFingerprint !== toolFingerprint || currentBundleHash !== previousState.localizedBundleSha256) {
    console.log("检测到语言包或汉化状态变化，恢复原始资源后重新应用中文。请先保存工作。");
    const restored = spawnSync(process.execPath, [path.join(projectRoot, "src/cli.mjs"), "restore"], { stdio: "inherit", windowsHide: true });
    if (restored.status !== 0) throw new Error("未完成恢复，已停止更新。");
    const updated = spawnSync(process.execPath, [path.join(projectRoot, "scripts/auto-follow-update.mjs")], { stdio: "inherit", windowsHide: true });
    process.exit(updated.status ?? 1);
  }
  console.log("当前版本已完成汉化，无需重复注入，直接启动 Antigravity。");
  await showClient(inspection.executablePath);
  process.exit(0);
}
const originalScheme = await readFileFromAsar(inspection.appAsarPath, CUSTOM_SCHEME_PATH);

// This is the compatibility gate for newly updated builds. It only accepts the
// exact structural anchors used by the patcher; an arbitrary new layout fails closed.
patchCustomSchemeSource(originalScheme.toString("utf8"));
console.log(`已检测到 ${inspection.packageVersion}，正在读取本地界面；首次准备可能需要一两分钟…`);
const runtime = await waitForRuntimeUi(inspection.executablePath);
const dictionary = await loadDomTranslations();
console.log("正在生成中文界面，可能需要几十秒，请勿关闭窗口…");
const localized = createLocalizedBundle(runtime.buffer, dictionary);

const stateRoot = getStateRoot();
const preparedBundlePath = path.join(stateRoot, "prepared", "auto-follow-ui-main.js");
await writeLocalizedBundle(preparedBundlePath, localized.buffer);
const backupPath = path.join(stateRoot, "backups", inspection.packageVersion, inspection.appAsarSha256, "app.asar");
const installedBundlePath = path.join(getAntigravityUserDataRoot(), BUNDLE_NAME);
const previousBundleHash = previousState?.localizedBundleSha256 ?? null;
const existingBundleHash = await sha256File(installedBundlePath).catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
let replaceableBundleHash = previousBundleHash;
if (existingBundleHash && existingBundleHash !== previousBundleHash) {
  const preservedBundlePath = path.join(stateRoot, "backups", "localized-ui", `${existingBundleHash}.js`);
  await ensureBackup(installedBundlePath, preservedBundlePath, existingBundleHash);
  replaceableBundleHash = existingBundleHash;
  console.log("已备份检测到的本地迭代中文 UI，再继续自动更新。");
}

console.log(`已读取 ${inspection.packageVersion} 的界面。客户端完全退出后将应用汉化并重新打开。`);
await gracefulCloseAntigravity();
const recheck = await inspectInstallation({ allowRemoteCompatibility: false });
if (recheck.appAsarSha256 !== inspection.appAsarSha256 || recheck.packageVersion !== inspection.packageVersion) {
  throw new Error("关闭客户端期间安装文件再次变化，拒绝修改。");
}
await ensureBackup(recheck.appAsarPath, backupPath, recheck.appAsarSha256);

const buildRoot = await mkdtemp(path.join(os.tmpdir(), "antigravity-zhcn-auto-"));
const builtAsarPath = path.join(buildRoot, "app.asar");
let asarReplacement;
let bundleResult;
try {
  const built = await buildPatchedAsar({
    sourceAsarPath: recheck.appAsarPath,
    outputAsarPath: builtAsarPath,
    customSchemePath: CUSTOM_SCHEME_PATH,
    expectedCustomSchemeSha256: sha256Buffer(originalScheme),
  });
  if (built.packageVersion !== recheck.packageVersion) throw new Error("补丁构建版本校验失败。");
  asarReplacement = await atomicReplaceFile({
    currentPath: recheck.appAsarPath,
    replacementPath: builtAsarPath,
    currentExpectedHash: recheck.appAsarSha256,
    replacementExpectedHash: built.patchedAsarSha256,
  });
  bundleResult = await replaceBundle(installedBundlePath, localized.buffer, replaceableBundleHash);
  await writeInstallState({
    schemaVersion: 1,
    status: "installed",
    toolFingerprint,
    appVersion: recheck.packageVersion,
    installedAt: new Date().toISOString(),
    installRoot: recheck.installRoot,
    originalAsarSha256: recheck.appAsarSha256,
    patchedAsarSha256: built.patchedAsarSha256,
    originalCustomSchemeSha256: sha256Buffer(originalScheme),
    patchedCustomSchemeSha256: built.patchedCustomSchemeSha256,
    sourceBundleSha256: sha256Buffer(runtime.buffer),
    localizedBundleSha256: bundleResult.sha256,
    backupPath,
    installedBundlePath,
    autoFollow: { structuralGate: true, appliedAt: new Date().toISOString() },
  });
  await bundleResult.replacement?.finalize();
  await asarReplacement.finalize();
} catch (error) {
  await bundleResult?.replacement?.rollback().catch(() => {});
  await asarReplacement?.rollback().catch(() => {});
  throw error;
} finally {
  await rm(buildRoot, { recursive: true, force: true });
}

console.log("汉化已自动跟进当前更新，正在重新启动 Antigravity。");
await showClient(recheck.executablePath);

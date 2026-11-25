import { showClient } from "../src/lib/show-client.mjs";
import { failure, info, ok, runTimedTask, step, warn } from "../src/lib/console-ui.mjs";

// Show a friendly summary instead of a stack trace when something goes wrong.
process.on("uncaughtException", (error) => {
  failure(error?.message ?? String(error), "保留这个窗口里的信息后重试；仍不行可到 GitHub 提交问题反馈。");
  process.exit(1);
});
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
import { findLatestUiPort, fetchUiBundle, readEmbeddedWindowsUi } from "../src/lib/runtime-bundle.mjs";
import { loadDomTranslations, writeLocalizedBundle } from "../src/lib/translator.mjs";
import { createLocalizedBundleWithProgress } from "../src/lib/localize-progress.mjs";
import { readInstallState, writeInstallState } from "../src/lib/state.mjs";
import { gracefulCloseAntigravity, launchAntigravity } from "../src/lib/processes.mjs";
import { clientProcesses } from "../src/lib/close-client.mjs";
import { applyAutoFollowSetting } from "../src/lib/auto-follow-task.mjs";
import { readUserSettings } from "../src/lib/user-settings.mjs";

const syncAutoFollow = async () => applyAutoFollowSetting((await readUserSettings()).settings).catch(() => {});

const execFileAsync = promisify(execFile);
const CUSTOM_SCHEME_PATH = "dist/customScheme.js";
const BUNDLE_NAME = "agy_zhcn_ui_main.js";
const noLaunch = process.argv.includes("--no-launch");
const ownedRestart = process.argv.includes("--owned-restart");
// Background runs must never close a client the user opened in the meantime.
const abortIfRunning = process.argv.includes("--abort-if-running");

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

// True only when this script itself launched Antigravity temporarily just to read the UI.
let launchedByTool = false;

async function waitForRuntimeUi(executablePath, setLabel) {
  if (!(await clientProcesses()).length) {
    setLabel?.("正在临时打开原版 Antigravity 读取界面（读完自动关闭）…");
    await launchAntigravity(executablePath);
    launchedByTool = true;
  }
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (attempt >= 3) setLabel?.("正在等待原版客户端界面就绪…");
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

const previousState = await readInstallState();
const inspection = await inspectInstallation({ allowRemoteCompatibility: false });
const toolFingerprint = await localizationFingerprint("win32");
// Reject malformed language updates before restoring or modifying an installation.
await loadDomTranslations();
if (process.env.AGY_UI_RERUN !== "1") ok(`客户端版本 ${inspection.packageVersion}，语言包校验通过`);
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
    if (process.env.AGY_SILENT_LAUNCH === "1") {
      const embedded = await readEmbeddedWindowsUi(inspection);
      if (embedded) {
        const dict = await loadDomTranslations();
        const relocalized = await createLocalizedBundleWithProgress(embedded.buffer, dict, { skipCoverage: true });
        const bundleTarget = path.join(getAntigravityUserDataRoot(), BUNDLE_NAME);
        await writeLocalizedBundle(bundleTarget, relocalized.buffer);
        await writeInstallState({
          ...previousState,
          toolFingerprint,
          localizedBundleSha256: sha256Buffer(relocalized.buffer),
        });
        await syncAutoFollow();
        if (!noLaunch) {
          await showClient(inspection.executablePath);
        }
        process.exit(0);
      }
    }
    info("汉化包有更新，需要先恢复原版文件，再重新应用中文。");
    process.env.AGY_UI_RERUN = "1";
    const restored = spawnSync(process.execPath, [path.join(projectRoot, "src/cli.mjs"), "restore"], { stdio: "inherit", windowsHide: true });
    if (restored.status !== 0) throw new Error("未完成恢复，已停止更新。");
    const updated = spawnSync(process.execPath, [path.join(projectRoot, "scripts/auto-follow-update.mjs")], { stdio: "inherit", windowsHide: true });
    process.exit(updated.status ?? 1);
  }
  ok("当前版本已经汉化，直接打开 Antigravity");
  await syncAutoFollow();
  if (!noLaunch) {
    await showClient(inspection.executablePath);
  }
  process.exit(0);
}
const originalScheme = await readFileFromAsar(inspection.appAsarPath, CUSTOM_SCHEME_PATH);

// This is the compatibility gate for newly updated builds. It only accepts the
// exact structural anchors used by the patcher; an arbitrary new layout fails closed.
patchCustomSchemeSource(originalScheme.toString("utf8"));
step("准备中文界面");
const runtime = await runTimedTask({
  label: "正在读取原版界面…",
  doneText: "已读取原版界面",
  work: async ({ setLabel }) => {
    return (await readEmbeddedWindowsUi(inspection)) ?? (await waitForRuntimeUi(inspection.executablePath, setLabel));
  },
});
const dictionary = await loadDomTranslations();
const localized = await createLocalizedBundleWithProgress(runtime.buffer, dictionary, { skipCoverage: true });

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
  info("已备份你本机原有的中文界面文件。");
}

try {
  if (abortIfRunning && !launchedByTool && (await clientProcesses()).length) {
    warn("客户端正在运行，后台汉化不会关闭它。");
    process.exit(3);
  }
  const closeOwnedMode = launchedByTool ? "tool-temp" : ownedRestart ? "updater-restart" : false;
  await gracefulCloseAntigravity({ owned: closeOwnedMode });
  step(noLaunch ? "应用汉化" : "应用汉化并启动");
} catch (closeErr) {
  if (closeErr?.silentUserCancelled) {
    process.exit(0);
  }
  throw closeErr;
}
const recheck = await inspectInstallation({ allowRemoteCompatibility: false });
if (recheck.appAsarSha256 !== inspection.appAsarSha256 || recheck.packageVersion !== inspection.packageVersion) {
  throw new Error("关闭客户端期间安装文件再次变化，拒绝修改。");
}
await runTimedTask({
  label: "正在备份原版文件并应用汉化…",
  doneText: "已备份原版文件并应用中文",
  work: async () => {
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
  },
});
await syncAutoFollow();
if (!noLaunch) {
  await runTimedTask({
    label: "正在启动 Antigravity 中文版…",
    doneText: "已启动 Antigravity 中文版",
    work: () => showClient(recheck.executablePath),
  });
}

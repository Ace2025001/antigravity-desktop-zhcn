import { execFile } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { access, chmod, copyFile, cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { sha256File } from "./hash.mjs";
import { getAntigravityUserDataRoot, getStateRoot, projectRoot } from "./paths.mjs";

const execFileAsync = promisify(execFile);

export const GITHUB_LATEST_RELEASE_API = "https://api.github.com/repos/Ace2025001/antigravity-desktop-zhcn/releases/latest";
export const UNIVERSAL_ASSET_NAME = "Antigravity-Windows+Mac.zip";
export const PACK_HOOK_FILENAME = "agy_zhcn_pack_hook.json";
export const PACK_UPDATE_STATE_FILENAME = "pack-update-state.json";

export function parseSemver(input) {
  const m = String(input ?? "").trim().replace(/^v/i, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function compareSemver(left, right) {
  const a = parseSemver(left);
  const b = parseSemver(right);
  if (!a || !b) return 0;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  }
  return 0;
}

export async function readLocalPackVersion(coreRoot = projectRoot) {
  try {
    const pkg = JSON.parse(await readFile(path.join(coreRoot, "package.json"), "utf8"));
    return typeof pkg.version === "string" ? pkg.version.trim() : null;
  } catch {
    return null;
  }
}

export function readMaxCompatibleAppVersion(coreRoot = projectRoot) {
  const candidates = [];
  try {
    const pkg = JSON.parse(readFileSync(path.join(coreRoot, "package.json"), "utf8"));
    const metaVer = typeof pkg?.maxSupportedClientVersion === "string" ? pkg.maxSupportedClientVersion.trim() : "";
    if (/^\d+\.\d+\.\d+$/.test(metaVer)) candidates.push(metaVer);
  } catch {
    // Ignore missing package.json
  }
  try {
    const entries = readdirSync(path.join(coreRoot, "config", "compatibility"), { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && /^\d+\.\d+\.\d+$/.test(entry.name)) {
        candidates.push(entry.name);
      }
    }
  } catch {
    // Ignore missing compatibility directory
  }
  candidates.sort((left, right) => compareSemver(right, left));
  return candidates[0] || null;
}

export function resolvePackRootFromCore(coreRoot = projectRoot) {
  // Portable universal layout: <packRoot>/语言包/核心程序
  const parent = path.dirname(coreRoot);
  if (path.basename(coreRoot) === "核心程序" && path.basename(parent) === "语言包") {
    return path.dirname(parent);
  }
  return null;
}

export async function readPackUpdateState(stateRoot = getStateRoot()) {
  try {
    return JSON.parse(await readFile(path.join(stateRoot, PACK_UPDATE_STATE_FILENAME), "utf8"));
  } catch {
    return {};
  }
}

export async function writePackUpdateState(patch, stateRoot = getStateRoot()) {
  const current = await readPackUpdateState(stateRoot);
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await mkdir(stateRoot, { recursive: true });
  const target = path.join(stateRoot, PACK_UPDATE_STATE_FILENAME);
  const tmp = `${target}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await rename(tmp, target);
  return next;
}

export async function writePackHookMetadata({
  coreRoot = projectRoot,
  languagePackDir = process.env.AGY_LANGUAGE_PACK || path.join(coreRoot, "config"),
  nodePath = process.execPath,
  packVersion,
} = {}) {
  const resolvedVersion = packVersion || (await readLocalPackVersion(coreRoot)) || "0.0.0";
  const packRoot = resolvePackRootFromCore(coreRoot) || path.dirname(languagePackDir);
  const selfUpdateScript = path.join(coreRoot, "scripts", "self-update.mjs");
  const userDataRoot = getAntigravityUserDataRoot();
  await mkdir(userDataRoot, { recursive: true });
  const hookFile = path.join(userDataRoot, PACK_HOOK_FILENAME);
  const payload = {
    schemaVersion: 1,
    packRoot,
    coreRoot,
    languagePackDir,
    nodePath,
    selfUpdateScript,
    currentVersion: resolvedVersion,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(hookFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return hookFile;
}

export async function removePackHookMetadata() {
  try {
    await rm(path.join(getAntigravityUserDataRoot(), PACK_HOOK_FILENAME), { force: true });
  } catch {
    // Ignore when userData is unavailable.
  }
}

export async function checkLatestRelease({
  currentVersion,
  fetchImpl = fetch,
  timeoutMs = 4000,
  apiUrl = GITHUB_LATEST_RELEASE_API,
} = {}) {
  if (typeof fetchImpl !== "function") return { ok: false, reason: "no-fetch" };
  try {
    const opts = {
      headers: {
        "User-Agent": "antigravity-desktop-zhcn-updater",
        Accept: "application/vnd.github+json",
      },
    };
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
      opts.signal = AbortSignal.timeout(timeoutMs);
    }
    const resp = await fetchImpl(apiUrl, opts);
    if (!resp || !resp.ok) return { ok: false, reason: `http-${resp?.status ?? "err"}` };
    const data = await resp.json().catch(() => null);
    if (!data || typeof data.tag_name !== "string") return { ok: false, reason: "invalid-payload" };
    const latestVersion = data.tag_name.trim().replace(/^v/i, "");
    if (!parseSemver(latestVersion)) return { ok: false, reason: "invalid-semver" };
    const assets = Array.isArray(data.assets) ? data.assets : [];
    const asset = assets.find((a) => a && a.name === UNIVERSAL_ASSET_NAME && typeof a.browser_download_url === "string");
    if (!asset) return { ok: false, reason: "missing-asset" };
    const digestMatch = String(asset.digest ?? "").trim().match(/^sha256:([a-f0-9]{64})$/i);
    if (!digestMatch) return { ok: false, reason: "missing-digest" };
    const hasUpdate = currentVersion ? compareSemver(latestVersion, currentVersion) > 0 : true;
    return {
      ok: true,
      hasUpdate,
      currentVersion: currentVersion || null,
      latestVersion,
      tagName: data.tag_name,
      releaseUrl: data.html_url || `https://github.com/Ace2025001/antigravity-desktop-zhcn/releases/tag/${data.tag_name}`,
      downloadUrl: asset.browser_download_url,
      expectedSha256: digestMatch[1].toLowerCase(),
      body: typeof data.body === "string" ? data.body : "",
    };
  } catch (error) {
    return { ok: false, reason: error?.name === "TimeoutError" ? "timeout" : (error?.message || "network-error") };
  }
}

export async function downloadAndVerifyAsset({
  downloadUrl,
  expectedSha256,
  destinationPath,
  fetchImpl = fetch,
  timeoutMs = 120_000,
}) {
  const opts = { headers: { "User-Agent": "antigravity-desktop-zhcn-updater" } };
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    opts.signal = AbortSignal.timeout(timeoutMs);
  }
  const resp = await fetchImpl(downloadUrl, opts);
  if (!resp || !resp.ok) throw new Error(`下载更新包失败（HTTP ${resp?.status ?? "未知"}）。`);
  const arrayBuffer = await resp.arrayBuffer();
  await mkdir(path.dirname(destinationPath), { recursive: true });
  const tmpPath = `${destinationPath}.${process.pid}.part`;
  await writeFile(tmpPath, Buffer.from(arrayBuffer));
  const actualHash = (await sha256File(tmpPath)).toLowerCase();
  if (actualHash !== expectedSha256.toLowerCase()) {
    await rm(tmpPath, { force: true }).catch(() => {});
    throw new Error(`安装包 SHA-256 校验失败（期望 ${expectedSha256.slice(0, 12)}，实际 ${actualHash.slice(0, 12)}）。`);
  }
  await rename(tmpPath, destinationPath);
  return actualHash;
}

export async function extractArchive(zipPath, destDir, platform = process.platform) {
  await mkdir(destDir, { recursive: true });
  if (platform === "win32") {
    // Expand-Archive preserves UTF-8 Chinese directory names reliably on Windows.
    await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", `Expand-Archive -LiteralPath '${zipPath.replaceAll("'", "''")}' -DestinationPath '${destDir.replaceAll("'", "''")}' -Force`],
      { windowsHide: true, timeout: 120_000 },
    );
    return;
  }
  if (platform === "darwin") {
    await execFileAsync("/usr/bin/ditto", ["-x", "-k", zipPath, destDir], { timeout: 120_000 });
    return;
  }
  await execFileAsync("unzip", ["-oq", zipPath, "-d", destDir], { timeout: 120_000 });
}

export async function findExtractedPackRoot(extractDir) {
  const direct = path.join(extractDir, "antigravity汉化包");
  try {
    await access(path.join(direct, "语言包", "核心程序", "package.json"));
    return direct;
  } catch {
    // Fall back to direct layout if archive has no outer folder.
  }
  try {
    await access(path.join(extractDir, "语言包", "核心程序", "package.json"));
    return extractDir;
  } catch {
    throw new Error("解压后的更新包目录结构不完整。");
  }
}

async function swapDirectoryAtomically(srcDir, dstDir) {
  const stageDir = `${dstDir}.next-${process.pid}`;
  const backupDir = `${dstDir}.prev-${process.pid}`;
  await rm(stageDir, { recursive: true, force: true }).catch(() => {});
  await rm(backupDir, { recursive: true, force: true }).catch(() => {});
  await cp(srcDir, stageDir, { recursive: true, force: true });
  let movedOld = false;
  try {
    try {
      await access(dstDir);
      await rename(dstDir, backupDir);
      movedOld = true;
    } catch {
      // Destination did not exist yet.
    }
    await rename(stageDir, dstDir);
    if (movedOld) await rm(backupDir, { recursive: true, force: true }).catch(() => {});
  } catch (err) {
    if (movedOld) await rename(backupDir, dstDir).catch(() => {});
    await rm(stageDir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}

export async function syncPackDirectory({
  extractedPackRoot,
  targetPackRoot,
  platform = process.platform,
  runningNodePath = process.execPath,
}) {
  const sourceLang = path.join(extractedPackRoot, "语言包");
  const targetLang = path.join(targetPackRoot, "语言包");
  const sourceCore = path.join(sourceLang, "核心程序");
  const targetCore = path.join(targetLang, "核心程序");

  await mkdir(targetCore, { recursive: true });
  for (const file of ["dom-translations.json", "macos-translations.json", "使用说明.txt"]) {
    const src = path.join(sourceLang, file);
    try {
      await access(src);
      await copyFile(src, path.join(targetLang, file));
    } catch {
      // Optional file
    }
  }
  for (const dir of ["src", "config", "scripts"]) {
    await swapDirectoryAtomically(path.join(sourceCore, dir), path.join(targetCore, dir));
  }
  await cp(path.join(sourceCore, "node_modules"), path.join(targetCore, "node_modules"), { recursive: true, force: true });
  for (const file of ["package.json", "package-lock.json", "LICENSE"]) {
    const src = path.join(sourceCore, file);
    try {
      await access(src);
      await copyFile(src, path.join(targetCore, file));
    } catch {
      // Optional
    }
  }

  for (const launcherDir of ["win启动", "mac启动"]) {
    const srcDir = path.join(extractedPackRoot, launcherDir);
    const dstDir = path.join(targetPackRoot, launcherDir);
    try {
      await access(srcDir);
    } catch {
      continue;
    }
    await mkdir(dstDir, { recursive: true });
    // Copy top-level scripts first, then runtime carefully so an active Windows node.exe lock never aborts.
    const runtimeSub = path.join(srcDir, "配套程序");
    await cp(srcDir, dstDir, {
      recursive: true,
      force: true,
      filter: (src) => !src.startsWith(runtimeSub),
    });
    try {
      await access(runtimeSub);
      const dstRuntime = path.join(dstDir, "配套程序");
      await mkdir(dstRuntime, { recursive: true });
      const nodeName = launcherDir === "win启动" ? "node.exe" : "node";
      const srcNode = path.join(runtimeSub, nodeName);
      const dstNode = path.join(dstRuntime, nodeName);
      const isActiveWinNode =
        platform === "win32" &&
        path.resolve(dstNode).toLowerCase() === path.resolve(runningNodePath).toLowerCase();
      let skipNode = false;
      if (isActiveWinNode) {
        const [h1, h2] = await Promise.all([sha256File(srcNode).catch(() => null), sha256File(dstNode).catch(() => null)]);
        if (h1 && h2 && h1 === h2) skipNode = true;
      }
      await cp(runtimeSub, dstRuntime, {
        recursive: true,
        force: true,
        filter: (src) => !(skipNode && path.resolve(src) === path.resolve(srcNode)),
      });
    } catch {
      // No runtime subdir
    }
  }

  await finalizePackLaunchers(targetPackRoot, platform);
}

// 入口文件名：v3.1.7 起“恢复英文”改名为“卸载汉化”；v3.1.9 起仅保留“启动中文”与“卸载汉化”，设置全部进客户端“汉化中心”。
export const PACK_LAUNCHER_NAMES = ["启动中文", "卸载汉化"];
const LEGACY_LAUNCHER_REMOVALS = ["恢复英文", "汉化设置"];

// 升级后整理入口：新入口已就位时删除旧的“恢复英文”与旧版目录“汉化设置”；Mac 上补齐可执行权限。
// 老版本自更新只覆盖复制入口目录，旧入口会残留，由新版代码在下次运行时自动清理。
export async function finalizePackLaunchers(packRoot, platform = process.platform) {
  if (!packRoot) return;
  for (const [dir, ext] of [["win启动", "bat"], ["mac启动", "command"]]) {
    const entryDir = path.join(packRoot, dir);
    let hasAllCurrent = true;
    for (const current of PACK_LAUNCHER_NAMES) {
      try {
        await access(path.join(entryDir, `${current}.${ext}`));
      } catch {
        hasAllCurrent = false;
        break;
      }
    }
    if (hasAllCurrent) {
      for (const legacy of LEGACY_LAUNCHER_REMOVALS) {
        await rm(path.join(entryDir, `${legacy}.${ext}`), { force: true }).catch(() => {});
      }
    }
  }
  if (platform === "darwin") {
    const macDir = path.join(packRoot, "mac启动");
    for (const rel of [...PACK_LAUNCHER_NAMES.map((name) => `${name}.command`), "配套程序/node"]) {
      await chmod(path.join(macDir, rel), 0o755).catch(() => {});
    }
  }
}

export async function performSelfUpdate({
  packRoot,
  coreRoot = projectRoot,
  stateRoot = getStateRoot(),
  platform = process.platform,
  fetchImpl = fetch,
  dryRun = false,
  force = false,
  timeoutMs = 4000,
} = {}) {
  const resolvedPackRoot = packRoot || resolvePackRootFromCore(coreRoot);
  if (!resolvedPackRoot) {
    throw new Error("当前运行目录不是独立汉化包目录（缺少 语言包/核心程序 层级），请从已解压的汉化包执行自更新。");
  }
  try {
    await access(path.join(resolvedPackRoot, ".git"));
    throw new Error("当前为源码开发仓库，跳过覆盖。");
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }

  const currentVersion = await readLocalPackVersion(coreRoot);
  const check = await checkLatestRelease({ currentVersion, fetchImpl, timeoutMs });
  if (!check.ok) {
    return { status: "check-failed", currentVersion, reason: check.reason };
  }
  if (!check.hasUpdate && !force) {
    return { status: "up-to-date", currentVersion, latestVersion: check.latestVersion };
  }
  if (dryRun) {
    return { status: "update-available", currentVersion, latestVersion: check.latestVersion, releaseUrl: check.releaseUrl };
  }

  const workDir = await mkdtemp(path.join(os.tmpdir(), "agy-zhcn-selfupdate-"));
  const zipPath = path.join(workDir, UNIVERSAL_ASSET_NAME);
  const extractDir = path.join(workDir, "extracted");
  try {
    await downloadAndVerifyAsset({
      downloadUrl: check.downloadUrl,
      expectedSha256: check.expectedSha256,
      destinationPath: zipPath,
      fetchImpl,
    });
    await extractArchive(zipPath, extractDir, platform);
    const extractedRoot = await findExtractedPackRoot(extractDir);
    const newVersion = await readLocalPackVersion(path.join(extractedRoot, "语言包", "核心程序"));
    if (newVersion && check.latestVersion && compareSemver(newVersion, check.latestVersion) !== 0) {
      throw new Error(`解压包版本号不匹配（期望 ${check.latestVersion}，实际 ${newVersion}）。`);
    }
    await syncPackDirectory({
      extractedPackRoot: extractedRoot,
      targetPackRoot: resolvedPackRoot,
      platform,
    });
    await writePackUpdateState({
      lastUpdatedTo: check.latestVersion,
      lastCheckedAt: new Date().toISOString(),
    }, stateRoot);
    return {
      status: "updated",
      previousVersion: currentVersion,
      latestVersion: check.latestVersion,
      releaseUrl: check.releaseUrl,
      packRoot: resolvedPackRoot,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

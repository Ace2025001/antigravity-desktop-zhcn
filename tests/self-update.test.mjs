import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import {
  checkLatestRelease,
  compareSemver,
  downloadAndVerifyAsset,
  parseSemver,
  performSelfUpdate,
  resolvePackRootFromCore,
  syncPackDirectory,
  UNIVERSAL_ASSET_NAME,
} from "../src/lib/self-update.mjs";

function sha256Hex(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

test("语义版本号解析与比较", () => {
  assert.deepEqual(parseSemver("v3.1.4"), [3, 1, 4]);
  assert.deepEqual(parseSemver("3.2.0-beta.1"), [3, 2, 0]);
  assert.equal(parseSemver("invalid"), null);
  assert.equal(compareSemver("3.1.4", "3.1.3"), 1);
  assert.equal(compareSemver("3.1.3", "v3.1.3"), 0);
  assert.equal(compareSemver("3.1.3", "3.2.0"), -1);
});

test("resolvePackRootFromCore 仅识别标准通用包目录层级", () => {
  const root = path.join("D:", "tools", "antigravity汉化包");
  assert.equal(
    resolvePackRootFromCore(path.join(root, "语言包", "核心程序")),
    root,
  );
  assert.equal(resolvePackRootFromCore("D:\\repo\\antigravity-desktop-zhcn"), null);
});

test("checkLatestRelease 解析版本与 SHA-256 摘要，缺摘要或状态异常时拒绝", async () => {
  const validHex = "a".repeat(64);
  const okCheck = await checkLatestRelease({
    currentVersion: "3.1.3",
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        tag_name: "v3.1.4",
        html_url: "https://github.com/Ace2025001/antigravity-desktop-zhcn/releases/tag/v3.1.4",
        assets: [
          {
            name: UNIVERSAL_ASSET_NAME,
            browser_download_url: "https://example.invalid/Antigravity-Windows+Mac.zip",
            digest: `sha256:${validHex}`,
          },
        ],
      }),
    }),
  });
  assert.equal(okCheck.ok, true);
  assert.equal(okCheck.hasUpdate, true);
  assert.equal(okCheck.latestVersion, "3.1.4");
  assert.equal(okCheck.expectedSha256, validHex);

  const sameVer = await checkLatestRelease({
    currentVersion: "3.1.4",
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        tag_name: "v3.1.4",
        assets: [
          {
            name: UNIVERSAL_ASSET_NAME,
            browser_download_url: "https://example.invalid/pack.zip",
            digest: `sha256:${validHex}`,
          },
        ],
      }),
    }),
  });
  assert.equal(sameVer.ok, true);
  assert.equal(sameVer.hasUpdate, false);

  const missingDigest = await checkLatestRelease({
    currentVersion: "3.1.3",
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        tag_name: "v3.1.4",
        assets: [{ name: UNIVERSAL_ASSET_NAME, browser_download_url: "https://example.invalid/pack.zip" }],
      }),
    }),
  });
  assert.equal(missingDigest.ok, false);
  assert.equal(missingDigest.reason, "missing-digest");

  const netErr = await checkLatestRelease({
    currentVersion: "3.1.3",
    fetchImpl: async () => {
      throw new Error("timeout");
    },
  });
  assert.equal(netErr.ok, false);
});

test("downloadAndVerifyAsset 校验 SHA-256 并在失败时清理临时文件", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agy-dl-verify-"));
  try {
    const payload = Buffer.from("zip-binary-content", "utf8");
    const goodPath = path.join(dir, "good.zip");
    const hash = await downloadAndVerifyAsset({
      downloadUrl: "https://example.invalid/good.zip",
      expectedSha256: sha256Hex(payload),
      destinationPath: goodPath,
      fetchImpl: async () => ({ ok: true, arrayBuffer: async () => payload }),
    });
    assert.equal(hash, sha256Hex(payload));

    const badPath = path.join(dir, "bad.zip");
    await assert.rejects(
      () =>
        downloadAndVerifyAsset({
          downloadUrl: "https://example.invalid/bad.zip",
          expectedSha256: "f".repeat(64),
          destinationPath: badPath,
          fetchImpl: async () => ({ ok: true, arrayBuffer: async () => payload }),
        }),
      /SHA-256 校验失败/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("performSelfUpdate 与 syncPackDirectory：校验失败绝不破坏本地汉化包，目录同步正确覆盖", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "agy-selfupdate-"));
  try {
    const targetPack = path.join(tmp, "target", "antigravity汉化包");
    const targetCore = path.join(targetPack, "语言包", "核心程序");
    await mkdir(path.join(targetCore, "src"), { recursive: true });
    await mkdir(path.join(targetCore, "config"), { recursive: true });
    await mkdir(path.join(targetCore, "scripts"), { recursive: true });
    await mkdir(path.join(targetCore, "node_modules"), { recursive: true });
    await writeFile(path.join(targetCore, "package.json"), JSON.stringify({ version: "3.1.3" }), "utf8");
    await writeFile(path.join(targetCore, "config", "dom-translations.json"), '{"old":true}', "utf8");

    const stateRoot = path.join(tmp, "state");
    const badBuf = Buffer.from("corrupted", "utf8");
    await assert.rejects(
      () =>
        performSelfUpdate({
          packRoot: targetPack,
          coreRoot: targetCore,
          stateRoot,
          fetchImpl: async (url) => {
            if (String(url).includes("releases/latest")) {
              return {
                ok: true,
                json: async () => ({
                  tag_name: "v3.1.4",
                  assets: [
                    {
                      name: UNIVERSAL_ASSET_NAME,
                      browser_download_url: "https://example.invalid/pack.zip",
                      digest: `sha256:${"0".repeat(64)}`,
                    },
                  ],
                }),
              };
            }
            return { ok: true, arrayBuffer: async () => badBuf };
          },
        }),
      /SHA-256 校验失败/,
    );
    // 校验失败时原有词典保留完好
    assert.equal(await readFile(path.join(targetCore, "config", "dom-translations.json"), "utf8"), '{"old":true}');

    // 同步新解压包目录结构
    const extracted = path.join(tmp, "extracted", "antigravity汉化包");
    const srcCore = path.join(extracted, "语言包", "核心程序");
    await mkdir(path.join(srcCore, "src"), { recursive: true });
    await mkdir(path.join(srcCore, "config"), { recursive: true });
    await mkdir(path.join(srcCore, "scripts"), { recursive: true });
    await mkdir(path.join(srcCore, "node_modules"), { recursive: true });
    await writeFile(path.join(srcCore, "package.json"), JSON.stringify({ version: "3.1.4" }), "utf8");
    await writeFile(path.join(srcCore, "config", "dom-translations.json"), '{"new":true}', "utf8");
    await mkdir(path.join(extracted, "win启动"), { recursive: true });
    await writeFile(path.join(extracted, "win启动", "启动中文.bat"), "@echo off\r\n", "utf8");

    await syncPackDirectory({ extractedPackRoot: extracted, targetPackRoot: targetPack });
    const updatedPkg = JSON.parse(await readFile(path.join(targetCore, "package.json"), "utf8"));
    assert.equal(updatedPkg.version, "3.1.4");
    assert.equal(await readFile(path.join(targetCore, "config", "dom-translations.json"), "utf8"), '{"new":true}');

    // 旧版中存在但新版已删的文件会在目录切换时被自动清理，不再残余
    await writeFile(path.join(targetCore, "src", "obsolete-legacy.mjs"), "// stale", "utf8");
    await writeFile(path.join(srcCore, "src", "fresh.mjs"), "// fresh", "utf8");
    await syncPackDirectory({ extractedPackRoot: extracted, targetPackRoot: targetPack });
    await assert.rejects(() => readFile(path.join(targetCore, "src", "obsolete-legacy.mjs"), "utf8"), /ENOENT/);
    assert.equal(await readFile(path.join(targetCore, "src", "fresh.mjs"), "utf8"), "// fresh");

    // 即使显式传入 packRoot，只要包含 .git 开发目录就必须拒绝覆盖
    await mkdir(path.join(targetPack, ".git"), { recursive: true });
    await assert.rejects(
      () => performSelfUpdate({ packRoot: targetPack, coreRoot: targetCore, stateRoot }),
      /源码开发仓库/,
    );
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("主进程启动检查策略：whenReady 挂载汉化包检查、先于弹窗引用设置并支持 24h 免打扰", async () => {
  const patcher = await readFile(new URL("../src/lib/patcher.mjs", import.meta.url), "utf8");
  const daemon = await readFile(new URL("../scripts/silent-auto-follow-daemon.mjs", import.meta.url), "utf8");
  assert.ok(patcher.includes("runStartupPackUpdateCheck"));
  assert.ok(patcher.includes("agy_zhcn_pack_hook.json"));
  assert.ok(patcher.includes("packAutoUpdate"));
  assert.ok(patcher.includes("snoozedUntil"));
  assert.ok(daemon.includes("snoozedUntil"));
});

test("退出跟进竞态防护：自更新等待期间客户端替换会立即让路，且 waitForInstalledUpdate 仍能凭初始指纹检出", async () => {
  const { waitForClientsClosed, waitForInstalledUpdate } = await import("../scripts/silent-auto-follow-daemon.mjs");
  const fakeState = { installRoot: "C:\\Fake\\Antigravity" };
  let currentStamp = "100:1000";
  let polls = 0;

  // 模拟等待进程退出期间（第 2 次轮询）客户端安装器替换了 app.asar
  const waitRes = await waitForClientsClosed(fakeState, "100:1000", 500, {
    pollMs: 5,
    listProcesses: async () => [{ Id: 999 }],
    getAsarStamp: async () => {
      polls += 1;
      if (polls >= 2) currentStamp = "200:2000";
      return currentStamp;
    },
  });
  assert.equal(waitRes.clientUpdatedDuringWait, true);
  assert.equal(waitRes.closed, false);

  // 即使汉化包检查流程耗时完毕、开始等待更新时 app.asar 已经完成替换，传入开局指纹仍可检出更新
  const detected = await waitForInstalledUpdate(fakeState, "100:1000", {
    pollMs: 5,
    maxWaitMs: 300,
    getAsarStamp: async () => "200:2000",
  });
  assert.equal(detected, true);
});

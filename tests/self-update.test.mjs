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
  finalizePackLaunchers,
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

test("入口精简：新入口就位时删除旧的“恢复英文”和旧版“汉化设置”，新入口保留；只有旧入口时保留旧入口", async () => {
  const pack = await mkdtemp(path.join(os.tmpdir(), "agy-launchers-"));
  try {
    const win = path.join(pack, "win启动");
    const mac = path.join(pack, "mac启动");
    await mkdir(win, { recursive: true });
    await mkdir(mac, { recursive: true });
    for (const name of ["启动中文.bat", "卸载汉化.bat", "恢复英文.bat", "汉化设置.bat"]) await writeFile(path.join(win, name), "@echo off\r\n");
    // Mac 目录只有旧入口（模拟没升级到新入口的情况）
    await writeFile(path.join(mac, "恢复英文.command"), "#!/bin/bash\n");
    await writeFile(path.join(mac, "汉化设置.command"), "#!/bin/bash\n");

    await finalizePackLaunchers(pack, "win32");

    const exists = (p) => readFile(p).then(() => true, () => false);
    assert.equal(await exists(path.join(win, "恢复英文.bat")), false, "旧恢复英文入口应删除");
    assert.equal(await exists(path.join(win, "汉化设置.bat")), false, "旧版汉化设置入口应删除");
    assert.equal(await exists(path.join(win, "卸载汉化.bat")), true, "新入口必须保留");
    assert.equal(await exists(path.join(win, "启动中文.bat")), true);
    assert.equal(await exists(path.join(mac, "恢复英文.command")), true, "新入口不在时保留旧入口");
    assert.equal(await exists(path.join(mac, "汉化设置.command")), true, "新入口不在时保留旧入口");

    await finalizePackLaunchers(null);
  } finally {
    await rm(pack, { recursive: true, force: true });
  }
});

test("第一层版本曝光：汉化设置可查看当前版本、已适配最高客户端版本并触发检查/更新，弹窗规格齐全", async () => {
  const { PassThrough } = await import("node:stream");
  const { runSettingsMenu } = await import("../src/lib/settings-prompts.mjs");
  const { readMaxCompatibleAppVersion } = await import("../src/lib/self-update.mjs");
  const { getPackLatestDialogSpec, getPackCheckErrorDialogSpec, getPackUpdatedDialogSpec } = await import("../src/lib/modern-dialog.mjs");

  const latestSpec = getPackLatestDialogSpec({ currentVersion: "3.1.7", latestVersion: "3.1.7" });
  assert.match(latestSpec.headline, /v3\.1\.7/);
  const errSpec = getPackCheckErrorDialogSpec({ currentVersion: "3.1.7", detail: "timeout" });
  assert.match(errSpec.message, /timeout/);
  const updSpec = getPackUpdatedDialogSpec({ latestVersion: "3.1.8", hotUpdated: true });
  assert.match(updSpec.message, /Ctrl\+R/);

  const stateDir = await mkdtemp(path.join(os.tmpdir(), "agy-menu-ver-"));
  const packDir = await mkdtemp(path.join(os.tmpdir(), "agy-pack-ver-"));
  const savedState = process.env.AGY_ZHCN_STATE_DIR;
  try {
    process.env.AGY_ZHCN_STATE_DIR = stateDir;
    const coreDir = path.join(packDir, "语言包", "核心程序");
    await mkdir(path.join(coreDir, "config", "compatibility", "2.23.1"), { recursive: true });
    assert.equal(readMaxCompatibleAppVersion(coreDir), "2.23.1");
    await writeFile(path.join(coreDir, "package.json"), JSON.stringify({ version: "3.1.7", maxSupportedClientVersion: "2.35.2" }), "utf8");
    assert.equal(readMaxCompatibleAppVersion(coreDir), "2.35.2");
    assert.equal(readMaxCompatibleAppVersion(), "2.35.2", "仓库默认配置最高适配客户端应为 2.35.2");

    const stdin = new PassThrough();
    const stdout = new PassThrough();
    stdin.isTTY = true;
    stdout.isTTY = true;
    let promptBuf = "";
    let step = 0;
    stdout.on("data", (chunk) => {
      promptBuf += chunk.toString("utf8");
      if (step === 0 && promptBuf.includes("请输入要修改的序号")) {
        step = 1;
        promptBuf = "";
        setImmediate(() => stdin.write("5\n"));
      } else if (step === 1 && promptBuf.includes("是否立即下载校验并更新")) {
        step = 2;
        promptBuf = "";
        setImmediate(() => stdin.write("y\n"));
      } else if (step === 2 && promptBuf.includes("请输入要修改的序号")) {
        step = 3;
        promptBuf = "";
        setImmediate(() => stdin.write("0\n"));
      }
    });

    let checkedCount = 0;
    let updatedCalled = false;
    const logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(" "));
    try {
      const code = await runSettingsMenu({
        platform: "win32",
        coreRoot: coreDir,
        input: stdin,
        output: stdout,
        checkRelease: async ({ currentVersion }) => {
          checkedCount += 1;
          return {
            ok: true,
            hasUpdate: true,
            currentVersion,
            latestVersion: "3.1.8",
            releaseUrl: "https://github.com/Ace2025001/antigravity-desktop-zhcn/releases/tag/v3.1.8",
          };
        },
        runSelfUpdate: async ({ packRoot }) => {
          updatedCalled = true;
          assert.equal(packRoot, packDir);
          return { status: "updated", latestVersion: "3.1.8", packRoot };
        },
        applyUpdatedClient: async () => ({ mode: "hot", ok: true }),
      });
      stdin.end();
      assert.equal(code, 0);
    } finally {
      console.log = origLog;
    }

    assert.ok(checkedCount >= 2);
    assert.equal(updatedCalled, true);
    const allLogs = logs.join("\n");
    assert.match(allLogs, /当前 v3\.1\.7/);
    assert.match(allLogs, /已适配最高客户端版本：2\.35\.2/);
    assert.match(allLogs, /立即检查并更新汉化包/);
    assert.match(allLogs, /已更新至最新版本 v3\.1\.8/);
  } finally {
    if (savedState === undefined) delete process.env.AGY_ZHCN_STATE_DIR;
    else process.env.AGY_ZHCN_STATE_DIR = savedState;
    await rm(stateDir, { recursive: true, force: true });
    await rm(packDir, { recursive: true, force: true });
  }
});

import { access, copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { runMacSetup } from "../src/lib/mac-setup.mjs";
import { buildPatchedAsar, patchCustomSchemeSource } from "../src/lib/patcher.mjs";
import { readFileFromAsar, readJsonFromAsar } from "../src/lib/asar-reader.mjs";
import { sha256Buffer, sha256File } from "../src/lib/hash.mjs";
import { fetchUiBundle } from "../src/lib/runtime-bundle.mjs";
import { createLocalizedBundle, loadDomTranslations } from "../src/lib/translator.mjs";
import { asarHeaderHash, exec, findMacOriginal, findMacUiPort, macAppPath, macResources, macStateRoot, macUserData, openMacApp, requireMacAppsClosed, runningMacApps } from "../src/lib/macos.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const statePath = path.join(macStateRoot, "state.json");
const runtimePath = path.join(macStateRoot, "cache", "main.js");
const schemePath = "dist/customScheme.js";
const command = process.argv[2] ?? "check";

async function readState() {
  try { return JSON.parse(await readFile(statePath, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

async function inspectOriginal() {
  const original = await findMacOriginal();
  const asar = path.join(macResources(original), "app.asar");
  const pkg = await readJsonFromAsar(asar, "package.json");
  if (pkg.name !== "antigravity") throw new Error("目标不是 Antigravity Desktop。");
  const scheme = await readFileFromAsar(asar, schemePath);
  patchCustomSchemeSource(scheme.toString("utf8"));
  const { stdout } = await exec("/usr/bin/file", [path.join(original, "Contents", "MacOS", "Antigravity")]);
  if (!stdout.includes(process.arch === "arm64" ? "arm64" : "x86_64")) throw new Error("Mac 应用与当前 Node 架构不匹配。");
  await exec("/usr/bin/codesign", ["--verify", "--deep", "--strict", original], { timeout: 120_000 });
  return { original, asar, version: pkg.version, originalHash: await sha256File(asar), schemeHash: sha256Buffer(scheme) };
}

async function capture(info) {
  const apps = await runningMacApps();
  if (apps.length !== 1 || apps[0].executable !== path.join(info.original, "Contents", "MacOS", "Antigravity")) throw new Error("采集时必须仅运行所选官方原版，以免混用其他构建的 UI。");
  const port = await findMacUiPort();
  if (!port) throw new Error("请先打开官方 Antigravity 主界面，再运行采集。");
  const buffer = await fetchUiBundle(port);
  if (buffer.length < 500_000 || !buffer.includes(Buffer.from("Settings"))) throw new Error("运行时主界面结构异常。");
  await mkdir(path.dirname(runtimePath), { recursive: true });
  await writeFile(runtimePath, buffer);
  await writeFile(`${runtimePath}.json`, JSON.stringify({ ...info, uiHash: sha256Buffer(buffer), uiSize: buffer.length }, null, 2));
  console.log(`已采集 ${info.version} 原版主界面，${buffer.length} 字节；未读取登录凭据。`);
}

async function verify(state) {
  if (!state || state.appPath !== macAppPath) throw new Error("没有当前工具创建的 Mac 中文版状态。");
  if (await sha256File(path.join(macResources(macAppPath), "app.asar")) !== state.patchedAsarSha256) throw new Error("中文版资源已变化，请重新检查。");
  if (await sha256File(state.bundlePath) !== state.localizedBundleSha256) throw new Error("中文版 UI 指纹不匹配。");
  const archive = await readFile(path.join(macResources(macAppPath), "app.asar"));
  const { stdout } = await exec("/usr/bin/plutil", ["-extract", "ElectronAsarIntegrity", "json", "-o", "-", path.join(macAppPath, "Contents", "Info.plist")]);
  if (JSON.parse(stdout)["Resources/app.asar"].hash !== asarHeaderHash(archive)) throw new Error("ASAR 嵌入校验不匹配。");
  await exec("/usr/bin/codesign", ["--verify", "--deep", "--strict", macAppPath], { timeout: 120_000 });
  console.log(`Mac 中文版 ${state.version}：资源、中文 UI、ASAR 完整性和本地签名均通过检查。`);
}

async function install(info) {
  await requireMacAppsClosed();
  const toolFingerprint = sha256Buffer(Buffer.concat(await Promise.all([
    "src/lib/patcher.mjs", "src/lib/translator.mjs", "src/lib/macos.mjs", "scripts/macos.mjs", "config/dom-translations.json", "config/macos-translations.json",
  ].map((file) => readFile(path.join(root, file))))));
  const previous = await readState();
  let exists = false;
  try { await access(macAppPath); exists = true; } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (exists) {
    await verify(previous); // Never overwrite an unknown app.
    if (previous.originalAsarSha256 === info.originalHash && previous.toolFingerprint === toolFingerprint) {
      console.log("当前构建已安装；可使用 launch 启动。");
      return;
    }
  }
  const runtime = await readFile(runtimePath);
  const meta = JSON.parse(await readFile(`${runtimePath}.json`, "utf8"));
  if (meta.originalHash !== info.originalHash || meta.uiHash !== sha256Buffer(runtime)) throw new Error("运行时缓存不属于当前原版构建；请重新采集。");
  console.log("正在生成并检查当前版本的中文界面…");
  const dictionary = await loadDomTranslations();
  const macDictionary = JSON.parse(await readFile(path.join(root, "config/macos-translations.json"), "utf8"));
  Object.assign(dictionary.exact, macDictionary.exact);
  dictionary.patterns.push(...macDictionary.patterns);
  const localized = createLocalizedBundle(runtime, dictionary);
  await mkdir(macStateRoot, { recursive: true });
  const stagedRoot = await mkdtemp(path.join(macStateRoot, "build-"));
  const stagedApp = path.join(stagedRoot, "Antigravity 中文.app");
  const bundlePath = path.join(macUserData, "agy_zhcn_ui_main.js");
  let previousBundle;
  try { previousBundle = await readFile(bundlePath); } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (previousBundle && (!previous || sha256Buffer(previousBundle) !== previous.localizedBundleSha256)) throw new Error("已有未知来源中文 UI，拒绝覆盖。");
  const oldApp = path.join(macStateRoot, `previous-${Date.now()}.app`);
  let displaced = false;
  let committed = false;
  try {
    console.log("复制原版，构建独立 Mac 中文版…");
    await exec("/usr/bin/ditto", [info.original, stagedApp], { timeout: 120_000 });
    const prepared = path.join(stagedRoot, "patched.asar");
    const built = await buildPatchedAsar({ sourceAsarPath: info.asar, outputAsarPath: prepared, customSchemePath: schemePath, expectedCustomSchemeSha256: info.schemeHash });
    const localizedPath = path.join(stagedRoot, "localized.js");
    await writeFile(localizedPath, localized.buffer);
    await exec(process.execPath, ["--check", localizedPath]);
    await copyFile(prepared, path.join(macResources(stagedApp), "app.asar"));
    const { signMacApp } = await import("../src/lib/macos.mjs");
    await signMacApp(stagedApp);
    if (await sha256File(info.asar) !== info.originalHash) throw new Error("原版安装在构建期间发生变化。");
    await requireMacAppsClosed();
    await mkdir(path.dirname(macAppPath), { recursive: true });
    await mkdir(macUserData, { recursive: true });
    if (exists) { await rename(macAppPath, oldApp); displaced = true; }
    await rename(stagedApp, macAppPath);
    committed = true;
    await writeFile(`${bundlePath}.tmp`, localized.buffer);
    await rename(`${bundlePath}.tmp`, bundlePath);
    const state = { schemaVersion: 1, platform: "darwin", arch: process.arch, version: info.version, originalApp: info.original, appPath: macAppPath, originalAsarSha256: info.originalHash, patchedAsarSha256: built.patchedAsarSha256, localizedBundleSha256: sha256Buffer(localized.buffer), bundlePath, uiHash: meta.uiHash, toolFingerprint, installedAt: new Date().toISOString() };
    await verify(state);
    await writeFile(`${statePath}.tmp`, JSON.stringify(state, null, 2));
    await rename(`${statePath}.tmp`, statePath);
    if (displaced) console.log(`上一版已保留：${oldApp}`);
    console.log(`已部署：${macAppPath}；官方原版保持原样。`);
  } catch (error) {
    if (committed) await rm(macAppPath, { recursive: true, force: true });
    if (displaced) await rename(oldApp, macAppPath);
    if (previousBundle) await writeFile(bundlePath, previousBundle);
    else if (committed) await rm(bundlePath, { force: true });
    throw error;
  } finally {
    await rm(stagedRoot, { recursive: true, force: true });
  }
}

try {
  if (process.platform !== "darwin") throw new Error("此入口只支持 macOS。");
  if (command === "setup") {
    if (!process.stdin.isTTY) throw new Error("请双击“安装中文.command”，在窗口中按提示操作。");
    const terminal = createInterface({ input: process.stdin, output: process.stdout });
    try {
      await runMacSetup({
        inspect: inspectOriginal,
        waitUntilClosed: async () => {
          while ((await runningMacApps()).length) {
            await terminal.question("请保存工作，并在 Antigravity 中按 ⌘Q 退出，然后回到这里按回车：");
          }
        },
        openOriginal: openMacApp,
        ready: () => terminal.question("看到 Antigravity 首页后，请回到这里按回车继续："),
        capture,
        install,
        launch: async () => { await verify(await readState()); await requireMacAppsClosed(); await openMacApp(macAppPath); },
        log: console.log,
      });
    } finally { terminal.close(); }
  } else if (command === "verify" || command === "launch") {
    await verify(await readState());
    if (command === "launch") { await requireMacAppsClosed(); await openMacApp(macAppPath); }
  } else if (command === "restore") {
    await requireMacAppsClosed();
    const original = await findMacOriginal();
    await openMacApp(original);
    console.log("已启动未修改的官方英文版；中文副本及恢复状态继续保留。");
  } else {
    const info = await inspectOriginal();
    if (command === "check") console.log(`官方 Mac 版 ${info.version} (${process.arch})：签名及补丁锚点检查通过。\n原版：${info.original}\n中文副本：${macAppPath}`);
    else if (command === "capture") await capture(info);
    else if (command === "install") await install(info);
    else throw new Error("用法：node scripts/macos.mjs setup|check|capture|install|verify|launch|restore");
  }
} catch (error) {
  console.error(`Mac 汉化失败：${error.message}`);
  process.exitCode = 1;
}

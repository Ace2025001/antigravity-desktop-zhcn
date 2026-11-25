import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { asarHeaderHash, signMacApp } from "../src/lib/macos.mjs";
import { sha256Buffer } from "../src/lib/hash.mjs";
import { patchCustomSchemeSource } from "../src/lib/patcher.mjs";
import { translateDictionaryValue } from "../src/lib/translator.mjs";

test("Mac embedded ASAR integrity hashes only the JSON header", () => {
  const json = Buffer.from('{"files":{}}');
  const buffer = Buffer.alloc(16 + json.length + 4);
  buffer.writeUInt32LE(json.length, 12);
  json.copy(buffer, 16);
  assert.equal(asarHeaderHash(buffer), sha256Buffer(json).toLowerCase());
  buffer[buffer.length - 1] = 99;
  assert.equal(asarHeaderHash(buffer), sha256Buffer(json).toLowerCase());
  assert.throws(() => asarHeaderHash(Buffer.alloc(12)), /文件头不完整/);
  buffer.writeUInt32LE(99999, 12);
  assert.throws(() => asarHeaderHash(buffer), /尺寸异常/);
});

test("Mac menu localization preserves native actions and updater dispatch keys", () => {
  const fixture = `function registerCustomSchemes() {
    protocol.registerSchemesAsPrivileged([
        {
            scheme: 'plugin',
        },
    ]);
}
function registerCustomSchemeHandlers() {
    protocol.handle('plugin', async () => {
    });
}
`;
  let installedMenu;
  function Menu() {}
  Menu.buildFromTemplate = (value) => value;
  Menu.setApplicationMenu = (value) => { installedMenu = value; };
  const protocol = { handle() {} };
  const electron = { Menu, protocol, session: { defaultSession: { clearCache: async () => {}, webRequest: { onBeforeRequest() {} } } } };
  const context = { electron_1: electron, process: { platform: "darwin" }, protocol, console, require: createRequire(import.meta.url) };
  vm.runInNewContext(patchCustomSchemeSource(fixture) + "\nregisterCustomSchemeHandlers();", context);
  const click = () => "original action";
  const menu = { items: [{ label: "File", submenu: { items: [{ label: "New Window", accelerator: "Cmd+N", click }] } }, { label: "Check for Updates", click }] };
  Menu.setApplicationMenu(menu);
  assert.equal(installedMenu, menu);
  assert.equal(menu.items[0].label, "文件");
  assert.equal(menu.items[0].submenu.items[0].label, "新建窗口");
  assert.equal(menu.items[0].submenu.items[0].accelerator, "Cmd+N");
  assert.equal(menu.items[0].submenu.items[0].click, click);
  assert.equal(menu.items[1].label, "Check for Updates");
  assert.equal(menu.items[1].click(), "original action");
});

test("Mac current-version dictionary preserves the name in the greeting", async () => {
  const dictionary = JSON.parse(await readFile(new URL("../config/macos-translations.json", import.meta.url), "utf8"));
  assert.equal(translateDictionaryValue("Hi Test User, what can we get done today?", dictionary), "你好，Test User，今天我们来完成什么？");
  assert.equal(translateDictionaryValue("A user-authored sentence", dictionary), null);
});

test("Mac signMacApp signs nested bundle deeply with entitlements only to avoid Team ID mismatch", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agy-mac-sign-"));
  try {
    const appPath = path.join(dir, "Antigravity 中文.app");
    await mkdir(path.join(appPath, "Contents", "Resources"), { recursive: true });
    await writeFile(path.join(appPath, "Contents", "Info.plist"), "<plist/>");
    const json = Buffer.from('{"files":{}}');
    const asar = Buffer.alloc(16 + json.length);
    asar.writeUInt32LE(json.length, 12);
    json.copy(asar, 16);
    await writeFile(path.join(appPath, "Contents", "Resources", "app.asar"), asar);

    const calls = [];
    await signMacApp(appPath, {
      execFile: async (cmd, args) => {
        calls.push({ cmd, args });
        if (cmd === "/usr/bin/plutil" && args[0] === "-extract") {
          return { stdout: JSON.stringify({ "Resources/app.asar": { algorithm: "SHA256", hash: "old" } }) };
        }
        return { stdout: "" };
      },
    });

    const signCall = calls.find((c) => c.cmd === "/usr/bin/codesign" && c.args.includes("--sign"));
    assert.ok(signCall);
    assert.ok(signCall.args.includes("--deep"));
    assert.ok(signCall.args.includes("--preserve-metadata=entitlements"));
    assert.ok(!signCall.args.some((a) => a.includes("flags,runtime")));
    const verifyCall = calls.find((c) => c.cmd === "/usr/bin/codesign" && c.args.includes("--verify"));
    assert.deepEqual(verifyCall.args, ["--verify", "--deep", "--strict", appPath]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

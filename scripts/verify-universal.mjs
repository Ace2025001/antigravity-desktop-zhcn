import { readdir, readFile, access, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import assert from "node:assert/strict";

const root = path.resolve(process.argv[2]);
assert.deepEqual((await readdir(root)).sort(), ["mac入口", "win入口", "语言包"].sort());
for (const platform of ["win", "mac"]) {
  const entry = path.join(root, `${platform}入口`);
  const ext = platform === "win" ? "bat" : "command";
  assert.deepEqual((await readdir(entry)).sort(), [".程序", `启动中文.${ext}`, `恢复英文.${ext}`].sort());
  for (const name of ["启动中文", "恢复英文"]) {
    const file = path.join(entry, `${name}.${ext}`);
    assert.match(await readFile(file, "utf8"), /AGY_LANGUAGE_PACK/);
    if (platform === "mac" && process.platform !== "win32") assert.ok((await stat(file)).mode & 0o111);
  }
  await access(path.join(entry, ".程序", "runtime", platform === "win" ? "node.exe" : "node"));
}
const selected = process.platform === "win32" ? "win" : "mac";
const internal = path.join(root, `${selected}入口`, ".程序");
const node = path.join(internal, "runtime", selected === "win" ? "node.exe" : "node");
execFileSync(node, ["--input-type=module", "-e", "import('./src/lib/translator.mjs').then(async m => {const d=await m.loadDomTranslations(); if(!d.exact.Settings)throw Error('词库未加载'); await import('@electron/asar'); console.log('共享语言包与运行环境通过');})"], { cwd: internal, env: { ...process.env, AGY_LANGUAGE_PACK: path.join(root, "语言包") }, stdio: "inherit", windowsHide: true });
console.log("双端目录、入口与当前平台运行验证通过。");

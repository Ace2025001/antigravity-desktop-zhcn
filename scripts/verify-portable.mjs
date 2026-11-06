import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(process.argv[2] ?? ".");
const mac = process.platform === "darwin";
const extension = mac ? "command" : "bat";
const node = path.join(root, "runtime", mac ? "node" : "node.exe");
for (const file of ["安装中文", "启动中文", "恢复英文"]) {
  const entry = path.join(root, `${file}.${extension}`);
  await access(entry);
  if (mac && !((await stat(entry)).mode & 0o111)) throw new Error(`入口缺少执行权限：${file}`);
}
for (const file of ["使用说明.txt", "LICENSE", "config/dom-translations.json", "src/lib/patcher.mjs", mac ? "scripts/macos.mjs" : "scripts/run.ps1"]) await access(path.join(root, file));
await access(path.join(root, "runtime", mac ? "NODE_LICENSE.txt" : "NODE_LICENSE"));
const expected = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")).version;
const actual = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")).version;
if (actual !== expected) throw new Error("发布包版本不一致。");
const result = execFileSync(node, ["--input-type=module", "-e", "import('@electron/asar').then(() => console.log(process.platform + '/' + process.arch))"], { cwd: root, encoding: "utf8", windowsHide: true }).trim();
if (result !== (mac ? "darwin/arm64" : "win32/x64")) throw new Error(`运行环境不匹配：${result}`);
console.log(`便携包解压验证通过：${actual}，${result}，入口、许可与依赖完整。`);

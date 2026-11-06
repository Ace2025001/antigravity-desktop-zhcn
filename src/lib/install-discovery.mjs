import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { realpath, stat, readFile, mkdir, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { projectRoot, queryWindowsInstallCandidates, normalizeInstallRootCandidate, getStateRoot } from "./paths.mjs";
import { readJsonFromAsar, readFileFromAsar } from "./asar-reader.mjs";
import { selectInstallation } from "./select-installation.mjs";

const exec = promisify(execFile);
export async function validateCandidate(value, platform = process.platform) {
  try {
    if (typeof value !== "string" || !value.trim()) return {ok:false, reason:"位置为空"};
    const candidate = platform === "win32" ? normalizeInstallRootCandidate(value) : value.trim();
    const root = await realpath(candidate);
    const executable = platform === "win32" ? path.join(root,"Antigravity.exe") : path.join(root,"Contents/MacOS/Antigravity");
    if (!(await stat(executable)).isFile()) return {ok:false,reason:"没有找到客户端主程序"};
    const asar = path.join(root, platform === "win32" ? "resources/app.asar" : "Contents/Resources/app.asar");
    const pkg = await readJsonFromAsar(asar, "package.json");
    if (pkg.name !== "antigravity" || !pkg.version) return {ok:false,reason:"这不是 Antigravity Desktop 独立客户端"};
    // IDE distributions and unrelated Electron apps do not have the desktop scheme module.
    const scheme = await readFileFromAsar(asar, "dist/customScheme.js");
    if (platform === "darwin" && scheme.includes(Buffer.from("agy-zhcn://"))) return {ok:false,reason:"请选择官方原版，不要选择中文副本"};
    return {ok:true,path:root,key:platform === "win32" ? root.toLowerCase() : root};
  } catch (error) {
    const reason = ["EACCES","EPERM"].includes(error.code) ? "没有读取权限，请选择当前用户可访问的安装位置" : "文件不存在、资源不完整，或不是 Desktop 客户端";
    return {ok:false,reason};
  }
}

export async function discoverCandidates(platform = process.platform) {
  if (platform === "win32") {
    let candidates = [];
    try { candidates = (await queryWindowsInstallCandidates()).map(item => item.value); } catch { /* defaults and picker remain available */ }
    for (const base of [process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA,"Programs"), process.env.ProgramFiles, process.env["ProgramFiles(x86)"]]) {
      if (base) for (const name of ["Antigravity","Antigravity Desktop"]) candidates.push(path.join(base,name));
    }
    return candidates;
  }
  const candidates = ["/Applications/Antigravity.app",path.join(os.homedir(),"Applications/Antigravity.app")];
  const results = await Promise.allSettled([
    exec("/bin/ps",["-axo","comm="],{timeout:5000,maxBuffer:2*1024*1024}),
    exec("/usr/bin/mdfind",["kMDItemContentType == 'com.apple.application-bundle' && kMDItemFSName == '*Antigravity*.app'cd"],{timeout:8000,maxBuffer:2*1024*1024}),
  ]);
  if (results[0].status === "fulfilled") for (const line of results[0].value.stdout.split("\n")) {
    const match = line.trim().match(/^(.*\.app)\/Contents\/MacOS\/Antigravity$/);
    if (match) candidates.push(match[1]);
  }
  if (results[1].status === "fulfilled") candidates.push(...results[1].value.stdout.split("\n").filter(Boolean));
  return candidates;
}

async function choose(options,message) {
  const data = JSON.stringify({options,message});
  try {
    const result = process.platform === "win32"
      ? await exec("powershell.exe",["-NoLogo","-NoProfile","-STA","-ExecutionPolicy","Bypass","-File",path.join(projectRoot,"scripts/choose-install.ps1")], {env:{...process.env,AGY_PICKER_DATA:data},encoding:"utf8",windowsHide:true,maxBuffer:1024*1024})
      : await exec("/usr/bin/osascript",["-l","JavaScript",path.join(projectRoot,"scripts/choose-install-mac.js"),data],{encoding:"utf8",maxBuffer:1024*1024});
    return result.stdout.replace(/^\uFEFF/,"").trim();
  } catch (error) { throw new Error(`无法打开客户端选择窗口，请在桌面登录环境中双击入口重试。${error.code ? `（${error.code}）` : ""}`); }
}

export async function resolveInteractiveInstallation() {
  if (!["win32","darwin"].includes(process.platform)) throw new Error("目前只支持 Windows 和 macOS。");
  const stateRoot = process.platform === "win32" ? getStateRoot() : path.join(os.homedir(),"Library/Application Support/AntigravityZhcnMac");
  const preference = path.join(stateRoot,"selected-installation.json");
  let remembered;
  try { remembered = JSON.parse(await readFile(preference,"utf8")).path; }
  catch (error) { if (error.code !== "ENOENT") console.log("之前的位置记录无法读取，将重新识别。"); }
  const explicit = process.platform === "win32" ? process.env.AGY_INSTALL_PATH : process.env.AGY_MAC_SOURCE;
  const selected = await selectInstallation({explicit,remembered,candidates:discoverCandidates,validate:validateCandidate,choose,notify:console.log});
  const temporary = `${preference}.${process.pid}.tmp`;
  try {
    await mkdir(stateRoot,{recursive:true});
    await writeFile(temporary,JSON.stringify({path:selected,platform:process.platform},null,2));
    await rename(temporary,preference);
  } catch { console.log("无法记住选择的位置，本次仍可继续使用。"); }
  console.log(`使用客户端：${selected}`);
  return selected;
}

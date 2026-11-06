import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {readFile,writeFile,chmod,access,lstat,rename,unlink} from "node:fs/promises";
import path from "node:path";
import {projectRoot} from "./paths.mjs";
const exec=promisify(execFile);
const marker="# antigravity-zhcn managed shortcut v1";
export function shellQuote(value) { return "'"+value.replaceAll("'","'\"'\"'")+"'"; }
export function macShortcutContent(launcher, relative=false) {
  return ["#!/bin/bash",marker,
    relative ? 'HERE="$(cd "$(dirname "$0")" && pwd)" || exit 1' : "",
    relative ? 'exec /bin/bash "$HERE/启动中文.command"' : `exec /bin/bash ${shellQuote(launcher)}`,""].filter((line,i)=>line || i===4).join("\n")+"\n";
}
export async function writeMacShortcut(target,launcher,relative=false) {
  const content=macShortcutContent(launcher,relative);
  try {
    const info=await lstat(target);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error("已有同名非普通文件，已保留，未覆盖");
    const existing=await readFile(target,"utf8");
    if (existing.split("\n")[1] !== marker) throw new Error("已有同名文件，已保留，未覆盖");
    if (existing===content) {
      if (!(info.mode & 0o100)) await chmod(target,0o755);
      return false;
    }
  } catch(error) { if(error.code!=="ENOENT") throw error; }
  const temporary=`${target}.${process.pid}.tmp`;
  try {
    await writeFile(temporary,content,{mode:0o755,flag:"wx"});
    await chmod(temporary,0o755);
    await rename(temporary,target);
  } finally {await unlink(temporary).catch(error=>{if(error.code!=="ENOENT")throw error;});}
  return true;
}
export async function ensureAutoShortcuts(selectedClient) {
  const root=path.resolve(projectRoot,"../..");
  if(process.platform==="win32") {
    const launcher=path.join(root,"win启动/启动中文.bat");
    await access(launcher);
    const {stdout}=await exec("powershell.exe",["-NoProfile","-ExecutionPolicy","Bypass","-File",path.join(projectRoot,"scripts/create-auto-shortcuts.ps1"),"-Launcher",launcher,"-ClientExe",path.join(selectedClient,"Antigravity.exe")],{encoding:"utf8",windowsHide:true,timeout:20000});
    if(stdout.trim())console.log(stdout.trim());
    return;
  }
  if(process.platform!=="darwin")throw new Error("快捷方式仅支持 Windows 与 macOS。");
  const entry=path.join(root,"mac启动");
  const launcher=path.join(entry,"启动中文.command");
  await access(launcher);
  const locations=[{folder:entry,relative:true}];
  try {
    const {stdout}=await exec("/usr/bin/osascript",["-e","POSIX path of (path to desktop folder)"],{timeout:10000});
    if(stdout.trim())locations.push({folder:stdout.trim(),relative:false});
  } catch {console.log("无法获取桌面位置，将只创建 mac启动 文件夹内的快捷入口。");}
  for(const location of locations) {
    const target=path.join(location.folder,"Antigravity自动汉化.command");
    try {if(await writeMacShortcut(target,launcher,location.relative))console.log(`自更新快捷入口已就绪：${target}`);}
    catch(error){console.log(`快捷入口创建失败：${error.message}。仍可使用启动中文。`);}
  }
}

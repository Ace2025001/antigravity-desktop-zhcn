import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {readFile} from "node:fs/promises";
import {closeWithPolicy} from "./close-policy.mjs";
import path from "node:path";
import os from "node:os";
const exec=promisify(execFile);

export async function clientProcesses() {
  if (process.platform === "win32") {
    const script = "[Console]::OutputEncoding=[Text.Encoding]::UTF8; $p=@(Get-Process -Name Antigravity -ErrorAction SilentlyContinue | Select-Object Id,MainWindowHandle,Path); ConvertTo-Json -InputObject $p -Compress";
    const {stdout}=await exec("powershell.exe",["-NoProfile","-NonInteractive","-Command",script],{windowsHide:true,timeout:10000,encoding:"utf8"});
    const processes=JSON.parse(stdout.replace(/^\uFEFF/,"").trim() || "[]");
    if (!process.env.AGY_INSTALL_PATH) return processes;
    const expected=path.join(process.env.AGY_INSTALL_PATH,"Antigravity.exe").toLowerCase();
    // Windows can stop reporting Path before a process disappears from Get-Process.
    // Keep unknown processes pending; requestClose still requires an exact path match.
    return processes.filter(item=>!item.Path || item.Path.toLowerCase()===expected);
  }
  if (process.platform !== "darwin") throw new Error("不支持此系统的客户端退出操作。");
  const {stdout}=await exec("/bin/ps",["-axo","pid=,comm="],{timeout:5000});
  const processes=stdout.split("\n").flatMap(line=>{
    const match=line.trim().match(/^(\d+)\s+(.+\.app)\/Contents\/MacOS\/Antigravity$/);
    return match?[{pid:Number(match[1]),app:match[2]}]:[];
  });
  if (!process.env.AGY_MAC_SOURCE) return processes;
  const allowed=[path.resolve(process.env.AGY_MAC_SOURCE),path.join(os.homedir(),"Applications/Antigravity 中文.app")];
  return processes.filter(item=>allowed.includes(item.app));
}

async function requestClose() {
  if (process.platform === "win32") {
    // WM_CLOSE asks for a normal quit. With "run in background" enabled the
    // client only hides, so the policy follows up with forceClose if needed.
    const ids=(await clientProcesses()).map(item=>item.Id);
    if (!ids.length) return;
    await exec("powershell.exe",["-NoProfile","-NonInteractive","-Command","$ids=ConvertFrom-Json $env:AGY_CLOSE_PIDS; Get-Process -Id $ids -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 -and (!$env:AGY_CLOSE_EXECUTABLE -or $_.Path -eq $env:AGY_CLOSE_EXECUTABLE) } | ForEach-Object { [void]$_.CloseMainWindow() }"],{env:{...process.env,AGY_CLOSE_PIDS:JSON.stringify(ids),AGY_CLOSE_EXECUTABLE:process.env.AGY_INSTALL_PATH?path.join(process.env.AGY_INSTALL_PATH,"Antigravity.exe"):""},windowsHide:true,timeout:10000}).catch(()=>{});
  } else {
    const apps=[...new Set((await clientProcesses()).map(item=>item.app))];
    for (const app of apps) {
      // A refused or timed-out quit is handled by the policy's force step.
      await exec("/usr/bin/osascript",["-l","JavaScript","-e","function run(argv) { Application(argv[0]).quit(); }",app],{timeout:10000}).catch(()=>{});
    }
  }
}

async function forceClose() {
  const processes=await clientProcesses();
  if (!processes.length) return;
  if (process.platform === "win32") {
    const args=["/F","/T",...processes.flatMap(item=>["/PID",String(item.Id)])];
    await exec("taskkill.exe",args,{windowsHide:true,timeout:15000}).catch(async error=>{
      if ((await clientProcesses()).length) throw new Error(`强制关闭客户端失败：${error.message}`);
    });
  } else {
    for (const item of processes) await exec("/bin/kill",["-9",String(item.pid)],{timeout:5000}).catch(()=>{});
  }
}

/** Windows only: whether Antigravity's "run in background" setting is on. */
export async function runsInBackground() {
  if (process.platform !== "win32" || !process.env.APPDATA) return false;
  try {
    const settings=JSON.parse(await readFile(path.join(process.env.APPDATA,"Antigravity","app_storage.json"),"utf8"));
    return String(settings.runInBackground) === "true";
  } catch {
    return false;
  }
}

export async function closeClientForChanges({owned=false}={}) {
  let exitHint;
  if (process.platform === "win32") {
    exitHint = await runsInBackground()
      ? "你开启了 Antigravity 的“后台运行”：关闭窗口不会退出程序。请右键系统托盘中的 Antigravity 图标选择 Quit（退出），或在主窗口按 Ctrl+Q 并确认退出。"
      : "请在 Antigravity 主窗口按 Ctrl+Q 并确认退出，或右键系统托盘中的 Antigravity 图标选择 Quit（退出）。";
  } else {
    exitHint = "请在 Antigravity 中按 ⌘Q 完全退出。";
  }
  await closeWithPolicy({running:async()=>(await clientProcesses()).length>0,requestClose,forceClose,exitHint,owned});
}

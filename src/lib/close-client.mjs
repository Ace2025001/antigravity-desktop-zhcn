import {execFile} from "node:child_process";
import {promisify} from "node:util";
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
    // WM_CLOSE lets the application show save/exit confirmation. No taskkill /F.
    const ids=(await clientProcesses()).map(item=>item.Id);
    if (!ids.length) return;
    await exec("powershell.exe",["-NoProfile","-NonInteractive","-Command","$ids=ConvertFrom-Json $env:AGY_CLOSE_PIDS; Get-Process -Id $ids -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 -and (!$env:AGY_CLOSE_EXECUTABLE -or $_.Path -eq $env:AGY_CLOSE_EXECUTABLE) } | ForEach-Object { [void]$_.CloseMainWindow() }"],{env:{...process.env,AGY_CLOSE_PIDS:JSON.stringify(ids),AGY_CLOSE_EXECUTABLE:process.env.AGY_INSTALL_PATH?path.join(process.env.AGY_INSTALL_PATH,"Antigravity.exe"):""},windowsHide:true,timeout:10000});
  } else {
    const apps=[...new Set((await clientProcesses()).map(item=>item.app))];
    for (const app of apps) {
      try {
        await exec("/usr/bin/osascript",["-l","JavaScript","-e","function run(argv) { Application(argv[0]).quit(); }",app],{timeout:10000});
      } catch (error) {
        // If the process has exited during the request there is nothing left to close.
        if ((await clientProcesses()).some(item=>item.app===app)) throw new Error("客户端拒绝或未响应退出请求，请先保存并正常退出，再重试。");
      }
    }
  }
}

export async function closeClientForChanges() {
  const exitHint = process.platform === "win32"
    ? "请在 Antigravity 主窗口按 Ctrl+Q 并确认退出，或右键系统托盘中的 Antigravity 图标选择 Quit（退出）。只关闭窗口时，程序可能仍在后台。"
    : "请在 Antigravity 中按 ⌘Q 完全退出。";
  await closeWithPolicy({running:async()=>(await clientProcesses()).length>0,requestClose,exitHint});
}

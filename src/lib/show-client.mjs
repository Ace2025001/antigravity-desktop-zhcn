import {spawn,execFile} from "node:child_process";
import {promisify} from "node:util";
import path from "node:path";
import {projectRoot} from "./paths.mjs";
const exec=promisify(execFile);
export async function showClient(executablePath) {
  await new Promise((resolve,reject)=>{
    const child=spawn(executablePath,[],{cwd:path.dirname(executablePath),detached:true,stdio:"ignore",windowsHide:false});
    child.once("error",reject);
    child.once("spawn",()=>{child.unref();resolve();});
  });
  try {
    const {stdout} = await exec("powershell.exe",["-NoProfile","-ExecutionPolicy","Bypass","-File",path.join(projectRoot,"scripts/show-window.ps1")],{env:{...process.env,AGY_FOCUS_EXECUTABLE:executablePath},windowsHide:true,timeout:30000});
    if (!stdout.includes("WINDOW_READY")) throw new Error("没有确认主窗口显示");
    console.log("Antigravity 客户端已打开，主窗口已显示。");
  } catch {throw new Error("客户端启动请求已发送，但未能确认主窗口显示。请点击任务栏或托盘中的 Antigravity；窗口可能被系统阻止置前。");}
}

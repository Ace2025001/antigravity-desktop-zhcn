import path from "node:path";
import { spawn } from "node:child_process";
import { projectRoot } from "../src/lib/paths.mjs";
import { resolveInteractiveInstallation } from "../src/lib/install-discovery.mjs";
import { ensureAutoShortcuts } from "../src/lib/auto-shortcuts.mjs";

try {
  const action = process.argv[2];
  if (!["start","restore"].includes(action)) throw new Error("请使用启动中文或恢复英文入口。");
  console.log("正在查找本机 Antigravity，并检查安装位置，请稍候…");
  const progress = setInterval(() => console.log("仍在查找或等待客户端选择，请勿重复打开启动器…"), 10000);
  let selected;
  try { selected = await resolveInteractiveInstallation(); }
  finally { clearInterval(progress); }
  console.log("客户端位置已确认，正在检查版本、汉化状态和语言包…");
  const mac = process.platform === "darwin";
  const env = {...process.env, [mac ? "AGY_MAC_SOURCE" : "AGY_INSTALL_PATH"]:selected};
  const args = mac ? [path.join(projectRoot,"scripts/macos.mjs"),action] : action === "start" ? [path.join(projectRoot,"scripts/auto-follow-update.mjs")] : [path.join(projectRoot,"src/cli.mjs"),"restore"];
  const code = await new Promise((resolve,reject) => {
    const child = spawn(process.execPath,args,{env,stdio:"inherit",windowsHide:true});
    child.once("error",reject);
    child.once("exit",value=>resolve(value ?? 1));
  });
  process.exitCode=code;
  if(code===0 && action==="start") {
    try {await ensureAutoShortcuts(selected);}
    catch(error){console.log(`中文启动已完成，但快捷方式未能创建：${error.message}。仍可使用启动中文。`);}
  }
} catch (error) {console.error(error.message);process.exitCode=1;}

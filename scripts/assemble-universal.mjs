import {cp,mkdir,writeFile,chmod,access,unlink,readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const [windowsPackage,macPackage,destination]=process.argv.slice(2);
if(!windowsPackage||!macPackage||!destination)throw new Error("需要 Windows 运行包、Mac 运行包和新的输出目录。");
const output=path.resolve(destination);
try{await access(output);throw new Error("输出目录已存在，拒绝覆盖。")}catch(error){if(error.code!=="ENOENT")throw error}
async function runtimePath(input,platform){
  for(const relative of ["runtime",`${platform}启动/配套程序`]){const dir=path.resolve(input,relative);try{await access(path.join(dir,platform==="win"?"node.exe":"node"));return dir}catch{}}
  throw new Error(`缺少 ${platform} 内置运行环境：${input}`);
}
const runtimeDirs=await Promise.all([runtimePath(windowsPackage,"win"),runtimePath(macPackage,"mac")]);
await access(path.join(source,"node_modules/@electron/asar/package.json"));
const language=path.join(output,"语言包"),core=path.join(language,"核心程序");
await mkdir(core,{recursive:true});
for(const name of ["dom-translations.json","macos-translations.json"])await cp(path.join(source,"config",name),path.join(language,name));
for(const name of ["src","config","node_modules"])await cp(path.join(source,name),path.join(core,name),{recursive:true});
for(const name of ["dom-translations.json","macos-translations.json"])await unlink(path.join(core,"config",name));
for(const name of ["package.json","package-lock.json","LICENSE"])await cp(path.join(source,name),path.join(core,name));
await mkdir(path.join(core,"scripts"));
for(const name of ["auto-follow-update.mjs","macos.mjs","start-local.mjs","choose-install.ps1","choose-install-mac.js","create-auto-shortcuts.ps1","show-window.ps1"])await cp(path.join(source,"scripts",name),path.join(core,"scripts",name));
for(const [index,platform] of ["win","mac"].entries()){
  const entry=path.join(output,`${platform}启动`);
  await cp(path.join(source,"launchers",`${platform}启动`),entry,{recursive:true});
  await cp(runtimeDirs[index],path.join(entry,"配套程序"),{recursive:true});
  if(platform==="mac"){
    for(const name of ["启动中文.command","恢复英文.command","配套程序/node"])await chmod(path.join(entry,name),0o755);
  }
}
await cp(path.join(source,"docs/package-usage.txt"),path.join(language,"使用说明.txt"));
console.log(`已生成：${output}；共用核心只保留一份，两端运行环境分别存放。`);

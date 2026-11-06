import {readdir,readFile,access,stat} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import path from "node:path";
import assert from "node:assert/strict";
const root=path.resolve(process.argv[2]);
assert.deepEqual((await readdir(root)).sort(),["mac启动","win启动","语言包"].sort());
const core=path.join(root,"语言包/核心程序");
for(const platform of ["win","mac"]){
  const entry=path.join(root,`${platform}启动`),ext=platform==="win"?"bat":"command";
  assert.deepEqual((await readdir(entry)).sort(),["配套程序",`启动中文.${ext}`,`恢复英文.${ext}`].sort());
  for(const name of ["启动中文","恢复英文"]){
    const file=path.join(entry,`${name}.${ext}`),text=await readFile(file,"utf8");
    assert.match(text,/start-local\.mjs/);assert.match(text,/语言包/);
    if(platform==="mac"&&process.platform!=="win32")assert.ok((await stat(file)).mode&0o111);
  }
  await access(path.join(entry,"配套程序",platform==="win"?"node.exe":"node"));
}
const current=process.platform==="win32"?"win":"mac";
const node=path.join(root,`${current}启动/配套程序`,current==="win"?"node.exe":"node");
const script="const t=await import('./src/lib/translator.mjs');if(!(await t.loadDomTranslations()).exact.Settings)throw Error('词库未加载');await import('@electron/asar');for(const file of ['auto-shortcuts','close-client','install-discovery','show-client'])await import('./src/lib/'+file+'.mjs');console.log(process.platform+'/'+process.arch+' 共享核心、语言包、依赖及新功能导入通过');";
execFileSync(node,["--input-type=module","-e",script],{cwd:core,env:{...process.env,AGY_LANGUAGE_PACK:path.join(root,"语言包")},stdio:"inherit",windowsHide:true});
for(const name of ["start-local.mjs","auto-follow-update.mjs","macos.mjs","choose-install-mac.js"])execFileSync(node,["--check",path.join(core,"scripts",name)],{windowsHide:true});
console.log("双端包目录和当前平台离线运行检查通过。");

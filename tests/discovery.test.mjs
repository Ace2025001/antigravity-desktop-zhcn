import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
const {selectInstallation}=await import('../src/lib/select-installation.mjs');
const {validateCandidate,discoverCandidates}=await import('../src/lib/install-discovery.mjs');
const valid=async p=>p.startsWith('ok')?{ok:true,path:p,key:p.toLowerCase()}:{ok:false,reason:'无效位置'};
const noPick=async()=>{throw Error('不应弹窗')};
test('记住的位置有效时不打扰用户',async()=>assert.equal(await selectInstallation({remembered:'ok记住',candidates:['ok其他'],validate:valid,choose:noPick}),'ok记住'));
test('移动后重新识别唯一有效位置',async()=>assert.equal(await selectInstallation({remembered:'旧位置',candidates:['不存在','ok新位置'],validate:valid,choose:noPick}),'ok新位置'));
test('多版本必须明确选择',async()=>{let asked=false;const r=await selectInstallation({candidates:['ok一','ok二'],validate:valid,choose:async options=>{asked=true;assert.equal(options.length,2);return options[1]}});assert.ok(asked);assert.equal(r,'ok二')});
test('重复位置去重后直接使用',async()=>assert.equal(await selectInstallation({candidates:['okABC','okabc'],validate:valid,choose:noPick}),'okabc'));
test('未找到后手动选择且错误选择可以重试',async()=>{let count=0;assert.equal(await selectInstallation({candidates:[],validate:valid,choose:async(_,message)=>{count++;if(count===2)assert.match(message,/无效位置/);return count===1?'错误':'ok手动'}}),'ok手动');assert.equal(count,2)});
test('取消不会回退成默认安装',async()=>assert.rejects(selectInstallation({candidates:['ok一','ok二'],validate:valid,choose:async()=>null}),/取消/));
test('无效强制路径不能悄悄换成另一个安装',async()=>{let called=false;await selectInstallation({explicit:'不存在',candidates:['ok自动'],validate:valid,choose:async()=>{called=true;return 'ok自动'}});assert.ok(called)});
test('显式位置优先',async()=>assert.equal(await selectInstallation({explicit:'ok指定',remembered:'ok记住',candidates:[],validate:valid,choose:noPick}),'ok指定'));
test('真实 ASAR：支持中文和空格路径，排除 IDE、缺失资源和 Mac 中文副本',async()=>{
 const tmp=await mkdtemp(path.join(os.tmpdir(),'agy-discovery-'));
 const asar=await import('@electron/asar');
 try{
  const input=path.join(tmp,'source');await mkdir(path.join(input,'dist'),{recursive:true});await writeFile(path.join(input,'package.json'),JSON.stringify({name:'antigravity',version:'2.29.0'}));await writeFile(path.join(input,'dist/customScheme.js'),'function registerCustomSchemeHandlers() {}');
  const win=path.join(tmp,'中文 路径','Desktop');await mkdir(path.join(win,'resources'),{recursive:true});await writeFile(path.join(win,'Antigravity.exe'),'fixture');await asar.createPackage(input,path.join(win,'resources/app.asar'));
  assert.equal((await validateCandidate(path.join(win,'Antigravity.exe'),'win32')).ok,true);
  const mac=path.join(tmp,'改过名字.app');await mkdir(path.join(mac,'Contents/MacOS'),{recursive:true});await mkdir(path.join(mac,'Contents/Resources'));await writeFile(path.join(mac,'Contents/MacOS/Antigravity'),'fixture');await asar.createPackage(input,path.join(mac,'Contents/Resources/app.asar'));
  assert.equal((await validateCandidate(mac,'darwin')).ok,true);
  await writeFile(path.join(input,'dist/customScheme.js'),'agy-zhcn://bundle/main.js');await asar.createPackage(input,path.join(mac,'Contents/Resources/app.asar'));assert.equal((await validateCandidate(mac,'darwin')).ok,false);
  await writeFile(path.join(input,'package.json'),JSON.stringify({name:'antigravity-ide',version:'1'}));await asar.createPackage(input,path.join(win,'resources/app.asar'));assert.equal((await validateCandidate(win,'win32')).ok,false);
  assert.equal((await validateCandidate(path.join(tmp,'missing'),'win32')).ok,false);
 }finally{await rm(tmp,{recursive:true,force:true})}
});

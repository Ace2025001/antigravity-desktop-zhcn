import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,mkdir,writeFile,readFile,stat,rm,utimes,cp} from "node:fs/promises";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import os from "node:os";
import path from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {writeMacShortcut,macShortcutContent} from "../src/lib/auto-shortcuts.mjs";
import {selectInstallation} from "../src/lib/select-installation.mjs";
const exec=promisify(execFile);
const root=fileURLToPath(new URL('../',import.meta.url));

test('已记住的位置有效时不进行耗时扫描',async()=>{
 const result=await selectInstallation({remembered:'chosen',candidates:async()=>{throw Error('不应扫描')},validate:async p=>({ok:true,path:p}),choose:async()=>{throw Error('不应弹窗')}});
 assert.equal(result,'chosen');
});

test('Mac 快捷入口重复运行不重写，路径变化才更新，同名用户文件不覆盖',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'agy-shortcuts-'));const target=path.join(dir,'入口.command');
 try{
  const launcher="/Users/test/中文 空格/it's $(test)/启动中文.command";
  assert.equal(await writeMacShortcut(target,launcher),true);
  const date=new Date('2020-01-01');await utimes(target,date,date);
  assert.equal(await writeMacShortcut(target,launcher),false);assert.equal((await stat(target)).mtimeMs,date.getTime());
  assert.equal(await writeMacShortcut(target,launcher+'/moved'),true);
  assert.equal(await readFile(target,'utf8'),macShortcutContent(launcher+'/moved'));
  if(process.platform==='darwin')await exec('/bin/bash',['-n',target]);
  await writeFile(target,'我的文件');await assert.rejects(writeMacShortcut(target,launcher),/未覆盖/);assert.equal(await readFile(target,'utf8'),'我的文件');
 }finally{await rm(dir,{recursive:true,force:true})}
});

test('Windows 快捷方式存在时不重写，移动后更新，尊重同名文件', {skip:process.platform!=='win32'},async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'agy-links-'));
 try{
  const desktop=path.join(dir,'模拟桌面'),entry=path.join(dir,'win启动');await mkdir(desktop);await mkdir(entry);
  const launcher=path.join(entry,'启动中文.bat'),exe=path.join(dir,'app.exe');await writeFile(launcher,'@echo off\r\n');await writeFile(exe,'fixture');
  const script=path.join(root,'scripts/create-auto-shortcuts.ps1');
  const run=async l=>exec('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script,'-Launcher',l,'-ClientExe',exe,'-DesktopDirectory',desktop],{windowsHide:true});
  await run(launcher);const link=path.join(desktop,'Antigravity自动汉化.lnk');const before=await readFile(link);const date=new Date('2020-01-01');await utimes(link,date,date);
  await run(launcher);assert.deepEqual(await readFile(link),before);assert.equal((await stat(link)).mtimeMs,date.getTime());
  const entry2=path.join(dir,'新 位置');await mkdir(entry2);const launcher2=path.join(entry2,'启动中文.bat');await writeFile(launcher2,'@echo off\r\n');await run(launcher2);assert.notDeepEqual(await readFile(link),before);
  const changed=await exec('powershell.exe',['-NoProfile','-Command','$s=New-Object -ComObject WScript.Shell;$l=$s.CreateShortcut($env:TEST_LINK);[Console]::OutputEncoding=[Text.Encoding]::UTF8;[Console]::Write($l.TargetPath);$l.Description="user-owned";$l.Save()'],{env:{...process.env,TEST_LINK:link},windowsHide:true,encoding:'utf8'});
  assert.equal(changed.stdout,launcher2);const userData=await readFile(link);await run(launcher);assert.deepEqual(await readFile(link),userData);
 }finally{await rm(dir,{recursive:true,force:true})}
});

test('启动器、进度或倒计时改动不触发重新汉化，词库和核心改动才触发',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'agy-fingerprint-'));
 const saved=process.env.AGY_LANGUAGE_PACK;
 try{
  delete process.env.AGY_LANGUAGE_PACK;
  await mkdir(path.join(dir,'src/lib'),{recursive:true});await mkdir(path.join(dir,'scripts'));await mkdir(path.join(dir,'config'));
  for(const name of ['language-pack.mjs','paths.mjs','hash.mjs'])await cp(path.join(root,'src/lib',name),path.join(dir,'src/lib',name));
  for(const name of ['translator.mjs','patcher.mjs'])await writeFile(path.join(dir,'src/lib',name),'original');
  for(const name of ['dom-translations.json','macos-translations.json'])await writeFile(path.join(dir,'config',name),'{}');
  const {localizationFingerprint}=await import(pathToFileURL(path.join(dir,'src/lib/language-pack.mjs')));
  const before=await localizationFingerprint('win32');
  await writeFile(path.join(dir,'scripts/auto-follow-update.mjs'),'new progress');await writeFile(path.join(dir,'src/lib/close-policy.mjs'),'new countdown');
  assert.equal(await localizationFingerprint('win32'),before);
  await writeFile(path.join(dir,'config/dom-translations.json'),'{"changed":true}');assert.notEqual(await localizationFingerprint('win32'),before);
  const next=await localizationFingerprint('win32');await writeFile(path.join(dir,'src/lib/patcher.mjs'),'new core');assert.notEqual(await localizationFingerprint('win32'),next);
 }finally{if(saved===undefined)delete process.env.AGY_LANGUAGE_PACK;else process.env.AGY_LANGUAGE_PACK=saved;await rm(dir,{recursive:true,force:true})}
});

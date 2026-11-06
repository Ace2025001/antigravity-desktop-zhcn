import { cp, mkdir, writeFile, chmod, access, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [windowsPackage, macPackage, destination] = process.argv.slice(2);
if (!windowsPackage || !macPackage || !destination) throw new Error("需要 Windows 包目录、Mac 包目录和输出目录。");
const output = path.resolve(destination);
try { await access(output); throw new Error("输出目录已存在，请使用新目录，避免覆盖用户文件。"); }
catch (error) { if (error.code !== "ENOENT") throw error; }
await mkdir(output, { recursive: true });
await mkdir(path.join(output, "语言包"));
for (const name of ["dom-translations.json", "macos-translations.json"]) {
  await cp(path.join(source, "config", name), path.join(output, "语言包", name));
}
await writeFile(path.join(output, "语言包", "使用说明.txt"), "Windows 打开 win入口，Mac 打开 mac入口。双击启动中文：首次安装，已安装直接启动，语言包变化后更新。恢复时双击恢复英文。\n更新翻译时替换本目录的两个 JSON 文件，保留目录名。不要删除入口中的隐藏 .程序 目录。\n仅支持 Windows x64 与 Mac Apple 芯片。Mac 安装按提示保存工作并退出应用。\n", "utf8");
for (const [platform, packageRoot] of [["win", windowsPackage], ["mac", macPackage]]) {
  const entry = path.join(output, `${platform}入口`);
  const internal = path.join(entry, ".程序");
  await mkdir(internal, { recursive: true });
  for (const dir of ["src", "scripts", "config"]) await cp(path.join(source, dir), path.join(internal, dir), { recursive: true });
  for (const name of ["dom-translations.json", "macos-translations.json"]) await unlink(path.join(internal, "config", name));
  for (const dir of ["runtime", "node_modules"]) await cp(path.join(packageRoot, dir), path.join(internal, dir), { recursive: true });
  for (const file of ["package.json", "package-lock.json", "LICENSE"]) await cp(path.join(source, file), path.join(internal, file));
  // The public language directory is the sole dictionary used by launchers.
  for (const [name, action] of [["启动中文", platform === "win" ? "AutoUpdate" : "start"], ["恢复英文", platform === "win" ? "Restore" : "restore"]]) {
    if (platform === "win") {
      const lines = ["@echo off", "chcp 65001 >nul", 'set "AGY_LANGUAGE_PACK=%~dp0..\\语言包"', 'attrib +h "%~dp0.程序" >nul 2>nul', `powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0.程序\\scripts\\run.ps1" -Action ${action}`, 'set "RESULT=%ERRORLEVEL%"', 'if not "%RESULT%"=="0" pause', "exit /b %RESULT%", ""];
      await writeFile(path.join(entry, `${name}.bat`), lines.join("\r\n"));
    } else {
      const lines = ["#!/bin/bash", 'cd "$(dirname "$0")" || exit 1', 'export AGY_LANGUAGE_PACK="$PWD/../语言包"', `/bin/bash .程序/scripts/run-macos.sh ${action}`, "RESULT=$?", 'if [ "$RESULT" -ne 0 ]; then printf "操作未完成，按回车关闭。"; read -r _; fi', 'exit "$RESULT"', ""];
      const launcher = path.join(entry, `${name}.command`);
      await writeFile(launcher, lines.join("\n"));
      await chmod(launcher, 0o755);
    }
  }
  if (platform === "mac") await chmod(path.join(internal, "runtime/node"), 0o755);
}
console.log(`已整理双端汉化包：${output}`);

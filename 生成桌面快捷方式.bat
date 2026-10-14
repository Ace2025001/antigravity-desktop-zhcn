@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Antigravity 中文汉化 - 生成桌面快捷方式
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\create-shortcut.ps1"
echo.
pause

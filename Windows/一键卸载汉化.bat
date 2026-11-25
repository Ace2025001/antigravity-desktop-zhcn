@echo off
chcp 65001 >nul
cd /d "%~dp0.."
title Antigravity 中文汉化 - 卸载汉化
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\scripts\run.ps1" -Action Restore
echo.
pause

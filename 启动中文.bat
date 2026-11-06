@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 请先保存 Antigravity 中的工作，再按提示操作。
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\run.ps1" -Action AutoUpdate
set "RESULT=%ERRORLEVEL%"
echo.
if not "%RESULT%"=="0" echo 操作未完成，请保留窗口中的错误信息。
pause
exit /b %RESULT%

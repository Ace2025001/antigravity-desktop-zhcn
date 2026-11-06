@echo off
setlocal
chcp 65001 >nul
echo 正在启动汉化工具，请稍候...
set "AGY_LANGUAGE_PACK=%~dp0..\语言包"
set "CORE=%~dp0..\语言包\核心程序"
"%~dp0配套程序\node.exe" "%CORE%\scripts\start-local.mjs" start
set "RESULT=%ERRORLEVEL%"
if not "%RESULT%"=="0" pause
exit /b %RESULT%

@echo off
setlocal
chcp 65001 >nul
echo 正在打开汉化设置，请稍候...
set "AGY_LANGUAGE_PACK=%~dp0..\语言包"
set "CORE=%~dp0..\语言包\核心程序"
"%~dp0配套程序\node.exe" "%CORE%\scripts\start-local.mjs" settings
set "RESULT=%ERRORLEVEL%"
pause
exit /b %RESULT%

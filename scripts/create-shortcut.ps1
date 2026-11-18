#Requires -Version 5.1
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ProjectRoot = Split-Path -Parent $PSScriptRoot

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " Antigravity Desktop 中文汉化" -ForegroundColor Cyan
Write-Host " 操作: 生成桌面快捷方式" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

$targetVbs = Join-Path $ProjectRoot "Windows\silent-launch-zhcn.vbs"
$vbsLines = @(
    "' Antigravity ZhCN Standalone Silent Launcher (Pure ASCII, Zero Console Window)"
    "Option Explicit"
    "Dim fso, shell, here, root, nodeExe, scriptPath, cmd, exitCode"
    'Set fso = CreateObject("Scripting.FileSystemObject")'
    'Set shell = CreateObject("WScript.Shell")'
    "here = fso.GetParentFolderName(WScript.ScriptFullName)"
    'root = fso.GetParentFolderName(here)'
    'nodeExe = fso.BuildPath(root, "runtime\node.exe")'
    'If Not fso.FileExists(nodeExe) Then nodeExe = "node.exe"'
    'scriptPath = fso.BuildPath(root, "scripts\auto-follow-update.mjs")'
    'shell.Environment("Process")("AGY_SILENT_LAUNCH") = "1"'
    'cmd = """" & nodeExe & """ """ & scriptPath & """"'
    "exitCode = shell.Run(cmd, 0, True)"
    "If exitCode <> 0 Then"
    '  MsgBox "Antigravity " & ChrW(20013) & ChrW(25991) & ChrW(21551) & ChrW(21160) & ChrW(26410) & ChrW(23436) & ChrW(25104) & " (" & CStr(exitCode) & ")", 48, "Antigravity"'
    "End If"
) -join "`r`n"
[System.IO.File]::WriteAllText($targetVbs, $vbsLines + "`r`n", [System.Text.Encoding]::ASCII)

# 解析客户端图标路径
$iconLocation = $null
$defaultExe = Join-Path $env:LOCALAPPDATA "Programs\antigravity\Antigravity.exe"
if (Test-Path -LiteralPath $defaultExe) {
    $iconLocation = $defaultExe
} else {
    $appPath = Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\Antigravity.exe" -ErrorAction SilentlyContinue
    if ($appPath -and (Test-Path -LiteralPath $appPath.'(default)')) {
        $iconLocation = $appPath.'(default)'
    }
}

$desktopPath = [Environment]::GetFolderPath([Environment+SpecialFolder]::DesktopDirectory)
$shortcutPath = Join-Path $desktopPath "Antigravity自动汉化.lnk"

try {
    $wshShell = New-Object -ComObject WScript.Shell
    $shortcut = $wshShell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $targetVbs
    $shortcut.WorkingDirectory = $ProjectRoot
    $shortcut.Description = "Google Antigravity Desktop 自动汉化启动器"
    $shortcut.WindowStyle = 1
    if ($iconLocation) {
        $shortcut.IconLocation = "$iconLocation,0"
    }
    $shortcut.Save()

    Write-Host "快捷方式创建成功！" -ForegroundColor Green
    Write-Host "位置: $shortcutPath" -ForegroundColor Gray
    if ($iconLocation) {
        Write-Host "已关联图标: $iconLocation" -ForegroundColor Gray
    }
    Write-Host ""
    Write-Host "以后你可以直接双击桌面的【Antigravity自动汉化】无黑框打开中文版客户端！" -ForegroundColor Cyan
} catch {
    Write-Host "创建快捷方式失败: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

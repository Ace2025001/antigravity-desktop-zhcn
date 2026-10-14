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

$targetBat = Join-Path $ProjectRoot "启动 Antigravity（自动汉化）.bat"
if (-not (Test-Path -LiteralPath $targetBat)) {
    Write-Host "错误: 未找到启动脚本: $targetBat" -ForegroundColor Red
    exit 1
}

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
$shortcutPath = Join-Path $desktopPath "启动 Antigravity（自动汉化）.lnk"

try {
    $wshShell = New-Object -ComObject WScript.Shell
    $shortcut = $wshShell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $targetBat
    $shortcut.WorkingDirectory = $ProjectRoot
    $shortcut.Description = "Google Antigravity Desktop 自动汉化启动器"
    $shortcut.WindowStyle = 7 # 最小化运行，避免黑框闪烁
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
    Write-Host "以后您可以直接双击桌面的【启动 Antigravity（自动汉化）】使用中文版客户端！" -ForegroundColor Cyan
} catch {
    Write-Host "创建快捷方式失败: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

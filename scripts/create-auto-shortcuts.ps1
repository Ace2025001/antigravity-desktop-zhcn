param([Parameter(Mandatory=$true)][string]$Launcher, [Parameter(Mandatory=$true)][string]$ClientExe, [string]$DesktopDirectory)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$marker = 'Antigravity ZhCN managed auto-update shortcut v1'
$shell = New-Object -ComObject WScript.Shell
$desktop = if ($DesktopDirectory) { $DesktopDirectory } else { [Environment]::GetFolderPath('DesktopDirectory') }
$entry = Split-Path -Parent $Launcher
foreach ($directory in @($entry, $desktop) | Select-Object -Unique) {
    try {
        if ([string]::IsNullOrWhiteSpace($directory) -or -not (Test-Path -LiteralPath $directory -PathType Container)) { throw '目录不可用' }
        $shortcutPath = Join-Path $directory 'Antigravity自动汉化.lnk'
        $shortcut = $shell.CreateShortcut($shortcutPath)
        if ((Test-Path -LiteralPath $shortcutPath) -and $shortcut.Description -ne $marker) {
            Write-Host "跳过已有同名快捷方式，保留用户文件：$shortcutPath"
            continue
        }
        $icon = if (Test-Path -LiteralPath $ClientExe -PathType Leaf) { "$ClientExe,0" } else { '' }
        if ((Test-Path -LiteralPath $shortcutPath) -and
            $shortcut.TargetPath -eq $Launcher -and $shortcut.WorkingDirectory -eq $entry -and
            $shortcut.Arguments -eq '' -and $shortcut.WindowStyle -eq 1 -and $shortcut.IconLocation -eq $icon) {
            continue
        }
        $shortcut.TargetPath = $Launcher
        $shortcut.Arguments = ''
        $shortcut.WorkingDirectory = $entry
        $shortcut.Description = $marker
        $shortcut.WindowStyle = 1
        $shortcut.IconLocation = $icon
        $shortcut.Save()
        $saved = $shell.CreateShortcut($shortcutPath)
        if ($saved.TargetPath -ne $Launcher) { throw '快捷方式目标校验失败' }
        Write-Host "自更新快捷方式已就绪：$shortcutPath"
    } catch {
        Write-Host "无法在此处创建快捷方式：$directory；$($_.Exception.Message)（第 $($_.InvocationInfo.ScriptLineNumber) 行）。仍可使用启动中文。"
    }
}

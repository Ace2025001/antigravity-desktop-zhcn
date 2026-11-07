param([Parameter(Mandatory=$true)][string]$Launcher, [Parameter(Mandatory=$true)][string]$ClientExe, [string]$DesktopDirectory)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$marker = 'Antigravity ZhCN managed auto-update shortcut v1'
# IShellLinkW preserves Chinese paths on Windows with any system language.
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
[ComImport, Guid("00021401-0000-0000-C000-000000000046")]
class AgLinkObject {}
[ComImport, Guid("000214F9-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface AgShellLinkW {
    void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int size, IntPtr data, uint flags);
    void GetIDList(out IntPtr list);
    void SetIDList(IntPtr list);
    void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder text, int size);
    void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string text);
    void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder text, int size);
    void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string text);
    void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder text, int size);
    void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string text);
    void GetHotkey(out short hotkey);
    void SetHotkey(short hotkey);
    void GetShowCmd(out int command);
    void SetShowCmd(int command);
    void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int size, out int index);
    void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string path, int index);
    void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string path, uint reserved);
    void Resolve(IntPtr window, uint flags);
    void SetPath([MarshalAs(UnmanagedType.LPWStr)] string path);
}
public class AgShortcut : IDisposable {
    private AgShellLinkW link;
    private string file;
    public AgShortcut(string path) {
        file = path;
        link = (AgShellLinkW)new AgLinkObject();
        if (System.IO.File.Exists(path)) ((IPersistFile)link).Load(path, 0);
    }
    public string TargetPath { get { var b = new StringBuilder(32768); link.GetPath(b,b.Capacity,IntPtr.Zero,4); return b.ToString(); } set { link.SetPath(value); } }
    public string Description { get { var b = new StringBuilder(32768); link.GetDescription(b,b.Capacity); return b.ToString(); } set { link.SetDescription(value); } }
    public string WorkingDirectory { get { var b = new StringBuilder(32768); link.GetWorkingDirectory(b,b.Capacity); return b.ToString(); } set { link.SetWorkingDirectory(value); } }
    public string Arguments { get { var b = new StringBuilder(32768); link.GetArguments(b,b.Capacity); return b.ToString(); } set { link.SetArguments(value); } }
    public int WindowStyle { get { int n; link.GetShowCmd(out n); return n; } set { link.SetShowCmd(value); } }
    public string IconPath { get { var b = new StringBuilder(32768); int n; link.GetIconLocation(b,b.Capacity,out n); return b.ToString(); } set { link.SetIconLocation(value,0); } }
    public void Save() { ((IPersistFile)link).Save(file,true); }
    public void Dispose() { if(link != null) { Marshal.FinalReleaseComObject(link); link = null; } }
}
'@
$desktop = if ($DesktopDirectory) { $DesktopDirectory } else { [Environment]::GetFolderPath('DesktopDirectory') }
$entry = Split-Path -Parent $Launcher
foreach ($directory in @($entry, $desktop) | Select-Object -Unique) {
    $shortcut = $null
    $saved = $null
    try {
        if ([string]::IsNullOrWhiteSpace($directory) -or -not (Test-Path -LiteralPath $directory -PathType Container)) { throw '目录不可用' }
        $shortcutPath = Join-Path $directory 'Antigravity自动汉化.lnk'
        $shortcut = [AgShortcut]::new($shortcutPath)
        if ((Test-Path -LiteralPath $shortcutPath) -and $shortcut.Description -ne $marker) {
            Write-Host "跳过已有同名快捷方式，保留用户文件：$shortcutPath"
            continue
        }
        $icon = if (Test-Path -LiteralPath $ClientExe -PathType Leaf) { $ClientExe } else { '' }
        if ((Test-Path -LiteralPath $shortcutPath) -and
            $shortcut.TargetPath -eq $Launcher -and $shortcut.WorkingDirectory -eq $entry -and
            $shortcut.Arguments -eq '' -and $shortcut.WindowStyle -eq 1 -and $shortcut.IconPath -eq $icon) {
            continue
        }
        $shortcut.TargetPath = $Launcher
        $shortcut.Arguments = ''
        $shortcut.WorkingDirectory = $entry
        $shortcut.Description = $marker
        $shortcut.WindowStyle = 1
        $shortcut.IconPath = $icon
        $shortcut.Save()
        $saved = [AgShortcut]::new($shortcutPath)
        if ($saved.TargetPath -ne $Launcher) { throw '快捷方式目标校验失败' }
        Write-Host "自更新快捷方式已就绪：$shortcutPath"
    } catch {
        Write-Host "无法在此处创建快捷方式：$directory；$($_.Exception.Message)（第 $($_.InvocationInfo.ScriptLineNumber) 行）。仍可使用启动中文。"
    } finally {
        if ($saved) { $saved.Dispose() }
        if ($shortcut) { $shortcut.Dispose() }
    }
}

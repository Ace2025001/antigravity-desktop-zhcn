$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class AgyWindow {
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool attach);
}
'@
for ($attempt=0; $attempt -lt 60; $attempt++) {
    $windows = @(Get-Process -Name Antigravity -ErrorAction SilentlyContinue | Where-Object {
        $_.MainWindowHandle -ne 0 -and $_.Path -eq $env:AGY_FOCUS_EXECUTABLE
    })
    if ($windows.Count -gt 0) {
        foreach ($window in $windows) {
            $handle = $window.MainWindowHandle
            [uint32]$ownerId = 0
            $foregroundThread = [AgyWindow]::GetWindowThreadProcessId([AgyWindow]::GetForegroundWindow(), [ref]$ownerId)
            $currentThread = [AgyWindow]::GetCurrentThreadId()
            $attached = $false
            try {
                if ($foregroundThread -ne 0 -and $foregroundThread -ne $currentThread) {
                    $attached = [AgyWindow]::AttachThreadInput($currentThread,$foregroundThread,$true)
                }
                [void][AgyWindow]::ShowWindowAsync($handle,9)
                [void][AgyWindow]::BringWindowToTop($handle)
                [void][AgyWindow]::SetForegroundWindow($handle)
            } finally {
                if ($attached) { [void][AgyWindow]::AttachThreadInput($currentThread,$foregroundThread,$false) }
            }
            Start-Sleep -Milliseconds 100
            if ([AgyWindow]::IsWindowVisible($handle) -and -not [AgyWindow]::IsIconic($handle) -and [AgyWindow]::GetForegroundWindow() -eq $handle) {
                [Console]::WriteLine('WINDOW_READY')
                exit 0
            }
        }
    }
    Start-Sleep -Milliseconds 250
}
throw '未确认 Antigravity 主窗口显示到前台。'

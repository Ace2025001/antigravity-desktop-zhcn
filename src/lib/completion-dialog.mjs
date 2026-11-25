import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const REPO_URL = "https://github.com/Ace2025001/antigravity-desktop-zhcn";
export const COMPLETION_DIALOG_TITLE = "Antigravity 中文汉化包";
export const COMPLETION_DIALOG_MESSAGE = [
  "汉化已完成！Antigravity 中文版已为您准备就绪。",
  "",
  "本项目开源免费维护，并持续跟进新版本词库与功能适配。",
  "如果觉得好用，欢迎去 GitHub 点一颗免费 Star 支持一下，让更多中文用户看到这个项目！",
].join("\n");
export const COMPLETION_DIALOG_BUTTONS = Object.freeze({
  star: "去 GitHub 点 Star 支持",
  close: "关闭",
});

/**
 * Determine whether the post-localization Star dialog should appear.
 * Silent background auto-follow launches and automated test/CI runs never block on UI dialogs.
 */
export function shouldShowCompletionDialog({
  action,
  exitCode,
  dryVerify = false,
  env = process.env,
  platform = process.platform,
} = {}) {
  if (action !== "start" || exitCode !== 0 || dryVerify) return false;
  if (platform !== "win32" && platform !== "darwin") return false;
  if (env.AGY_SILENT_LAUNCH === "1" || env.AGY_NO_STAR_PROMPT === "1") return false;
  if (env.CI === "true" || Boolean(env.NODE_TEST_CONTEXT)) return false;
  return true;
}

/**
 * Build the PowerShell WinForms script for the Windows completion dialog.
 * Clicking the Star CTA opens the repository URL in the default browser directly.
 */
export function buildWindowsCompletionDialogScript(repoUrl = REPO_URL) {
  const escapedUrl = String(repoUrl).replaceAll("'", "''");
  return [
    "Add-Type -AssemblyName System.Windows.Forms",
    "Add-Type -AssemblyName System.Drawing",
    "[System.Windows.Forms.Application]::EnableVisualStyles()",
    "$form = New-Object System.Windows.Forms.Form",
    `$form.Text = '${COMPLETION_DIALOG_TITLE}'`,
    "$form.Size = New-Object System.Drawing.Size(450, 225)",
    "$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen",
    "$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedDialog",
    "$form.MaximizeBox = $false",
    "$form.MinimizeBox = $false",
    "$form.TopMost = $true",
    "$form.ShowInTaskbar = $true",
    "$label = New-Object System.Windows.Forms.Label",
    "$label.Location = New-Object System.Drawing.Point(22, 20)",
    "$label.Size = New-Object System.Drawing.Size(392, 102)",
    "$label.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 9.5)",
    "$label.Text = \"汉化已完成！Antigravity 中文版已为您准备就绪。`r`n`r`n本项目开源免费维护，并持续跟进新版本词库与功能适配。`r`n如果觉得好用，欢迎去 GitHub 点一颗免费 Star 支持一下，让更多中文用户看到这个项目！\"",
    "$btnStar = New-Object System.Windows.Forms.Button",
    `$btnStar.Text = '${COMPLETION_DIALOG_BUTTONS.star}'`,
    "$btnStar.Size = New-Object System.Drawing.Size(185, 34)",
    "$btnStar.Location = New-Object System.Drawing.Point(132, 136)",
    "$btnStar.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 9, [System.Drawing.FontStyle]::Bold)",
    "$btnStar.Tag = 'star'",
    "$btnStar.Add_Click({",
    `  try { Start-Process '${escapedUrl}' | Out-Null } catch {}`,
    "  $form.Tag = 'star'",
    "  $form.Close()",
    "})",
    "$btnClose = New-Object System.Windows.Forms.Button",
    `$btnClose.Text = '${COMPLETION_DIALOG_BUTTONS.close}'`,
    "$btnClose.Size = New-Object System.Drawing.Size(86, 34)",
    "$btnClose.Location = New-Object System.Drawing.Point(328, 136)",
    "$btnClose.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 9)",
    "$btnClose.Add_Click({ $form.Tag = 'close'; $form.Close() })",
    "$form.AcceptButton = $btnStar",
    "$form.CancelButton = $btnClose",
    "$form.Controls.AddRange(@($label, $btnStar, $btnClose))",
    // Node's windowsHide passes SW_HIDE to the process startup info, which makes the first WinForms form start hidden; ShowWindow(SW_SHOW=5) forces it visible without flashing a console.
    "try {",
    "  Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class AgyZhcnWin32 { [DllImport(\"user32.dll\")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow); [DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr hWnd); }'",
    "} catch {}",
    "$form.Add_Shown({",
    "  try {",
    "    [void][AgyZhcnWin32]::ShowWindow($form.Handle, 5)",
    "    [void][AgyZhcnWin32]::SetForegroundWindow($form.Handle)",
    "  } catch {}",
    "  $form.TopMost = $true",
    "  $form.Activate()",
    "})",
    "$null = $form.ShowDialog()",
    "[Console]::Write($form.Tag)",
  ].join("\n");
}

/**
 * Show the completion dialog on Windows or macOS when running interactively.
 * Never throws: a failed UI prompt must not mark a completed localization as failed.
 */
export async function maybeShowCompletionDialog(options = {}) {
  if (!shouldShowCompletionDialog(options)) return null;
  const platform = options.platform ?? process.platform;
  const repoUrl = options.repoUrl ?? REPO_URL;
  const exec = options.exec ?? execFileAsync;

  try {
    if (platform === "win32") {
      const encoded = Buffer.from(buildWindowsCompletionDialogScript(repoUrl), "utf16le").toString("base64");
      const { stdout } = await exec(
        "powershell.exe",
        ["-NoProfile", "-STA", "-EncodedCommand", encoded],
        { windowsHide: true, timeout: 120000, encoding: "utf8" },
      );
      return stdout.trim() === "star" ? "star" : "close";
    }

    if (platform === "darwin") {
      const appleScript = [
        "on run argv",
        "set dialogMessage to item 1 of argv",
        "set dialogTitle to item 2 of argv",
        "set closeBtn to item 3 of argv",
        "set starBtn to item 4 of argv",
        "set res to display dialog dialogMessage with title dialogTitle buttons {closeBtn, starBtn} default button starBtn giving up after 120",
        "return button returned of res",
        "end run",
      ].join("\n");
      const { stdout } = await exec(
        "/usr/bin/osascript",
        [
          "-e",
          appleScript,
          COMPLETION_DIALOG_MESSAGE,
          COMPLETION_DIALOG_TITLE,
          COMPLETION_DIALOG_BUTTONS.close,
          COMPLETION_DIALOG_BUTTONS.star,
        ],
        { timeout: 130000, encoding: "utf8" },
      );
      if (stdout.trim() === COMPLETION_DIALOG_BUTTONS.star) {
        await exec("/usr/bin/open", [repoUrl], { timeout: 10000 }).catch(() => {});
        return "star";
      }
      return "close";
    }
  } catch {
    return null;
  }
  return null;
}

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function escapePsSingle(value) {
  return String(value ?? "").replaceAll("'", "''");
}

function toPsTextExpr(value) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => `'${escapePsSingle(line)}'`)
    .join(" + [Environment]::NewLine + ");
}

/**
 * Build a unified, DPI-aware modern Windows card dialog in PowerShell WinForms.
 * Never creates a visible console window; forces foreground visibility via ShowWindow(SW_SHOW=5).
 */
export function buildModernWindowsDialogScript({
  title = "Antigravity 汉化包",
  badge = "Antigravity 中文汉化包",
  headline = "",
  message = "",
  icon = "update",
  accentHex = "#2563EB",
  buttons = [{ id: "ok", text: "确定", style: "primary", isAccept: true }],
  cancelId = "later",
} = {}) {
  const safeButtons = Array.isArray(buttons) && buttons.length > 0
    ? buttons
    : [{ id: "ok", text: "确定", style: "primary", isAccept: true }];
  const headlineText = String(headline ?? "");
  const headlineLines = headlineText.length > 22 ? 2 : 1;
  const baseHeadlineHeight = headlineLines > 1 ? 46 : 28;
  const baseBodyY = 50 + baseHeadlineHeight + 6;
  const lineCount = String(message ?? "").split(/\r?\n/).reduce((sum, seg) => sum + Math.max(1, Math.ceil(seg.length / 26)), 0);
  const baseBodyHeight = Math.max(54, Math.min(180, lineCount * 22 + 12));
  const baseTotalHeight = baseBodyY + baseBodyHeight + 10 + 58;
  const baseWidth = Math.max(460, safeButtons.length >= 3 ? 512 : 468);

  const buttonLines = [];
  let rightOffset = 20;
  for (let i = safeButtons.length - 1; i >= 0; i -= 1) {
    const btn = safeButtons[i];
    const textLen = String(btn.text || "").length;
    const w = Math.max(88, Math.min(188, textLen * 15 + 34));
    rightOffset += w;
    const xPos = baseWidth - rightOffset;
    rightOffset += 10;
    const varName = `$btn${i}`;
    const style = btn.style || (i === safeButtons.length - 1 ? "primary" : "secondary");
    const isPrimary = style === "primary";
    const isSubtle = style === "subtle";
    const bgHex = isPrimary ? accentHex : isSubtle ? "#F8FAFC" : "#FFFFFF";
    const hoverHex = isPrimary ? "#1D4ED8" : isSubtle ? "#E2E8F0" : "#F1F5F9";
    const fgHex = isPrimary ? "#FFFFFF" : isSubtle ? "#64748B" : "#1E293B";
    const borderSize = isPrimary || isSubtle ? 0 : 1;
    const clickAction = btn.url
      ? `try { Start-Process '${escapePsSingle(btn.url)}' | Out-Null } catch {}; $form.Tag = '${escapePsSingle(btn.id)}'; $form.Close()`
      : `$form.Tag = '${escapePsSingle(btn.id)}'; $form.Close()`;

    buttonLines.push(
      `${varName} = New-Object System.Windows.Forms.Button`,
      `${varName}.Text = '${escapePsSingle(btn.text)}'`,
      `${varName}.Location = New-Object System.Drawing.Point((& $s ${xPos}), (& $s 13))`,
      `${varName}.Size = New-Object System.Drawing.Size((& $s ${w}), (& $s 32))`,
      `${varName}.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 9, ${isPrimary ? "[System.Drawing.FontStyle]::Bold" : "[System.Drawing.FontStyle]::Regular"})`,
      `${varName}.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat`,
      `${varName}.BackColor = [System.Drawing.ColorTranslator]::FromHtml('${bgHex}')`,
      `${varName}.ForeColor = [System.Drawing.ColorTranslator]::FromHtml('${fgHex}')`,
      `${varName}.FlatAppearance.BorderSize = ${borderSize}`,
      `${varName}.FlatAppearance.BorderColor = [System.Drawing.ColorTranslator]::FromHtml('#CBD5E1')`,
      `${varName}.FlatAppearance.MouseOverBackColor = [System.Drawing.ColorTranslator]::FromHtml('${hoverHex}')`,
      `${varName}.Cursor = [System.Windows.Forms.Cursors]::Hand`,
      `${varName}.Add_Click({ ${clickAction} })`,
      `$footer.Controls.Add(${varName})`,
      btn.isAccept ? `$form.AcceptButton = ${varName}` : "",
    );
  }

  const glyphMap = { update: "↑", zhcn: "文", star: "★", warn: "!" };
  const iconGlyph = glyphMap[icon] || "↑";
  const badgeBg = icon === "warn" ? "#FEF3C7" : "#EFF6FF";
  const badgeFg = icon === "warn" ? "#D97706" : accentHex;

  return [
    "Add-Type -AssemblyName System.Windows.Forms",
    "Add-Type -AssemblyName System.Drawing",
    "try {",
    "  Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class AgyZhcnWin32 { [DllImport(\"user32.dll\")] public static extern bool SetProcessDPIAware(); [DllImport(\"user32.dll\")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow); [DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr hWnd); [DllImport(\"user32.dll\")] public static extern bool ReleaseCapture(); [DllImport(\"user32.dll\")] public static extern IntPtr SendMessage(IntPtr hWnd, int Msg, int wParam, int lParam); [DllImport(\"dwmapi.dll\")] public static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize); }'",
    "  [void][AgyZhcnWin32]::SetProcessDPIAware()",
    "} catch {}",
    "[System.Windows.Forms.Application]::EnableVisualStyles()",
    "$scale = 1.0",
    "try { $gTmp = [System.Drawing.Graphics]::FromHwnd([IntPtr]::Zero); $scale = [Math]::Max(1.0, $gTmp.DpiX / 96.0); $gTmp.Dispose() } catch {}",
    "$s = { param($v) [int][Math]::Round($v * $scale) }",
    "$form = New-Object System.Windows.Forms.Form",
    `$form.Text = '${escapePsSingle(title)}'`,
    `$form.Tag = '${escapePsSingle(cancelId)}'`,
    `$form.Size = New-Object System.Drawing.Size((& $s ${baseWidth}), (& $s ${baseTotalHeight}))`,
    "$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen",
    "$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None",
    "$form.BackColor = [System.Drawing.Color]::White",
    "$form.TopMost = $true",
    "$form.ShowInTaskbar = $true",
    "$accent = New-Object System.Windows.Forms.Panel",
    `$accent.BackColor = [System.Drawing.ColorTranslator]::FromHtml('${accentHex}')`,
    "$accent.Dock = [System.Windows.Forms.DockStyle]::Top",
    "$accent.Height = (& $s 4)",
    "$header = New-Object System.Windows.Forms.Panel",
    "$header.Location = New-Object System.Drawing.Point(0, (& $s 4))",
    `$header.Size = New-Object System.Drawing.Size((& $s ${baseWidth}), (& $s 36))`,
    "$header.BackColor = [System.Drawing.Color]::White",
    "$badgeLbl = New-Object System.Windows.Forms.Label",
    `$badgeLbl.Text = '${escapePsSingle(badge)}'`,
    "$badgeLbl.Location = New-Object System.Drawing.Point((& $s 20), (& $s 12))",
    "$badgeLbl.AutoSize = $true",
    "$badgeLbl.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 8.5, [System.Drawing.FontStyle]::Bold)",
    "$badgeLbl.ForeColor = [System.Drawing.ColorTranslator]::FromHtml('#64748B')",
    "$closeX = New-Object System.Windows.Forms.Button",
    "$closeX.Text = '✕'",
    `$closeX.Location = New-Object System.Drawing.Point((& $s ${baseWidth - 40}), (& $s 6))`,
    "$closeX.Size = New-Object System.Drawing.Size((& $s 30), (& $s 26))",
    "$closeX.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat",
    "$closeX.FlatAppearance.BorderSize = 0",
    "$closeX.FlatAppearance.MouseOverBackColor = [System.Drawing.ColorTranslator]::FromHtml('#F1F5F9')",
    "$closeX.ForeColor = [System.Drawing.ColorTranslator]::FromHtml('#64748B')",
    "$closeX.Font = New-Object System.Drawing.Font('Segoe UI', 9)",
    "$closeX.Cursor = [System.Windows.Forms.Cursors]::Hand",
    `$closeX.Add_Click({ $form.Tag = '${escapePsSingle(cancelId)}'; $form.Close() })`,
    "$dragHandler = { if ($_.Button -eq [System.Windows.Forms.MouseButtons]::Left) { try { [void][AgyZhcnWin32]::ReleaseCapture(); [void][AgyZhcnWin32]::SendMessage($form.Handle, 0xA1, 2, 0) } catch {} } }",
    "$header.Add_MouseDown($dragHandler)",
    "$badgeLbl.Add_MouseDown($dragHandler)",
    "$header.Controls.AddRange(@($badgeLbl, $closeX))",
    "$iconBox = New-Object System.Windows.Forms.PictureBox",
    "$iconBox.Location = New-Object System.Drawing.Point((& $s 22), (& $s 52))",
    "$iconBox.Size = New-Object System.Drawing.Size((& $s 40), (& $s 40))",
    "$iconBox.Add_Paint({",
    "  $g = $_.Graphics",
    "  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias",
    `  $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('${badgeBg}'))`,
    "  $g.FillEllipse($bgBrush, 1, 1, ($iconBox.Width - 3), ($iconBox.Height - 3))",
    "  $bgBrush.Dispose()",
    `  $fgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('${badgeFg}'))`,
    "  $sf = New-Object System.Drawing.StringFormat",
    "  $sf.Alignment = [System.Drawing.StringAlignment]::Center",
    "  $sf.LineAlignment = [System.Drawing.StringAlignment]::Center",
    "  $glyphFont = New-Object System.Drawing.Font('Microsoft YaHei UI', 14, [System.Drawing.FontStyle]::Bold)",
    `  $g.DrawString('${escapePsSingle(iconGlyph)}', $glyphFont, $fgBrush, (New-Object System.Drawing.RectangleF(0, 0, $iconBox.Width, $iconBox.Height)), $sf)`,
    "  $glyphFont.Dispose(); $sf.Dispose(); $fgBrush.Dispose()",
    "})",
    "$headlineLbl = New-Object System.Windows.Forms.Label",
    `$headlineLbl.Text = ${toPsTextExpr(headlineText)}`,
    "$headlineLbl.Location = New-Object System.Drawing.Point((& $s 74), (& $s 50))",
    `$headlineLbl.Size = New-Object System.Drawing.Size((& $s ${baseWidth - 96}), (& $s ${baseHeadlineHeight}))`,
    "$headlineLbl.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 11.5, [System.Drawing.FontStyle]::Bold)",
    "$headlineLbl.ForeColor = [System.Drawing.ColorTranslator]::FromHtml('#0F172A')",
    "$bodyLbl = New-Object System.Windows.Forms.Label",
    `$bodyLbl.Text = ${toPsTextExpr(message)}`,
    `$bodyLbl.Location = New-Object System.Drawing.Point((& $s 74), (& $s ${baseBodyY}))`,
    `$bodyLbl.Size = New-Object System.Drawing.Size((& $s ${baseWidth - 96}), (& $s ${baseBodyHeight}))`,
    "$bodyLbl.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 9.2)",
    "$bodyLbl.ForeColor = [System.Drawing.ColorTranslator]::FromHtml('#475569')",
    "$footer = New-Object System.Windows.Forms.Panel",
    "$footer.Dock = [System.Windows.Forms.DockStyle]::Bottom",
    "$footer.Height = (& $s 58)",
    "$footer.BackColor = [System.Drawing.ColorTranslator]::FromHtml('#F8FAFC')",
    "$footer.Add_Paint({",
    "  $pen = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml('#E2E8F0'), 1)",
    "  $_.Graphics.DrawLine($pen, 0, 0, $footer.Width, 0)",
    "  $pen.Dispose()",
    "})",
    ...buttonLines.filter(Boolean),
    "$form.CancelButton = $closeX",
    "$form.Add_Paint({",
    "  $pen = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml('#CBD5E1'), 1)",
    "  $_.Graphics.DrawRectangle($pen, 0, 0, ($form.Width - 1), ($form.Height - 1))",
    "  $pen.Dispose()",
    "})",
    "$form.Controls.AddRange(@($footer, $bodyLbl, $headlineLbl, $iconBox, $header, $accent))",
    "$form.Add_Shown({",
    "  try {",
    "    $round = 2; [void][AgyZhcnWin32]::DwmSetWindowAttribute($form.Handle, 33, [ref]$round, 4)",
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

export async function showModernWindowsDialog(options, { exec = execFileAsync, timeoutMs = 24 * 60 * 60 * 1000 } = {}) {
  const script = buildModernWindowsDialogScript(options);
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const { stdout } = await exec(
    "powershell.exe",
    ["-NoProfile", "-STA", "-EncodedCommand", encoded],
    { windowsHide: true, timeout: timeoutMs, encoding: "utf8" },
  );
  return stdout.trim() || options.cancelId || "later";
}

export function getPackStartupDialogSpec({ currentVersion = "", latestVersion = "" } = {}) {
  return {
    title: "Antigravity 汉化包有新版本",
    badge: "Antigravity 汉化包 · 启动检查",
    icon: "update",
    headline: `发现汉化包新版本 v${latestVersion}`,
    message: `${currentVersion ? `当前版本：v${currentVersion}\n` : ""}确认后在后台下载并安全校验，客户端可以继续使用。`,
    cancelId: "later",
    buttons: [
      { id: "skip", text: "跳过此版本", style: "subtle" },
      { id: "later", text: "稍后再说", style: "secondary" },
      { id: "update", text: "立即更新", style: "primary", isAccept: true },
    ],
  };
}

export function getPackLatestDialogSpec({ currentVersion = "", latestVersion = "" } = {}) {
  const cur = currentVersion || latestVersion || "未知";
  const latest = latestVersion || currentVersion || "未知";
  return {
    title: "检查汉化包更新",
    badge: "Antigravity 汉化包 · 版本检查",
    icon: "zhcn",
    headline: `当前汉化包已是最新版本 v${cur}`,
    message: `当前安装版本：v${cur}\nGitHub 最新版本：v${latest}\n\n无需更新。`,
    cancelId: "ok",
    buttons: [
      { id: "ok", text: "确定", style: "primary", isAccept: true },
    ],
  };
}

export function getPackCheckErrorDialogSpec({ currentVersion = "", detail = "" } = {}) {
  return {
    title: "检查汉化包更新",
    badge: "Antigravity 汉化包 · 检查失败",
    icon: "warn",
    headline: "暂时无法获取最新版本信息",
    message: `${currentVersion ? `当前版本：v${currentVersion}\n` : ""}未能连接 GitHub 下载页${detail ? `（${detail}）` : ""}。请检查网络连接后重试，也可前往下载页查看。`,
    cancelId: "close",
    buttons: [
      { id: "close", text: "关闭", style: "secondary" },
      { id: "open", text: "打开下载页", style: "primary", isAccept: true },
    ],
  };
}

export function getPackUpdatedDialogSpec({ latestVersion = "", hotUpdated = true } = {}) {
  return {
    title: "汉化包更新完成",
    badge: "Antigravity 汉化包 · 已升级",
    icon: "zhcn",
    headline: `汉化包已更新至 v${latestVersion}`,
    message: hotUpdated
      ? "中文界面已更新，在客户端窗口按 Ctrl+R 刷新即可看到；其余部分在下次退出客户端时自动完成。"
      : "已完成下载与安全校验；退出后重新打开一次客户端（或运行“启动中文”）即可完成更新。",
    cancelId: "ok",
    buttons: [
      { id: "ok", text: "知道了", style: "primary", isAccept: true },
    ],
  };
}

export function getPackExitDialogSpec({ currentVersion = "", latestVersion = "" } = {}) {
  return {
    title: "Antigravity 汉化包有新版本",
    badge: "Antigravity 汉化包 · 更新提醒",
    icon: "update",
    headline: `发现汉化包新版本 v${latestVersion}`,
    message: `${currentVersion ? `当前版本：v${currentVersion}\n` : ""}确认后在后台下载、校验并完成更新。`,
    cancelId: "later",
    buttons: [
      { id: "no", text: "跳过此版本", style: "subtle" },
      { id: "later", text: "稍后再说", style: "secondary" },
      { id: "yes", text: "立即更新", style: "primary", isAccept: true },
    ],
  };
}

export function getClientFollowDialogSpec({ version = "" } = {}) {
  return {
    title: "Antigravity 客户端已更新",
    badge: "Antigravity 汉化包 · 更新跟进",
    icon: "zhcn",
    headline: `检测到客户端已更新${version ? `（${version}）` : ""}，界面变回英文`,
    message: "是否现在打开汉化窗口一键恢复中文？\n打开后会引导你保存工作并退出再汉化；选“此版本不提醒”后，以后随时可双击“启动中文”。",
    cancelId: "later",
    buttons: [
      { id: "no", text: "此版本不提醒", style: "subtle" },
      { id: "later", text: "稍后再说", style: "secondary" },
      { id: "yes", text: "立即汉化", style: "primary", isAccept: true },
    ],
  };
}

export function getRelaunchConfirmDialogSpec() {
  return {
    title: "Antigravity 中文自动跟进",
    badge: "Antigravity 汉化包 · 重启确认",
    icon: "zhcn",
    headline: "检测到客户端已更新，需要重启以完成中文汉化",
    message: "请先保存当前窗口中的工作。\n点击“立即重启并汉化”将关闭当前英文窗口并重新打开中文版。",
    cancelId: "cancel",
    buttons: [
      { id: "cancel", text: "稍后再说", style: "secondary" },
      { id: "ok", text: "立即重启并汉化", style: "primary", isAccept: true },
    ],
  };
}

export function getWarnNotifyDialogSpec({ headline = "自动跟进未能完成", message = "" } = {}) {
  return {
    title: "Antigravity 汉化包",
    badge: "Antigravity 汉化包 · 提示",
    icon: "warn",
    accentHex: "#D97706",
    headline,
    message,
    cancelId: "ok",
    buttons: [{ id: "ok", text: "知道了", style: "primary", isAccept: true }],
  };
}

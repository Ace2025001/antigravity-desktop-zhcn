import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { getAntigravityUserDataRoot, getStateRoot, projectRoot } from "./paths.mjs";

const execFileAsync = promisify(execFile);
export const AUTO_FOLLOW_TASK_NAME = "AntigravityZhcnAutoFollow";
export const AUTO_FOLLOW_INTERVAL_MINUTES = 30;

/**
 * Convert any Unicode string into a 100% pure 7-bit ASCII VBScript expression
 * using ChrW(...) for non-ASCII characters. Prevents WScript/CScript CP936/ANSI
 * multi-byte quote-swallowing syntax errors (800A0409) on all Windows locales.
 */
export function toVbsAsciiExpr(input) {
  const str = String(input ?? "");
  if (str.length === 0) return '""';
  const tokens = [];
  let asciiBuf = "";
  const flushAscii = () => {
    if (asciiBuf.length > 0) {
      tokens.push(`"${asciiBuf.replaceAll('"', '""')}"`);
      asciiBuf = "";
    }
  };
  for (let i = 0; i < str.length; i += 1) {
    const code = str.charCodeAt(i);
    if (code >= 32 && code <= 126) {
      asciiBuf += str[i];
    } else {
      flushAscii();
      tokens.push(`ChrW(${code})`);
    }
  }
  flushAscii();
  return tokens.join(" & ");
}

function buildVbsVarAssignmentLines(varName, rawValue) {
  const str = String(rawValue ?? "");
  if (str.length === 0) return [`${varName} = ""`];
  const lines = [];
  const chunkSize = 24;
  for (let offset = 0; offset < str.length; offset += chunkSize) {
    const piece = str.slice(offset, offset + chunkSize);
    const expr = toVbsAsciiExpr(piece);
    if (offset === 0) {
      lines.push(`${varName} = ${expr}`);
    } else {
      lines.push(`${varName} = ${varName} & ${expr}`);
    }
  }
  return lines;
}

export function assertPureAsciiVbs(vbsSource) {
  for (let i = 0; i < vbsSource.length; i += 1) {
    const code = vbsSource.charCodeAt(i);
    if (code > 126 || (code < 32 && code !== 13 && code !== 10 && code !== 9)) {
      throw new Error(`VBS 脚本包含非 ASCII 字符 (code=${code}, index=${i})`);
    }
  }
  return vbsSource;
}

export function buildSilentDaemonVbs({ nodeExePath, daemonScriptPath, languagePackDir }) {
  const lines = [
    "' Antigravity ZhCN Silent Auto-Follow Daemon Wrapper (Pure ASCII, Zero Window)",
    "Option Explicit",
    "Dim shell, nodePath, daemonScript, packPath, extraArg, cmd",
    'Set shell = CreateObject("WScript.Shell")',
    ...buildVbsVarAssignmentLines("nodePath", nodeExePath),
    ...buildVbsVarAssignmentLines("daemonScript", daemonScriptPath),
  ];
  if (languagePackDir) {
    lines.push(...buildVbsVarAssignmentLines("packPath", languagePackDir));
    lines.push('shell.Environment("Process")("AGY_LANGUAGE_PACK") = packPath');
  }
  lines.push(
    'extraArg = ""',
    'If WScript.Arguments.Count > 0 Then extraArg = " " & WScript.Arguments(0)',
    'cmd = """" & nodePath & """ """ & daemonScript & """" & extraArg',
    "shell.Run cmd, 0, False",
    ""
  );
  return assertPureAsciiVbs(lines.join("\r\n"));
}

export function buildSilentLauncherVbs() {
  const errPrefix = "Antigravity 中文启动未完成（退出码 ";
  const errSuffix = "）。你可双击 win启动\\启动中文.bat 查看详细提示。";
  const errTitle = "Antigravity 中文助手";
  const lines = [
    "' Antigravity ZhCN Silent GUI Launcher (Pure ASCII, Zero Console Window)",
    "Option Explicit",
    "Dim fso, shell, here, relPack, relCore, relNode, packDir, coreDir, nodeExe, scriptPath, cmd, exitCode, errMsg, errTitle",
    'Set fso = CreateObject("Scripting.FileSystemObject")',
    'Set shell = CreateObject("WScript.Shell")',
    "here = fso.GetParentFolderName(WScript.ScriptFullName)",
    ...buildVbsVarAssignmentLines("relPack", "..\\语言包"),
    ...buildVbsVarAssignmentLines("relCore", "核心程序"),
    ...buildVbsVarAssignmentLines("relNode", "配套程序\\node.exe"),
    "packDir = fso.GetAbsolutePathName(fso.BuildPath(here, relPack))",
    "coreDir = fso.BuildPath(packDir, relCore)",
    "nodeExe = fso.BuildPath(here, relNode)",
    'If Not fso.FileExists(nodeExe) Then nodeExe = "node.exe"',
    'scriptPath = fso.BuildPath(coreDir, "scripts\\start-local.mjs")',
    'If Not fso.FileExists(scriptPath) Then',
    ...buildVbsVarAssignmentLines("errMsg", "未找到汉化核心组件（语言包\\核心程序\\scripts\\start-local.mjs），请确认汉化包解压完整。"),
    ...buildVbsVarAssignmentLines("errTitle", errTitle),
    "  MsgBox errMsg, 48, errTitle",
    "  WScript.Quit 1",
    "End If",
    'shell.Environment("Process")("AGY_LANGUAGE_PACK") = packDir',
    'shell.Environment("Process")("AGY_SILENT_LAUNCH") = "1"',
    'cmd = """" & nodeExe & """ """ & scriptPath & """ start"',
    "exitCode = shell.Run(cmd, 0, True)",
    "If exitCode <> 0 Then",
    `  errMsg = ${toVbsAsciiExpr(errPrefix)} & CStr(exitCode) & ${toVbsAsciiExpr(errSuffix)}`,
    ...buildVbsVarAssignmentLines("errTitle", errTitle),
    "  MsgBox errMsg, 48, errTitle",
    "End If",
    "",
  ];
  return assertPureAsciiVbs(lines.join("\r\n"));
}

export async function ensureAutoFollowDaemonRegistered({
  nodeExePath = process.execPath,
  coreRoot = projectRoot,
  languagePackDir = process.env.AGY_LANGUAGE_PACK || path.join(coreRoot, "config"),
} = {}) {
  if (process.platform !== "win32") return { registered: false, reason: "non-win32" };

  const stateRoot = getStateRoot();
  const daemonDir = path.join(stateRoot, "daemon");
  await mkdir(daemonDir, { recursive: true });

  const daemonScriptPath = path.join(coreRoot, "scripts", "silent-auto-follow-daemon.mjs");
  const vbsPath = path.join(daemonDir, "silent-auto-follow.vbs");
  const vbsContent = buildSilentDaemonVbs({
    nodeExePath,
    daemonScriptPath,
    languagePackDir,
  });

  const existingVbs = await readFile(vbsPath, "ascii").catch(() => null);
  if (existingVbs !== vbsContent) {
    await writeFile(vbsPath, vbsContent, "ascii");
  }

  // Write quit-hook metadata so Electron main process can trigger post-quit update follow
  try {
    const userDataRoot = getAntigravityUserDataRoot();
    await mkdir(userDataRoot, { recursive: true });
    const hookFile = path.join(userDataRoot, "agy_zhcn_autofollow_hook.json");
    await writeFile(
      hookFile,
      JSON.stringify(
        {
          schemaVersion: 1,
          vbsPath,
          nodePath: nodeExePath,
          daemonScript: daemonScriptPath,
          languagePackDir,
          updatedAt: new Date().toISOString(),
        },
        null,
        2
      ),
      "utf8"
    );
  } catch {
    // Ignore if userData dir is not accessible yet
  }

  // User-level task: at logon and every 30 minutes. The daemon compares file
  // size and timestamp first, so most runs finish without hashing anything.
  const psScript = `
$ErrorActionPreference = 'Stop'
$taskName = '${AUTO_FOLLOW_TASK_NAME}'
$vbs = '${vbsPath.replaceAll("'", "''")}'
$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('//B //NoLogo "' + $vbs + '" --periodic')
$triggerPeriodic = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes ${AUTO_FOLLOW_INTERVAL_MINUTES}) -RepetitionDuration (New-TimeSpan -Days 3650)
$user = "$env:USERDOMAIN\\$env:USERNAME"
$triggerLogon = New-ScheduledTaskTrigger -AtLogOn -User $user
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -MultipleInstances IgnoreNew -Hidden
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($triggerPeriodic, $triggerLogon) -Settings $settings -Principal $principal -Force | Out-Null
`;
  try {
    await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psScript],
      { windowsHide: true, timeout: 15000 }
    );
    return { registered: true, vbsPath, taskName: AUTO_FOLLOW_TASK_NAME };
  } catch (err) {
    try {
      await execFileAsync(
        "schtasks.exe",
        [
          "/Create",
          "/TN",
          AUTO_FOLLOW_TASK_NAME,
          "/TR",
          `wscript.exe //B //NoLogo "${vbsPath}" --periodic`,
          "/SC",
          "MINUTE",
          "/MO",
          String(AUTO_FOLLOW_INTERVAL_MINUTES),
          "/F",
        ],
        { windowsHide: true, timeout: 15000 }
      );
      return { registered: true, vbsPath, taskName: AUTO_FOLLOW_TASK_NAME };
    } catch {
      return { registered: false, vbsPath, reason: err.message };
    }
  }
}

/**
 * Remove the scheduled task, its VBS wrapper and the quit-hook file. Used when
 * the user turns auto-follow off and on restore / cleanup / purge. Safe to call
 * when nothing was registered.
 */
export async function removeAutoFollowDaemon({ exec = execFileAsync } = {}) {
  if (process.platform !== "win32") return { removed: false, reason: "non-win32" };
  let removed = false;
  try {
    await exec("schtasks.exe", ["/Delete", "/TN", AUTO_FOLLOW_TASK_NAME, "/F"], { windowsHide: true, timeout: 15000 });
    removed = true;
  } catch {
    // The task did not exist.
  }
  const daemonDir = path.join(getStateRoot(), "daemon");
  await rm(path.join(daemonDir, "silent-auto-follow.vbs"), { force: true }).catch(() => {});
  await rm(path.join(daemonDir, "auto-follow.lock"), { force: true }).catch(() => {});
  try {
    await rm(path.join(getAntigravityUserDataRoot(), "agy_zhcn_autofollow_hook.json"), { force: true });
  } catch {
    // userData root unavailable.
  }
  return { removed };
}

/** Register or remove the background check so it always matches the user's choice. */
export async function applyAutoFollowSetting(settings, options = {}) {
  if (process.platform !== "win32") return { registered: false, reason: "non-win32" };
  if (settings.autoFollow === "off") {
    await removeAutoFollowDaemon(options);
    return { registered: false, reason: "off" };
  }
  return ensureAutoFollowDaemonRegistered(options);
}

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { getAntigravityUserDataRoot, getStateRoot, projectRoot } from "./paths.mjs";

const execFileAsync = promisify(execFile);
export const AUTO_FOLLOW_TASK_NAME = "AntigravityZhcnAutoFollow";

export function buildSilentDaemonVbs({ nodeExePath, daemonScriptPath, languagePackDir }) {
  const esc = (s) => String(s).replaceAll('"', '""');
  return [
    "' Antigravity ZhCN Silent Auto-Follow Daemon Wrapper (Zero Window)",
    "Option Explicit",
    "Dim shell, args, extraArg, cmd",
    'Set shell = CreateObject("WScript.Shell")',
    languagePackDir
      ? `shell.Environment("Process")("AGY_LANGUAGE_PACK") = "${esc(languagePackDir)}"`
      : "' using default language pack directory",
    'extraArg = ""',
    'If WScript.Arguments.Count > 0 Then extraArg = " " & WScript.Arguments(0)',
    `cmd = """${esc(nodeExePath)}"" ""${esc(daemonScriptPath)}""" & extraArg`,
    "shell.Run cmd, 0, False",
    "",
  ].join("\r\n");
}

export function buildSilentLauncherVbs() {
  return [
    "' Antigravity ZhCN Silent GUI Launcher (Zero Console Window)",
    "Option Explicit",
    "Dim fso, shell, here, packDir, coreDir, nodeExe, scriptPath, cmd, exitCode",
    'Set fso = CreateObject("Scripting.FileSystemObject")',
    'Set shell = CreateObject("WScript.Shell")',
    "here = fso.GetParentFolderName(WScript.ScriptFullName)",
    'packDir = fso.BuildPath(here, "..\\语言包")',
    'coreDir = fso.BuildPath(packDir, "核心程序")',
    'nodeExe = fso.BuildPath(here, "配套程序\\node.exe")',
    'If Not fso.FileExists(nodeExe) Then nodeExe = "node.exe"',
    'scriptPath = fso.BuildPath(coreDir, "scripts\\start-local.mjs")',
    'shell.Environment("Process")("AGY_LANGUAGE_PACK") = packDir',
    'shell.Environment("Process")("AGY_SILENT_LAUNCH") = "1"',
    'cmd = """" & nodeExe & """ """ & scriptPath & """ start"',
    "exitCode = shell.Run(cmd, 0, True)",
    "If exitCode <> 0 Then",
    '  MsgBox "Antigravity 中文自动跟进启动遇到问题（退出码 " & exitCode & "）。您可运行 win启动\\启动中文.bat 查看详细诊断信息。", 48, "Antigravity 中文助手"',
    "End If",
    "",
  ].join("\r\n");
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

  const existingVbs = await readFile(vbsPath, "utf8").catch(() => null);
  if (existingVbs !== vbsContent) {
    await writeFile(vbsPath, vbsContent, "utf8");
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

  // Register a user-level Windows Scheduled Task running wscript.exe silently every 5 minutes and at logon
  const psScript = `
$ErrorActionPreference = 'Stop'
$taskName = '${AUTO_FOLLOW_TASK_NAME}'
$vbs = '${vbsPath.replaceAll("'", "''")}'
$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('//B //NoLogo "' + $vbs + '" --periodic')
$triggerPeriodic = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
$triggerLogon = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -MultipleInstances IgnoreNew -Hidden
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($triggerPeriodic, $triggerLogon) -Settings $settings -Force | Out-Null
`;
  try {
    await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psScript],
      { windowsHide: true, timeout: 15000 }
    );
    return { registered: true, vbsPath, taskName: AUTO_FOLLOW_TASK_NAME };
  } catch (err) {
    // Fallback to schtasks.exe if ScheduledTasks module is restricted
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
          "5",
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

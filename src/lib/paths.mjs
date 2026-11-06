import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);

export const projectRoot = path.resolve(currentDirectory, "..", "..");

export function areSamePaths(left, right, platform = process.platform) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const pathApi = platform === "win32" ? path.win32 : path.posix;
  const normalizedLeft = pathApi.normalize(pathApi.resolve(left));
  const normalizedRight = pathApi.normalize(pathApi.resolve(right));
  return platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

export const installRootSourceLabels = Object.freeze({
  environment: "环境变量 AGY_INSTALL_PATH",
  process: "正在运行的 Antigravity Desktop",
  registry: "Windows 卸载注册表",
  default: "默认安装目录",
});

export function getExecutablePath(installRoot, platform = process.platform) {
  if (platform === "darwin" || installRoot.endsWith(".app")) {
    return path.join(installRoot, "Contents", "MacOS", "Antigravity");
  }
  return path.join(installRoot, "Antigravity.exe");
}

export function getAppAsarPath(installRoot, platform = process.platform) {
  if (platform === "darwin" || installRoot.endsWith(".app")) {
    return path.join(installRoot, "Contents", "Resources", "app.asar");
  }
  return path.join(installRoot, "resources", "app.asar");
}

export function getResourcesPath(installRoot, platform = process.platform) {
  if (platform === "darwin" || installRoot.endsWith(".app")) {
    return path.join(installRoot, "Contents", "Resources");
  }
  return path.join(installRoot, "resources");
}

export function getInfoPlistPatchPath(installRoot) {
  return path.join(installRoot, "Contents", "Info.plist");
}

const windowsDiscoveryScript = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$items = @()

Get-CimInstance Win32_Process -Filter "Name = 'Antigravity.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.ExecutablePath } |
  ForEach-Object {
    $items += [pscustomobject]@{
      source = 'process'
      value = [string]$_.ExecutablePath
    }
  }

$uninstallPaths = @(
  'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)

Get-ItemProperty -Path $uninstallPaths -ErrorAction SilentlyContinue |
  Where-Object {
    $displayName = [string]$_.DisplayName
    $displayName -eq 'Antigravity' -or $displayName -match '^Antigravity\\s+\\d'
  } |
  ForEach-Object {
    foreach ($propertyName in @('InstallLocation', 'DisplayIcon', 'UninstallString')) {
      $value = [string]$_.$propertyName
      if (-not [string]::IsNullOrWhiteSpace($value)) {
        $items += [pscustomobject]@{
          source = 'registry'
          value = $value
        }
      }
    }
  }

ConvertTo-Json -InputObject @($items) -Compress
`;

function normalizeInstallRootCandidate(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  let candidate = value.trim();
  const appIndex = candidate.indexOf(".app");
  if (appIndex >= 0) {
    return path.resolve(candidate.slice(0, appIndex + 4));
  }

  const quotedExecutable = candidate.match(/^"([^"]+\.exe)"/i);
  if (quotedExecutable) {
    candidate = quotedExecutable[1];
  } else {
    const executableEnd = candidate.toLowerCase().indexOf(".exe");
    if (executableEnd >= 0) {
      candidate = candidate.slice(0, executableEnd + 4);
    } else {
      candidate = candidate.replace(/^"(.*)"$/, "$1");
    }
  }

  candidate = candidate.replace(/,\s*-?\d+\s*$/, "").trim();
  if (!candidate) {
    return null;
  }

  const candidatePath = path.resolve(candidate);
  return path.extname(candidatePath).toLowerCase() === ".exe"
    ? path.dirname(candidatePath)
    : candidatePath;
}

async function isDesktopInstallRoot(installRoot) {
  try {
    const winExe = path.join(installRoot, "Antigravity.exe");
    const winAsar = path.join(installRoot, "resources", "app.asar");
    const [we, wa] = await Promise.all([
      stat(winExe).catch(() => null),
      stat(winAsar).catch(() => null),
    ]);
    if (we?.isFile() && wa?.isFile()) return true;

    const macExe = path.join(installRoot, "Contents", "MacOS", "Antigravity");
    const macAsar = path.join(installRoot, "Contents", "Resources", "app.asar");
    const [me, ma] = await Promise.all([
      stat(macExe).catch(() => null),
      stat(macAsar).catch(() => null),
    ]);
    if (me?.isFile() && ma?.isFile()) return true;

    return false;
  } catch {
    return false;
  }
}

async function queryDarwinInstallCandidates() {
  const items = [];
  try {
    const { stdout } = await execFileAsync("ps", ["-axo", "comm"], {
      encoding: "utf8",
      timeout: 5_000,
    });
    for (const line of stdout.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.includes(".app/Contents/MacOS/Antigravity")) {
        items.push({ source: "process", value: trimmed });
      }
    }
  } catch {
    // 进程查询失败不影响默认路径检查
  }
  return items;
}

async function queryWindowsInstallCandidates() {
  const { stdout } = await execFileAsync(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      windowsDiscoveryScript,
    ],
    {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      timeout: 10_000,
      windowsHide: true,
    },
  );

  const output = stdout.replace(/^\uFEFF/, "").trim();
  if (!output) {
    return [];
  }

  const parsed = JSON.parse(output);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function uniqueInstallRoots(candidates) {
  const roots = new Map();
  for (const candidate of candidates) {
    const installRoot = normalizeInstallRootCandidate(candidate.value);
    if (installRoot) {
      roots.set(installRoot.toLowerCase(), installRoot);
    }
  }
  return [...roots.values()];
}

async function resolveCandidateTier({
  candidates,
  source,
  validateInstallRoot,
}) {
  const roots = uniqueInstallRoots(
    candidates.filter((candidate) => candidate.source === source),
  );
  const validationResults = await Promise.all(
    roots.map(async (installRoot) => ({
      installRoot,
      valid: await validateInstallRoot(installRoot),
    })),
  );
  const validRoots = validationResults
    .filter((result) => result.valid)
    .map((result) => result.installRoot);

  if (validRoots.length > 1) {
    throw new Error(
      `检测到多个 Antigravity Desktop 安装目录：${validRoots.join("；")}。请设置 AGY_INSTALL_PATH 明确指定。`,
    );
  }

  if (validRoots.length === 1) {
    return {
      installRoot: validRoots[0],
      source,
      sourceLabel: installRootSourceLabels[source],
    };
  }

  return null;
}

export async function resolveInstallRoot({
  env = process.env,
  platform = process.platform,
  findWindowsCandidates = queryWindowsInstallCandidates,
  findDarwinCandidates = queryDarwinInstallCandidates,
  validateInstallRoot = isDesktopInstallRoot,
} = {}) {
  if (env.AGY_INSTALL_PATH?.trim()) {
    const installRoot = normalizeInstallRootCandidate(env.AGY_INSTALL_PATH);
    if (installRoot && (await validateInstallRoot(installRoot))) {
      return {
        installRoot,
        source: "environment",
        sourceLabel: installRootSourceLabels.environment,
      };
    }
    throw new Error(
      `AGY_INSTALL_PATH 指向的目录不是有效的 Antigravity Desktop 安装目录：${env.AGY_INSTALL_PATH}`,
    );
  }

  let candidates = [];
  if (platform === "win32") {
    try {
      candidates = await findWindowsCandidates();
    } catch {
      // 进程或注册表查询失败时仍可继续检查默认安装目录。
    }
  } else if (platform === "darwin") {
    try {
      candidates = await findDarwinCandidates();
    } catch {
      // 进程查询失败时仍可继续检查默认安装目录。
    }
  }

  for (const source of ["process", "registry"]) {
    const resolved = await resolveCandidateTier({
      candidates,
      source,
      validateInstallRoot,
    });
    if (resolved) {
      return resolved;
    }
  }

  if (platform === "darwin") {
    const defaultDarwinPaths = [
      "/Applications/Antigravity.app",
      path.join(os.homedir(), "Applications", "Antigravity.app"),
    ];
    for (const installRoot of defaultDarwinPaths) {
      if (await validateInstallRoot(installRoot)) {
        return {
          installRoot,
          source: "default",
          sourceLabel: installRootSourceLabels.default,
        };
      }
    }
  }

  if (env.LOCALAPPDATA) {
    const installRoot = path.join(
      env.LOCALAPPDATA,
      "Programs",
      "Antigravity",
    );
    if (await validateInstallRoot(installRoot)) {
      return {
        installRoot,
        source: "default",
        sourceLabel: installRootSourceLabels.default,
      };
    }
  }

  throw new Error(
    platform === "darwin"
      ? "未找到有效的 Antigravity Desktop 安装目录。已检查运行进程与默认安装目录；也可以设置 AGY_INSTALL_PATH 后重试。"
      : "未找到有效的 Antigravity Desktop 安装目录。已检查运行进程、Windows 卸载注册表和默认目录；也可以设置 AGY_INSTALL_PATH 后重试。",
  );
}

export async function getInstallRoot(options) {
  return (await resolveInstallRoot(options)).installRoot;
}

export function getStateRoot() {
  if (process.env.AGY_ZHCN_STATE_DIR) {
    return path.resolve(process.env.AGY_ZHCN_STATE_DIR);
  }
  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "AntigravityZhcn",
    );
  }
  if (process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, "AntigravityZhcn");
  }
  throw new Error("环境变量 LOCALAPPDATA 不存在。");
}

export function getAntigravityUserDataRoot() {
  if (process.env.AGY_USER_DATA_PATH) {
    return path.resolve(process.env.AGY_USER_DATA_PATH);
  }
  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "Antigravity",
    );
  }
  if (process.env.APPDATA) {
    return path.join(process.env.APPDATA, "Antigravity");
  }
  if (process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, "Antigravity");
  }
  throw new Error("环境变量 APPDATA 或 LOCALAPPDATA 不存在。");
}

export function getRuntimePreviewRoot() {
  return path.join(projectRoot, ".runtime", "previews");
}

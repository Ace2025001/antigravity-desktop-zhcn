import fs from "node:fs";
import path from "node:path";
import { projectRoot } from "./paths.mjs";

function getPackageVersion() {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"),
    );
    return pkg.version || "1.5.0";
  } catch {
    return "1.5.0";
  }
}

function compareVersionsDescending(left, right) {
  return right.localeCompare(left, undefined, { numeric: true });
}

function formatPlatform(platform) {
  if (platform === "win32") return "Windows";
  return platform;
}

export function buildReleaseCompatibilityNotes(manifest) {
  if (!manifest || !Array.isArray(manifest.targets)) {
    throw new Error("无法生成 Release 兼容版本说明。");
  }

  const groups = new Map();
  for (const target of manifest.targets) {
    const key = `${target.appVersion}/${target.platform}/${target.arch}`;
    const group = groups.get(key) ?? {
      appVersion: target.appVersion,
      platform: target.platform,
      arch: target.arch,
      builds: new Set(),
    };
    group.builds.add(target.appAsarSha256);
    groups.set(key, group);
  }

  const supported = [...groups.values()].sort(
    (left, right) =>
      compareVersionsDescending(left.appVersion, right.appVersion) ||
      left.platform.localeCompare(right.platform) ||
      left.arch.localeCompare(right.arch),
  );
  if (supported.length === 0) {
    throw new Error("兼容性清单没有可发布的目标版本。");
  }

  const version = getPackageVersion();
  const lines = [
    `## Antigravity Desktop 中文汉化包 v${version}`,
    "",
    "Windows x64 与 Apple 芯片 macOS 双端发布，共享中文词库与汉化引擎。",
    "",
    "### 下载和使用",
    "",
    "- Windows：antigravity-desktop-zhcn-portable-win-x64.zip",
    "- Apple 芯片 Mac：antigravity-desktop-zhcn-portable-macos-arm64.zip",
    "- 下载对应平台的通用 portable ZIP，完整解压，双击安装中文；平时使用启动中文，需要时使用恢复英文。",
    "- 两端便携包内置 Node.js 和锁定依赖，无需安装开发环境。每个 ZIP 附带 SHA-256 校验文件。",
    "",
    "### 本次改进",
    "",
    "- 新增 Mac 独立中文副本、原生菜单翻译、资源完整性校验与本地签名，保留官方原版。",
    "- Mac 安装引导串联检查、打开原版、准备界面、安装和启动；用户按提示保存工作并退出应用。",
    "- 两端统一为安装中文、启动中文、恢复英文三个顶层入口。",
    "- 保留最新 Windows 汉化词库及远程智能体相关翻译。",
    "- 双平台自动化测试和便携包检查全部成功后才公开发布。",
    "",
    "### 兼容性边界",
    "",
    "Mac 补充包作者记录的实机环境为 macOS 27.0.1 / Antigravity Desktop 2.29.0 / arm64。合并后的安装流程尚未完成真实 Mac 客户端实机复验；Intel Mac 未验证。CI 上的测试与打包不等于客户端实机验收。",
    "",
    "客户端更新后可重新运行安装中文。新旧版本均须通过结构与资源检查，不承诺所有版本兼容。Mac 需要重新采集当前官方界面，不能沿用其他构建缓存。",
    "",
    "### Windows 已登记构建",
    "",
  ];
  for (const group of supported) {
    const buildText =
      group.builds.size > 1 ? `，${group.builds.size} 个已验证构建` : "";
    lines.push(
      `- \`${group.appVersion}\` / ${formatPlatform(group.platform)} ${group.arch}${buildText}`,
    );
  }
  lines.push(
    "",
    "> [!NOTE]",
    "> Windows 未登记构建可尝试动态适配；结构或资源检查失败时停止。已登记列表不是所有版本兼容的承诺。",
    "",
    "### 📜 项目来源与致谢",
    "",
    "本项目基于社区开源项目 [chenmo00000/antigravity-desktop-zhcn](https://github.com/chenmo00000/antigravity-desktop-zhcn) 继续迭代、修复与扩展，遵循 MIT License 开源。感谢原作者与社区贡献者！",
  );
  return lines.join("\n");
}

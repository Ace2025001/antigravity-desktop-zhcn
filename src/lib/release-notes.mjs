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
    "### 普通用户只下载这个",
    "",
    `## [⬇ 下载完整汉化包（Windows + Mac）](https://github.com/Ace2025001/antigravity-desktop-zhcn/releases/download/v${version}/${encodeURIComponent('Antigravity-Windows+Mac.zip')})`,
    "",
    "下载 **Antigravity-完整汉化包-Windows+Mac.zip** → 右键“全部解压缩” → 打开 win启动 或 mac启动 → 双击“启动中文”。",
    "",
    "内置所需文件，可离线运行。不需要下载 Code 或 Source code，它们是给开发者使用的源码。",
    "",
    "[安装教程与常见问题](https://ace2025001.github.io/antigravity-desktop-zhcn/) · [Windows 教程](https://ace2025001.github.io/antigravity-desktop-zhcn/windows/) · [Mac 教程](https://ace2025001.github.io/antigravity-desktop-zhcn/macos/)",
    "",
    "<details><summary>已经有完整包，只想更新语言？点这里</summary>",
    "",
    "已有本版完整包时，可以下载独立语言包更新翻译。首次使用或需要本次启动流程修复时，请下载上面的完整包。",
    "",
    "</details>",
    "",
    "### 本次改进",
    "",
    "- 修复开启 Antigravity“后台运行”时，启动中文等待 60 秒后提示“客户端未退出”而汉化失败的问题。",
    "- Windows 客户端关闭时，直接从安装目录读取并校验原版界面，不再需要先打开客户端；不再只限某一个已登记构建，客户端更新后同样适用。",
    "- 汉化工具自己临时打开的客户端，读取完界面后直接关闭，无需手动退出。",
    "- 生成中文界面时实时显示已用时，不再长时间没有反馈。",
    "- 修复 Windows 2.30.0 补丁写入错误位置、重启后仍显示英文的问题。",
    "- 保留免费方案配额提示、跨对话搜索引导的翻译优化，以及 macOS 路径比较修复。",
    "- 三目录结构：语言包保存共用核心一份，win启动与mac启动各保存本平台配套程序。",
    "- 启动中文和恢复英文统一入口；自动识别安装位置，找不到或多安装时弹窗选择。",
    "- 成功启动后创建Antigravity自动汉化快捷方式：缺失才创建，路径变化才更新。",
    "- 已汉化直接显示主窗口；启动提示、倒计时等非汉化改动不再触发重装。",
    "- 客户端运行时给出 60 秒保存时间：手动退出自动继续，按 Y 立即强制关闭，按 N 不强制并一直等待；无操作时先请求正常退出，仍未退出再强制关闭。退出范围限定到选中的安装。",
    "- Mac 安装引导串联检查、打开原版、准备界面、安装和启动；用户按提示保存工作并退出应用。",
    "- 目录仅分为 win启动、mac启动、语言包；启动中文自动判断首次安装、语言更新或直接启动。",
    "- 保留最新 Windows 汉化词库及远程智能体相关翻译。",
    "- 双平台自动化测试和便携包检查全部成功后才公开发布。",
    "",
    "### 兼容性边界",
    "",
    "Mac 补充包实测 macOS 27.0.1 / Desktop 2.29.0 / arm64。合并后的安装流程尚未完成真实 Mac 客户端实机复验；Intel Mac 未验证。CI 上的测试与打包不等于客户端实机验收。",
    "",
    "客户端更新后可重新运行启动中文。新旧版本均须通过结构与资源检查，不承诺所有版本兼容。Mac 需要重新采集当前官方界面，不能沿用其他构建缓存。",
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
    "### 📜 开源协议",
    "",
    "本项目遵循 MIT License 开源。",
  );
  return lines.join("\n");
}

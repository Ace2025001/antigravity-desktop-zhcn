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
    "下载 仅更新语言包-不能单独使用.zip，解压后替换原有“语言包”文件夹。首次使用、文件已删除或从 v2.2.0 及更早版本升级，请下载上面的完整包。",
    "",
    "</details>",
    "",
    "升级提示：v2.2.0及更早版本必须先下载完整包，本版入口和目录有变化，不能只覆盖语言包。",
    "",
    "### 本次改进",
    "",
    "- 修复旧 ZIP 在 Windows 资源管理器中显示空文件夹的问题；新增资源管理器目录检查。",
    "- 下载文件改为直观名称，校验信息折叠收纳，不再单独提供两个校验附件。",
    "- 三目录结构：语言包保存共用核心一份，win启动与mac启动各保存本平台配套程序。",
    "- 启动中文和恢复英文统一入口；自动识别安装位置，找不到或多安装时弹窗选择。",
    "- 成功启动后创建Antigravity自动汉化快捷方式：缺失才创建，路径变化才更新。",
    "- 已汉化直接显示主窗口；启动提示、倒计时等非汉化改动不再触发重装。",
    "- 逐秒60秒保存提示，超时仅请求正常退出，不强制终止；退出范围限定到选中的安装。",
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

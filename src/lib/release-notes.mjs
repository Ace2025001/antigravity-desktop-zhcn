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
    "- **首次使用会询问三项设置**，直接回车即用推荐值，之后可双击新增的“汉化设置”随时修改：客户端更新后怎么处理（自动汉化 / 先问我 / 不处理）、是否联网补充翻译、是否创建桌面快捷方式。",
    "- **客户端更新后自动汉化**（Windows）：后台检查改为开机时和每 30 分钟一次，只比较文件大小和时间；客户端正在使用时等你关闭后再汉化，绝不强制关闭；“先问我”模式会弹窗询问。选“不处理”时不添加计划任务，**恢复英文或卸载时计划任务会一并删除**。",
    "- **联网补充翻译改为可开关**：只经汉化包的主进程代理联网，关闭后完全不联网；只发送界面文字和对话标题，不发送对话内容、代码、终端输出、文件和你输入的内容。移除了页面内直连翻译和一个早期遗留的本地端口请求。",
    "- **对话标题默认只在界面上显示中文，不再修改你的对话记录**；需要时可在“汉化设置”里开启“标题写回”。",
    "- 桌面“Antigravity自动汉化”快捷方式改为可选；选择不创建时，会移除之前创建的桌面快捷方式。",
    "- 新增词条数量基线检查和多项安全测试，防止词条被误删、防止页面代码绕过联网开关。",
    "- v2.3.5 至 v2.4.1 期间：适配客户端 2.31.0 与 2.32.2，精确规则增至 12,795 条、动态规则 3,167 条，覆盖插件市场详情、自动化编辑器、Gemini 4 系列模型卡片、权限预设等界面。",
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

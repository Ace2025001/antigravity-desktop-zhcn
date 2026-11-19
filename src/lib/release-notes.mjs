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
    "[安装教程与常见问题](https://ace2025001.github.io/antigravity-desktop-zhcn/)",
    "",
    "<details><summary>已经有完整包，只想更新语言？点这里</summary>",
    "",
    "已有本版完整包时，可以下载独立语言包更新翻译。首次使用或需要本次启动流程修复时，请下载上面的完整包。",
    "",
    "</details>",
    "",
    "### 本次改进（v3.0.8）",
    "",
    "- **自动化与定时任务完整汉化**：彻底修复自动化页面与定时任务页面列表为空时，因 React 碎片化 DOM 文本节点拼接导致的 `No automations yet` 漏翻问题，统一显示为规范中文“暂无自动化”/“暂无定时任务”。",
    "- **新建按钮汉化**：右上角 `+ New` 按钮文字精准汉化为“新建”，加号保持原生 SVG 图标，并一并汉化无障碍辅助提示（`aria-label` 为“新建自动化”）。",
    "- **双保险防护**：采用“编译期源码正则替换 + 运行时 DOM 动态靶向拦截”机制，杜绝后续前端组件微调导致的失效。",
    "- **词库扩充**：新增自动化与定时任务相关的列表空状态及搜索提示词条。",
    "",
    "### v3.0.7 改进",
    "",
    "- **隐私修正**：去掉上一版代码中写死的个人姓名，个人信息只按界面区域（账号卡片、头像菜单、含邮箱的区域）排除，不在代码里列出任何人名。",
    "- 联网学到的译文只保存在本机文件中，不再在客户端浏览器存储里另存一份；旧版本留下的副本会自动清除，已删除或已过滤的条目不会再被读回来。",
    "- 首页和网站加入汉化效果截图。",
    "",
    "### v3.0.6 改进",
    "",
    "- 首页说明补全：解压后的目录结构、首次使用的两项设置、客户端更新后会发生什么、联网补充翻译发送和不发送的内容、支持范围，以及“能恢复英文吗”“该下载哪个包”两个常见问题。",
    "- 实测版本更新为 Windows 客户端 2.32.2、2.33.0。",
    "",
    "### v3.0.5 改进",
    "",
    "- **隐私与账户防护**：账号卡片、头像菜单与包含邮箱的用户信息区域严禁送入联网翻译；禁止将用户个人姓名当成界面词条误机翻，自动丢弃误学的个人姓名条目。",
    "- **修复年龄限制提示与避免跨句吞噬**：修正针对账号资格的宽泛正则，防止将整段 18 周岁年龄验证提示吞入变量；精准补全“若要使用 Antigravity，你必须年满 18 周岁”等登录错误页面的中文翻译。",
    "",
    "### v3.0.4 改进",
    "",
    "- 修复：在 Windows 上从源码运行时，换行符差异会让汉化包误判为需要重新汉化；现在判断时忽略换行差异。普通用户无影响。",
    "",
    "### v3.0.3 改进",
    "",
    "- 补充内置浏览器清除数据警告、快捷键由 VS Code 管理的说明、主机名校验、GitHub 身份验证等漏翻。",
    "- 维护工具：新增 `npm run hot-update`，修改词库后不关闭客户端即可更新中文界面（刷新窗口后生效）。普通用户无需操作。",
    "",
    "### v3.0.2 改进",
    "",
    "- **适配客户端 2.33.0**：实测在客户端里点“重启以更新”后自动汉化成功；补上新版快捷键“终端：全选”、SSH 主机菜单（搜索主机、加载中、说明文字）等漏翻。",
    "- **联网补充翻译更准**：快捷键说明（如“‘切换终端’的快捷键 Ctrl+J”）、“安装 某插件”、带轮数的对话标题改为按固定句式生成，不再整句机翻；插件和服务名（如 Stripe、Better Stack）保持原名；以前学到的机翻结果会被新规则自动取代。",
    "- **联网补充翻译更严格地保护隐私**：含文件名、链接、路径或代码的文字一律不发送；设置页里名字带“终端”“消息”的选项不再被误当成对话内容而漏翻。",
    "- 统一“蜂群（Swarm）”“附带提问”等用语，重写蜂群相关技能说明。",
    "",
    "### v3.0.1 改进",
    "",
    "- **客户端更新后立即跟随汉化**（Windows）：在客户端里点“重启以更新”后，等新版本装好就关闭重启出来的英文窗口，在进度窗口里重新汉化并打开中文版，实测约 40 秒完成；“先问我”模式在更新完成时弹窗询问。",
    "- **去掉定时计划任务**：不再开机检查和每 30 分钟检查，也不常驻后台；v3.0.0 留下的计划任务会在下次运行“启动中文”时自动删除。",
    "- 首页与说明文档精简，补全汉化覆盖范围说明。",
    "",
    "### v3.0 主要功能",
    "",
    "- **首次使用会询问两项设置**，直接回车即用推荐值，之后可双击新增的“汉化设置”随时修改：客户端更新后怎么处理（自动汉化 / 先问我 / 不处理）、是否联网补充翻译。",
    "- **联网补充翻译改为可开关**：只经汉化包的主进程代理联网，关闭后完全不联网；只发送界面文字和对话标题，不发送对话内容、代码、终端输出、文件和你输入的内容。移除了页面内直连翻译和一个早期遗留的本地端口请求。",
    "- **对话标题只在界面上显示中文，不再修改你的对话记录**，恢复英文后自动变回原样。",
    "- 等待退出客户端时改用 1、2 选择，与设置问题一致。",
    "- **黑框窗口重新设计**：按步骤分组显示进度，用 ✔ / ! / ✘ 标出结果，需要你操作的选项单独突出，结束时给出总结；出错时说明怎么办，不再显示一大段技术报错。",
    "- 新增词条数量基线检查和多项安全测试，防止词条被误删、防止页面代码绕过联网开关。",
    "- 至 v3.0.7：适配客户端 2.31.0、2.32.2 与 2.33.0，精确规则增至 12,839 条、动态规则 3,168 条，覆盖插件市场详情、自动化编辑器、Gemini 4 系列模型卡片、权限预设等界面。",
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

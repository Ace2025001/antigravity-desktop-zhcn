# Antigravity Desktop 汉化包（反重力中文）｜Windows / Mac 简体中文语言包

[![最新版本](https://img.shields.io/github/v/release/Ace2025001/antigravity-desktop-zhcn?label=%E6%9C%80%E6%96%B0%E7%89%88%E6%9C%AC)](https://github.com/Ace2025001/antigravity-desktop-zhcn/releases/latest)
[![下载量](https://img.shields.io/github/downloads/Ace2025001/antigravity-desktop-zhcn/total?label=%E4%B8%8B%E8%BD%BD%E9%87%8F)](https://github.com/Ace2025001/antigravity-desktop-zhcn/releases)
[![平台](https://img.shields.io/badge/%E5%B9%B3%E5%8F%B0-Windows%20x64%20%7C%20macOS%20Apple%20%E8%8A%AF%E7%89%87-blue)](#常见问题)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

让 Google Antigravity（反重力）Desktop 桌面客户端显示简体中文。Windows 和 Apple 芯片 Mac 通用，解压即用，客户端更新后自动重新汉化，随时可以恢复英文。

[安装教程](https://ace2025001.github.io/antigravity-desktop-zhcn/) · [Windows 教程](https://ace2025001.github.io/antigravity-desktop-zhcn/windows/) · [Mac 教程](https://ace2025001.github.io/antigravity-desktop-zhcn/macos/) · [常见问题](https://ace2025001.github.io/antigravity-desktop-zhcn/faq/) · [更新日志](https://ace2025001.github.io/antigravity-desktop-zhcn/changelog/) · [English](README.en.md)

![Antigravity Desktop 简体中文界面汉化效果预览](docs/images/antigravity-zhcn-preview.png)

## 下载与使用

### [⬇ 下载完整汉化包（Windows + Mac）](https://github.com/Ace2025001/antigravity-desktop-zhcn/releases/latest/download/Antigravity-Windows%2BMac.zip)

1. 下载后右键“全部解压缩”。
2. Windows 打开 `win启动`，Mac 打开 `mac启动`。
3. 双击 **启动中文**，按提示完成。

想换回英文，双击 **恢复英文**；想改设置，双击 **汉化设置**。

> 发布页上的文件名是 `Antigravity-完整汉化包-Windows+Mac.zip`，下载后显示为 `Antigravity-Windows+Mac.zip`，是同一个文件。不需要下载 Source code。

## 主要特点

- **解压即用**：内置运行环境，无需安装 Node.js，自动找到客户端。
- **更新后自动汉化**：客户端更新后自动重新汉化，也可以设为先询问。
- **翻译全面**：1.6 万条译文，覆盖菜单、设置、智能体（Agent）执行过程、工具调用、MCP、插件市场等。
- **联网补充翻译**：新版本里还没收录的英文用谷歌翻译补齐，可随时关闭。
- **安全可恢复**：不修改对话记录，一键恢复英文；Mac 保留官方原版，另建中文副本。

> 觉得好用的话，欢迎点右上角 ⭐ Star，让更多人搜到这个汉化包。

## 常见问题

### 客户端更新后还要重新汉化吗？

不用。Windows 默认自动处理：后台定期做一次很轻的检查，发现客户端更新就重新汉化；如果你正在使用，会等你关闭后再处理。也可以在“汉化设置”里改成“先问我”或“不处理”。Mac 用桌面上的“Antigravity自动汉化”打开即可。

### 会上传我的对话吗？

不会。只有开启联网补充翻译时，才会发送界面上还没收录的英文和对话标题；对话内容、代码、文件和你输入的内容都不会发送。

### 支持哪些系统和版本？

Windows x64（已在 Antigravity Desktop 2.32.2 实测）和 Apple 芯片 Mac，Intel Mac 未验证。只适用于 Antigravity Desktop 桌面客户端，不是 Antigravity IDE 扩展。

### 怎么更新语言包？

在[最新发布页](https://github.com/Ace2025001/antigravity-desktop-zhcn/releases/latest)下载新版，替换“语言包”文件夹，再双击“启动中文”。

### 能让 AI 助手帮我安装吗？

可以。把下面这句话发给豆包、DeepSeek、Antigravity、Codex、Claude Code 等 AI 助手：

> 帮我把 https://github.com/Ace2025001/antigravity-desktop-zhcn 安装到电脑上，按仓库里的 docs/ai-install.md 操作

更多问题见[常见问题页](https://ace2025001.github.io/antigravity-desktop-zhcn/faq/)。

## 开发

需要 Node.js >= 22.12.0，执行 `npm ci --ignore-scripts`、`npm test`、`npm run validate`。参见 [系统架构](docs/architecture.md)、[构建与发布](docs/releasing.md)、[Mac 高级说明](macOS/README.md)、[AI 助手安装指南](docs/ai-install.md)、[AGENTS.md](AGENTS.md)。

## 致谢

- [@javaht](https://github.com/javaht)：macOS 适配与实机测试（[#7](https://github.com/Ace2025001/antigravity-desktop-zhcn/pull/7)）。

欢迎通过 [Issue](https://github.com/Ace2025001/antigravity-desktop-zhcn/issues) 反馈漏翻词条，或参考[贡献指南](CONTRIBUTING.md)提交合并请求。采用 [MIT License](LICENSE) 开源。

# Antigravity 汉化项目：Windows 桌面版中文语言包

简体中文 · [English](README.en.md)

**给 Windows 上的 Google Antigravity Desktop 独立桌面客户端安装简体中文界面。** **支持最新版，随客户端更新动态适配，无需按客户端版本更换安装包。** 下载便携包、解压后按提示运行，无需自行安装 Node.js 或配置编程环境，提供兼容检查、桌面快捷方式和恢复英文入口。

本项目由社区维护，与 Google 无隶属关系。适用于 **Windows x64 的独立桌面客户端**；Antigravity IDE 的扩展语言包属于另一类方案。

[**下载 Windows 便携中文包**](https://github.com/Ace2025001/antigravity-desktop-zhcn/releases/latest/download/antigravity-desktop-zhcn-portable-win-x64.zip) · [发布说明与校验文件](https://github.com/Ace2025001/antigravity-desktop-zhcn/releases/latest) · [问题反馈](https://github.com/Ace2025001/antigravity-desktop-zhcn/issues)

## Antigravity 怎么汉化？

1. **下载**：选择 `antigravity-desktop-zhcn-portable-win-x64.zip`，并用发布页的同名 `.sha256` 文件核对摘要。普通用户下载便携包即可，`Source code` 是源码包。
2. **解压**：完整解压到本地文件夹，不要在压缩包里直接运行。
3. **检查（可选）**：双击 **`一键检查兼容性.bat`**，查看客户端版本与指纹。该入口检查已登记构建，未登记不等于自适应安装不支持。
4. **汉化**：保存正在编辑的内容，双击 **`一键汉化.bat`**，按提示操作。也可直接运行 **`启动 Antigravity（自动汉化）.bat`** 使用动态自适应入口，完成后检查中文界面。
5. **日常启动（可选）**：运行 **`生成桌面快捷方式.bat`**，以后通过生成的快捷方式启动。

**想恢复英文？** 保存工作后运行 **`一键恢复英文.bat`**，按提示完成恢复。请保留原始备份和工具状态。

> 动态适配通过读取当前客户端界面、检查代码结构、备份后生成汉化实现，不局限于已登记白名单。安装会修改客户端资源；如果官方结构变更导致检查失败，请更新补丁或反馈，不要关闭校验强行安装。

## 适合哪些用户？

- 使用 **Windows x64 + Antigravity Desktop 独立桌面客户端**，想把界面改成简体中文。
- 不想自行安装 Node.js、npm 或其他开发环境，希望下载便携包后运行。
- 希望有明确的兼容检查、安装步骤与恢复英文方法。
- 希望让支持电脑操作的 AI 助手协助下载、检查和安装。

## 让 AI 帮你安装

如果你使用 Antigravity、WorkBuddy 或其他支持电脑操作的 AI 助手，可以复制：

> 请帮我安装 https://github.com/Ace2025001/antigravity-desktop-zhcn 的中文汉化补丁。先读 README，确认我使用的是 Windows x64 和 Antigravity Desktop 独立桌面客户端，再下载最新正式便携包、核对 SHA-256。按文档选择已登记构建安装或动态自适应入口，按提示操作，提醒我保存工作，完成后检查中文界面并告诉我如何恢复英文。遵守我的操作授权，保留现有代理、节点和 TUN 设置。

详细步骤、命令与结果判断见 [AI 助手安装指南](docs/ai-install.md)。

## 支持范围与版本兼容

| 项目 | 说明 |
| --- | --- |
| 操作系统 | Windows x64 |
| 目标产品 | Google Antigravity Desktop 独立桌面客户端 |
| 补丁版本 | 以 [Releases](https://github.com/Ace2025001/antigravity-desktop-zhcn/releases/latest) 为准，与客户端版本号不同 |
| 适配方式 | 动态读取当前客户端并执行结构检查，无需逐版下载不同补丁 |
| 本机是否适用 | 结合当前发布包清单、客户端文件指纹及运行时检查结果判断 |
| 最新版与历史版本 | 提供跨版本动态适配；白名单用于已知构建检查，不是支持上限。详见 [动态适配说明](docs/compatibility.md) |

## 功能与效果

- 中文界面覆盖主界面、设置、菜单、托盘、权限提示等区域，具体效果随客户端版本和词库变化。
- 支持生成桌面快捷方式，通过自动汉化启动入口检查并尝试跟进客户端更新。
- 提供原始文件备份、安装状态记录与恢复英文入口。

![Antigravity Desktop 中文汉化效果预览](docs/images/antigravity-zhcn-preview.png)

## 常见问题

### 想找一个 Windows 上可直接运行的 Antigravity 汉化项目？

本项目提供内置运行环境的 Windows x64 便携中文包，包含检查、安装、恢复及快捷方式入口。先确认使用的是 Desktop 独立桌面客户端，再按上方步骤检查和安装；可通过动态适配入口跟进客户端版本。

### 装了中文扩展，为什么桌面客户端还是英文？

先确认使用的是 Antigravity Desktop 还是 Antigravity IDE。IDE 的编辑器语言包不等于独立桌面客户端的汉化补丁，本项目面向后者。

### 需要安装 Node.js 或 Python 吗？

便携发布包内置 Node.js 和所需依赖，无需自行安装。源码运行则需要开发环境，见下方说明。

### 更新后又变成英文怎么办？

保存工作后，可以通过 **`启动 Antigravity（自动汉化）.bat`** 或生成的桌面快捷方式尝试跟进更新。这会执行自适应流程，可能启动和退出客户端；若结构检查失败或有其他错误，请停止并提交反馈，不要强行替换文件。白名单未登记不代表无法自适应；结构检查通过与逐版本实机验证是不同概念。

### 没找到安装目录怎么办？

工具会尝试识别运行中的客户端、Windows 卸载注册表和默认安装位置。自定义路径或多个安装目录可通过当前终端的 `AGY_INSTALL_PATH` 环境变量明确指定，详见 [路径识别代码](src/lib/paths.mjs)。

### 可以完全自动、无人值守安装吗？

当前流程包含确认和关闭客户端等交互，不能保证无人值守完成。AI 助手需要支持电脑操作和交互终端，或将必要步骤交给用户。

### 安装失败或恢复失败怎么办？

保留报错、客户端版本和工具状态，通过 [Issues](https://github.com/Ace2025001/antigravity-desktop-zhcn/issues) 反馈。提交日志前去除账号、令牌等隐私信息；不要删除恢复所需的原始备份。

## 开发者使用

源码运行需要 **Node.js >= 22.12.0** 与 npm：

```powershell
npm ci --ignore-scripts
node scripts/validate-project.mjs
node --test
```

构建 Windows 便携包：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-portable.ps1
```

- [系统架构](docs/architecture.md)
- [版本维护与适配](docs/maintenance.md)
- [构建与发布](docs/releasing.md)
- [贡献指南](CONTRIBUTING.md)
- [版本更新记录](https://github.com/Ace2025001/antigravity-desktop-zhcn/releases)

## English summary

**Antigravity Desktop Chinese Localization Patch for Windows x64.** Download the portable ZIP from [Releases](https://github.com/Ace2025001/antigravity-desktop-zhcn/releases/latest), verify its SHA-256, extract it, check compatibility, and follow the interactive installation steps. The portable package bundles Node.js and dependencies. A restore command is provided. This community project targets the standalone Desktop client; it is not an IDE language-pack extension. Supports the latest client through dynamic adaptation. Known fingerprint records are not the support ceiling; structural checks must still pass.

## 项目来源与许可证

本项目基于 [chenmo00000/antigravity-desktop-zhcn](https://github.com/chenmo00000/antigravity-desktop-zhcn) 继续维护和扩展，感谢原作者及社区贡献者。采用 [MIT License](LICENSE) 开源。


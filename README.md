# Antigravity 汉化项目：Windows 桌面版中文语言包

**给 Windows 上的 Google Antigravity Desktop 独立桌面客户端安装简体中文界面。** 下载便携包、解压后按提示运行，无需自行安装 Node.js 或配置编程环境，提供兼容检查、桌面快捷方式和恢复英文入口。

本项目由社区维护，与 Google 无隶属关系。适用于 **Windows x64 的独立桌面客户端**；Antigravity IDE 的扩展语言包属于另一类方案。

[**下载 Windows 便携中文包**](https://github.com/Ace2025001/antigravity-desktop-zhcn/releases/latest/download/antigravity-desktop-zhcn-portable-win-x64.zip) · [发布说明与校验文件](https://github.com/Ace2025001/antigravity-desktop-zhcn/releases/latest) · [问题反馈](https://github.com/Ace2025001/antigravity-desktop-zhcn/issues)

## Antigravity 怎么汉化？

1. **下载**：选择 `antigravity-desktop-zhcn-portable-win-x64.zip`，并用发布页的同名 `.sha256` 文件核对摘要。普通用户下载便携包即可，`Source code` 是源码包。
2. **解压**：完整解压到本地文件夹，不要在压缩包里直接运行。
3. **检查**：双击 **`一键检查兼容性.bat`**，查看客户端版本与检查结果。运行时检查可能需要先打开 Antigravity。
4. **汉化**：保存正在编辑的内容，双击 **`一键汉化.bat`**，按提示确认并关闭客户端，完成后重新打开检查中文界面。
5. **日常启动（可选）**：运行 **`生成桌面快捷方式.bat`**，以后通过生成的快捷方式启动。

**想恢复英文？** 保存工作后运行 **`一键恢复英文.bat`**，按提示完成恢复。请保留原始备份和工具状态。

> 安装会修改客户端资源并写入中文界面文件。当前“一键汉化”入口在安装失败后可能自动尝试自适应流程；遇到不兼容、文件异常或报错，请先保留输出并查看下方说明，不要反复尝试覆盖。

## 适合哪些用户？

- 使用 **Windows x64 + Antigravity Desktop 独立桌面客户端**，想把界面改成简体中文。
- 不想自行安装 Node.js、npm 或其他开发环境，希望下载便携包后运行。
- 希望有明确的兼容检查、安装步骤与恢复英文方法。
- 希望让支持电脑操作的 AI 助手协助下载、检查和安装。

## 让 AI 帮你安装

如果你使用 Antigravity、WorkBuddy 或其他支持电脑操作的 AI 助手，可以复制：

> 请帮我安装 https://github.com/Ace2025001/antigravity-desktop-zhcn 的中文汉化补丁。先读 README，确认我使用的是 Windows x64 和 Antigravity Desktop 独立桌面客户端，再下载最新正式便携包、核对 SHA-256、检查兼容性。适用时按安装提示操作，提醒我保存工作，完成后检查中文界面并告诉我如何恢复英文。遵守我的操作授权，保留现有代理、节点和 TUN 设置。

### 给协助安装的 AI 助手

以下是安装参考，操作范围以用户当前请求和设备权限为准：

1. **确认产品与路径**：区分 Desktop 与 IDE，确认客户端版本和已有汉化状态。不要仅凭名称或版本数字判断兼容。
2. **获取便携包**：从本仓库 [最新正式 Release](https://github.com/Ace2025001/antigravity-desktop-zhcn/releases/latest) 下载上述 ZIP 与校验文件，核对摘要后完整解压。便携包已包含 `runtime/node.exe` 和所需依赖。
3. **先检查再安装**：在解压后的根目录使用内置 Node.js。自动化执行优先直接调用 CLI，以保留原始错误，避免批处理在失败后自动转入其他安装方式。

检查命令：

```powershell
& '.\runtime\node.exe' '.\src\cli.mjs' check
```

检查适用后，在支持交互输入的终端运行：

```powershell
& '.\runtime\node.exe' '.\src\cli.mjs' install
```

4. **处理交互**：安装器可能先启动客户端读取界面资源，再要求退出客户端并按回车。提醒用户保存工作，按既有授权处理退出；不要为了绕过等待而强杀客户端。没有电脑操作或交互能力的助手，应给用户明确步骤。
5. **确认结果**：读取完整输出，不要只看退出码。取消操作也可能返回 0；客户端未运行时，检查通过可能只代表静态检查通过。打开客户端确认代表性界面显示中文后，再报告成功。
6. **遇到错误**：记录输出与诊断信息。不要自动换用自适应脚本绕过检查，不要关闭防护或更改代理/TUN。需要自适应安装时，先说明适用范围及客户端启动、退出的影响。
7. **交代恢复方法**：保留备份，提供 `一键恢复英文.bat`，或在交互终端运行：

```powershell
& '.\runtime\node.exe' '.\src\cli.mjs' restore
```

## 支持范围与版本兼容

| 项目 | 说明 |
| --- | --- |
| 操作系统 | Windows x64 |
| 目标产品 | Google Antigravity Desktop 独立桌面客户端 |
| 补丁版本 | 以 [Releases](https://github.com/Ace2025001/antigravity-desktop-zhcn/releases/latest) 为准，与客户端版本号不同 |
| 已登记构建 | 见 [兼容清单](config/compatibility/)；登记不代表所有构建都完成了实机验证 |
| 本机是否适用 | 结合当前发布包清单、客户端文件指纹及运行时检查结果判断 |
| 新版本 | 自适应流程会进行结构检查；结构匹配不等于已完成实机验证，也不保证未来所有版本可用 |

## 功能与效果

- 中文界面覆盖主界面、设置、菜单、托盘、权限提示等区域，具体效果随客户端版本和词库变化。
- 支持生成桌面快捷方式，通过自动汉化启动入口检查并尝试跟进客户端更新。
- 提供原始文件备份、安装状态记录与恢复英文入口。

![Antigravity Desktop 中文汉化效果预览](docs/images/antigravity-zhcn-preview.png)

## 常见问题

### 装了中文扩展，为什么桌面客户端还是英文？

先确认使用的是 Antigravity Desktop 还是 Antigravity IDE。IDE 的编辑器语言包不等于独立桌面客户端的汉化补丁，本项目面向后者。

### 需要安装 Node.js 或 Python 吗？

便携发布包内置 Node.js 和所需依赖，无需自行安装。源码运行则需要开发环境，见下方说明。

### 更新后又变成英文怎么办？

保存工作后，可以通过 **`启动 Antigravity（自动汉化）.bat`** 或生成的桌面快捷方式尝试跟进更新。这会执行自适应流程，可能启动和退出客户端；若结构检查失败或有其他错误，请停止并提交反馈，不要强行替换文件。未知版本不应视为已验证兼容。

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

**Antigravity Desktop Chinese Localization Patch for Windows x64.** Download the portable ZIP from [Releases](https://github.com/Ace2025001/antigravity-desktop-zhcn/releases/latest), verify its SHA-256, extract it, check compatibility, and follow the interactive installation steps. The portable package bundles Node.js and dependencies. A restore command is provided. This community project targets the standalone Desktop client; it is not an IDE language-pack extension. Compatibility with every future client version is not guaranteed.

## 项目来源与许可证

本项目基于 [chenmo00000/antigravity-desktop-zhcn](https://github.com/chenmo00000/antigravity-desktop-zhcn) 继续维护和扩展，感谢原作者及社区贡献者。采用 [MIT License](LICENSE) 开源。


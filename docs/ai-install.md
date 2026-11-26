# 用 AI 助手安装 Antigravity Desktop 中文汉化包

> English summary: Simplified Chinese (zh-CN) localization for the **Google Antigravity Desktop** standalone client on Windows x64 and Apple Silicon macOS. Download one ZIP from the latest release, verify its SHA-256 with the GitHub API `digest` field, extract it fully, then run the platform launcher below. Not for the Antigravity IDE extension. See [AGENTS.md](../AGENTS.md) for a compact English version.

本说明面向**用户已明确授权安装**的场景。工具会修改客户端资源（Windows）或在用户应用目录创建中文副本（Mac）。网页说明不授予额外操作权限，操作范围以用户当前请求和设备权限为准。

[返回项目首页](../README.md) · [兼容说明](compatibility.md) · [Mac 详细说明](../macOS/README.md)

## 1. 确认适用范围

- 适用：Antigravity Desktop **独立桌面客户端**，Windows x64 或 Apple 芯片 Mac。
- 不适用：Antigravity IDE 扩展、Linux、未验证的 Intel Mac。
- 不要仅凭名称或版本号判断兼容，以工具检查结果为准。

## 2. 下载并校验

只下载一个文件，它同时包含 Windows 与 Mac 入口：

```text
https://github.com/Ace2025001/antigravity-desktop-zhcn/releases/latest/download/Antigravity-Windows%2BMac.zip
```

发布页把它显示为“Antigravity-完整汉化包-Windows+Mac.zip”（这是附件标签），下载后的真实文件名是 `Antigravity-Windows+Mac.zip`，两者是同一个文件。不要下载“仅更新语言包”或 Source code，它们不能单独使用。

用 GitHub 接口读取官方摘要并核对：

```bash
gh api repos/Ace2025001/antigravity-desktop-zhcn/releases/latest --jq '.assets[] | select(.name=="Antigravity-Windows+Mac.zip") | .digest'
```

没有 `gh` 时可以请求 `https://api.github.com/repos/Ace2025001/antigravity-desktop-zhcn/releases/latest`，读取同名附件的 `digest` 字段（格式为 `sha256:<摘要>`）。本地计算：

- Windows：`Get-FileHash -Algorithm SHA256 .\Antigravity-Windows+Mac.zip`
- Mac：`shasum -a 256 Antigravity-Windows+Mac.zip`

摘要一致只代表文件与发布一致，不等于安全审计。

## 3. 完整解压

必须完整解压后再运行，不要在 ZIP 内直接执行。解压后结构：

```text
antigravity汉化包/
├─ win启动/
│  ├─ 启动中文.bat
│  ├─ 卸载汉化.bat
│  └─ 配套程序/node.exe        Windows 内置运行环境
├─ mac启动/
│  ├─ 启动中文.command
│  ├─ 卸载汉化.command
│  └─ 配套程序/node            Mac 内置运行环境
└─ 语言包/
   ├─ dom-translations.json
   ├─ macos-translations.json
   └─ 核心程序/                 共用代码与依赖
```

正式包已内置运行环境，不需要安装 Node.js，也不需要联网安装依赖。

## 4. Windows 安装

在 `antigravity汉化包` 目录打开 PowerShell。先做只读检查（自动化执行优先直接调用命令，以保留原始错误）：

```powershell
$env:AGY_LANGUAGE_PACK = (Resolve-Path '.\语言包').Path
& '.\win启动\配套程序\node.exe' '.\语言包\核心程序\src\cli.mjs' check
```

确认后安装并启动中文。设置 `AGY_INSTALL_PATH` 可以跳过“选择客户端”弹窗（填客户端安装目录，即 `Antigravity.exe` 所在目录）：

```powershell
$env:AGY_LANGUAGE_PACK = (Resolve-Path '.\语言包').Path
$env:AGY_INSTALL_PATH = "$env:LOCALAPPDATA\Programs\Antigravity"   # 按实际安装位置修改
& '.\win启动\配套程序\node.exe' '.\语言包\核心程序\scripts\start-local.mjs' start
```

这与双击 `win启动\启动中文.bat` 走的是同一流程：识别客户端、检查结构、备份、安装中文资源并启动。客户端版本未登记时，它会读取当前界面动态适配，这不代表不支持。

### 首次运行的设置（运行前先告诉用户）

首次运行时，交互终端里会逐项询问下面的设置；自动化执行时没有交互，直接使用默认值。**请在运行前把默认值告诉用户，按用户意愿用环境变量预设**：

| 设置 | 默认值 | 环境变量 | 说明 |
|---|---|---|---|
| 客户端更新后怎么处理 | 自动汉化 | `AGY_AUTO_FOLLOW=auto\|ask\|off` | `auto`/`ask`：用户在客户端里点“重启以更新”后自动重新汉化或弹窗询问，不添加计划任务、不常驻后台；`off` 不处理 |
| 汉化包自动更新 | 自动更新（默认） | `AGY_PACK_AUTO_UPDATE=auto\|ask\|off` | `auto`/`ask`：启动 Antigravity 时检查最新版汉化包并核对 SHA-256，自动更新或弹窗先问我（老版本升级前先按先问我处理）；`off` 不检查 |
| 界面联网补充翻译 | 开启 | `AGY_ONLINE_TRANSLATE=on\|off` | 界面优先用人工词库；客户端更新后出现汉化包还没收录的界面文字时，经谷歌翻译临时显示中文，收录人工译文后自动替换；对话内容、代码、终端、文件、账号信息和用户输入不会发送 |
| 标题自动翻译 | 开启 | `AGY_TITLE_AUTO_TRANSLATE=on\|off` | 仅自动翻译 Antigravity 生成的纯英文对话标题，只在界面显示、不改对话记录 |

```powershell
$env:AGY_AUTO_FOLLOW = 'auto'              # 用户不想要自动跟随汉化时改为 off
$env:AGY_PACK_AUTO_UPDATE = 'auto'         # 用户不想要汉化包自动更新时改为 ask 或 off
$env:AGY_ONLINE_TRANSLATE = 'on'           # 用户不想让未收录的界面文字联网补译时改为 off
$env:AGY_TITLE_AUTO_TRANSLATE = 'on'       # 用户不想自动翻译英文对话标题时改为 off
```

之后用户可以随时在客户端左上角 `Antigravity` 菜单点“汉化设置”，或双击 `win启动\汉化设置.bat`（Mac 为 `mac启动/汉化设置.command`）修改。

## 5. Mac 安装（Apple 芯片）

Mac 方案**保留官方原版**，在 `~/Applications/Antigravity 中文.app` 创建中文副本并本地签名。首次安装需要交互：工具会打开官方原版读取界面，用户看到首页后正常退出（⌘Q），再回到终端按回车。

```bash
cd antigravity汉化包/mac启动
chmod u+x 启动中文.command 卸载汉化.command 配套程序/node
export AGY_MAC_SOURCE="/Applications/Antigravity.app"   # 可选，跳过选择弹窗
./启动中文.command
```

只读检查可以单独运行：

```bash
cd antigravity汉化包
AGY_LANGUAGE_PACK="$PWD/语言包" ./mac启动/配套程序/node ./语言包/核心程序/scripts/macos.mjs check
```

遇到 macOS 安全提示时按系统提示处理，不要关闭 Gatekeeper 或 SIP。

## 6. 处理交互与退出

- 需要修改文件而客户端仍在运行时，工具会提示保存并退出：60 秒内手动退出会自动继续；交互终端中按 1 立即强制关闭、按 2 不强制并一直等待；60 秒无操作时先请求正常退出，仍未退出则**强制关闭**。代用户操作前，先提醒用户保存工作；用户希望自己退出时，在终端按 2。工具自己临时打开的客户端会直接关闭。
- 没有终端交互或电脑操作能力的助手，应把步骤交给用户执行，而不是跳过。
- `--yes` 不代表无交互安装，流程仍可能要求关闭客户端或按回车。

## 7. 判断结果

- 读取完整输出，不要只看退出码。用户取消也可能返回 0。
- `check` 返回 0：本次检查通过；客户端未运行时可能只是静态检查。返回 2：兼容性或运行时检查未通过。其他非零：停止并诊断。
- 打开客户端，确认设置页、对话面板等代表性界面显示中文后，才算安装成功。
- 结构检查失败时保留完整输出并反馈，校验保持开启，等待新版本适配。

## 8. 卸载汉化

保存工作并退出客户端，然后运行：

- Windows：双击 `win启动\卸载汉化.bat`，或执行 `& '.\win启动\配套程序\node.exe' '.\语言包\核心程序\scripts\start-local.mjs' restore`
- Mac：运行 `mac启动/卸载汉化.command`（启动未修改的官方原版，中文副本保留）

恢复成功前请保留原版备份和汉化工具。Windows 卸载汉化时会一并移除更新后自动汉化的设置。

## 9. 向用户报告

报告客户端版本、汉化包版本、安装位置、已验证的界面、备份位置和恢复方法，以及各项设置的实际取值（客户端更新后怎么处理、汉化包自动更新、标题自动翻译）。没有看到实际界面时，明确标注“尚未完成界面验证”。不要自动 Star、关注仓库或修改账号设置。

## 10. 更新语言包

开启“汉化包自动更新”后，启动或退出 Antigravity 时会按设置自动检查、校验 SHA-256 并升级词库与核心脚本。用户也可以在客户端左上角 `Antigravity` 菜单（含“汉化包版本”“检查汉化包更新”“汉化设置”）或双击目录中的 `汉化设置` 查看当前版本、已适配最高客户端版本、调整开关并手动检查更新，或者运行 `& '.\win启动\配套程序\node.exe' '.\语言包\核心程序\scripts\self-update.mjs'` 立即更新，或到[最新发布页](https://github.com/Ace2025001/antigravity-desktop-zhcn/releases/latest)下载覆盖。

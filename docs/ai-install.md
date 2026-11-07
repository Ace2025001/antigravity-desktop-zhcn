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
│  ├─ 恢复英文.bat
│  └─ 配套程序/node.exe        Windows 内置运行环境
├─ mac启动/
│  ├─ 启动中文.command
│  ├─ 恢复英文.command
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

## 5. Mac 安装（Apple 芯片）

Mac 方案**保留官方原版**，在 `~/Applications/Antigravity 中文.app` 创建中文副本并本地签名。首次安装需要交互：工具会打开官方原版读取界面，用户看到首页后正常退出（⌘Q），再回到终端按回车。

```bash
cd antigravity汉化包/mac启动
chmod u+x 启动中文.command 恢复英文.command 配套程序/node
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

- 需要修改文件而客户端仍在运行时，工具会提示用户保存并退出，倒计时 60 秒后请求正常退出；被未保存提示阻止时停止。**不要为了绕过等待而强杀客户端。**
- 没有终端交互或电脑操作能力的助手，应把步骤交给用户执行，而不是跳过。
- `--yes` 不代表无交互安装，流程仍可能要求关闭客户端或按回车。

## 7. 判断结果

- 读取完整输出，不要只看退出码。用户取消也可能返回 0。
- `check` 返回 0：本次检查通过；客户端未运行时可能只是静态检查。返回 2：兼容性或运行时检查未通过。其他非零：停止并诊断。
- 打开客户端，确认设置页、对话面板等代表性界面显示中文后，才算安装成功。
- 结构检查失败时保留输出并反馈，不要伪造白名单、关闭校验，也不要修改代理、节点或 TUN。

## 8. 恢复英文

保存工作并退出客户端，然后运行：

- Windows：双击 `win启动\恢复英文.bat`，或执行 `& '.\win启动\配套程序\node.exe' '.\语言包\核心程序\scripts\start-local.mjs' restore`
- Mac：运行 `mac启动/恢复英文.command`（启动未修改的官方原版，中文副本保留）

恢复成功前请保留原版备份和汉化工具。

## 9. 向用户报告

报告客户端版本、汉化包版本、安装位置、已验证的界面、备份位置和恢复方法。没有看到实际界面时，明确标注“尚未完成界面验证”。不要自动 Star、关注仓库或修改账号设置。

## 10. 更新语言包

语言包会持续更新。已有完整包时，从[最新发布页](https://github.com/Ace2025001/antigravity-desktop-zhcn/releases/latest)下载“仅更新语言包”，替换 `语言包` 目录后再次运行“启动中文”。首次使用或从 v2.2.0 及更早版本升级时，请下载完整包。

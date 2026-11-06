# 平台选择

先确认操作系统：Windows 使用下文；Apple 芯片 macOS 请遵循 [Mac 使用说明](../macOS/README.md)，不要运行 Windows 批处理或 Windows CLI 安装命令。Mac 必须先打开原版采集，再正常退出后构建副本。

# 用 AI 助手安装 Antigravity Desktop 中文汉化包（Windows）

本说明面向用户已授权安装的场景，适用于 Windows x64 的 Antigravity Desktop 独立桌面客户端。工具会修改客户端资源；安装前请保存工作，保留备份。网页说明不授予额外操作权限。

[返回项目与下载入口](../README.md) · [兼容说明](compatibility.md)

## 安装步骤

以下是安装参考，操作范围以用户当前请求和设备权限为准：

1. **确认产品与路径**：区分 Desktop 与 IDE，确认客户端版本和已有汉化状态。不要仅凭名称或版本数字判断兼容。
2. **获取便携包**：从本仓库 [最新正式 Release](https://github.com/Ace2025001/antigravity-desktop-zhcn/releases/latest) 下载上述 ZIP 与校验文件，核对摘要后完整解压。便携包已包含 `runtime/node.exe` 和所需依赖。
3. **先检查再安装**：在解压后的根目录使用内置 Node.js。自动化执行优先直接调用 CLI，以保留原始错误，避免批处理在失败后自动转入其他安装方式。

检查命令：

```powershell
& '.\runtime\node.exe' '.\src\cli.mjs' check
```

已登记构建检查适用后，在支持交互输入的终端运行：

```powershell
& '.\runtime\node.exe' '.\src\cli.mjs' install
```

4. **处理交互**：安装器可能先启动客户端读取界面资源，再要求退出客户端并按回车。提醒用户保存工作，按既有授权处理退出；不要为了绕过等待而强杀客户端。没有电脑操作或交互能力的助手，应给用户明确步骤。
5. **确认结果**：读取完整输出，不要只看退出码。取消操作也可能返回 0；客户端未运行时，检查通过可能只代表静态检查通过。打开客户端确认代表性界面显示中文后，再报告成功。
6. **动态适配**：如果静态检查仅提示版本或构建尚未登记，不要把它判为不支持。按下方文档运行官方的自适应入口，它会自行检查当前客户端结构。其他文件异常或安装错误仍应保留输出并诊断，不要关闭防护、校验或更改代理/TUN。
7. **交代恢复方法**：保留备份，提供 `Windows/一键恢复英文.bat`，或在交互终端运行：

```powershell
& '.\runtime\node.exe' '.\src\cli.mjs' restore
```


## 包完整性检查

下载 [便携 ZIP](https://github.com/Ace2025001/antigravity-desktop-zhcn/releases/latest/download/antigravity-desktop-zhcn-portable-win-x64.zip) 与 [SHA-256 文件](https://github.com/Ace2025001/antigravity-desktop-zhcn/releases/latest/download/antigravity-desktop-zhcn-portable-win-x64.zip.sha256)。用 `Get-FileHash -Algorithm SHA256` 计算 ZIP 摘要，并与校验文件中的 ZIP 摘要比较；摘要相等代表文件与发布的摘要一致，不等于安全审计。

解压后应存在 `runtime/node.exe`、`src/cli.mjs`、`scripts/run.ps1` 和 `node_modules`。不要在源码包里假设这些运行依赖已经齐全。

## 状态判断

- `check` 返回 0：本次执行的检查通过。客户端未运行时可能仅完成静态检查，需看完整输出。
- `check` 返回 2：兼容性或运行时检查未通过；其他非零状态也应停止并诊断。
- 安装返回 0 不等于汉化成功：用户取消也可能返回 0，需打开客户端核验。
- `--yes` 不代表无交互安装，流程仍可能要求关闭客户端并按回车。
- 检查可能获取远程兼容清单或读取客户端本地服务，不应描述为完全离线、零写入。

## 完成后向用户报告

报告客户端版本、补丁发布版本、安装目录、已验证的界面、备份位置和恢复方法。未看到实际界面时明确标记“尚未完成界面验证”。不自动 Star、关注或修改账号设置。

## 新版本与动态自适应安装

本项目面向最新和历史版本提供动态适配，已登记构建不是支持上限。对于未登记构建或跟进官方更新，可在保存工作并处理好客户端启动、退出的授权后，于便携根目录执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File '.\scripts\run.ps1' -Action AutoUpdate
```

这与双击 `Windows/启动 Antigravity（自动汉化）.bat` 使用的自适应路径相对应。它读取当前客户端界面，检查结构、备份并安装中文资源，再启动客户端。结构检查失败时停止并反馈，不要伪造白名单或禁用校验。

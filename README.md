# Antigravity Desktop 汉化包｜Windows / Mac 简体中文语言包

为 Google Antigravity Desktop 独立桌面客户端提供简体中文汉化语言包。Windows x64 与 Apple 芯片 Mac 共用一份语言包，完整包可离线运行，支持自动识别安装位置、自动汉化快捷方式和恢复英文。适用于独立桌面客户端（不适用于 Antigravity IDE 扩展）。

[下载与安装教程](https://ace2025001.github.io/antigravity-desktop-zhcn/) · [Windows 汉化教程](https://ace2025001.github.io/antigravity-desktop-zhcn/windows/) · [Mac 汉化教程](https://ace2025001.github.io/antigravity-desktop-zhcn/macos/) · [English](README.en.md)

## 下载与使用

### [⬇ 下载完整汉化包（Windows + Mac）](https://github.com/Ace2025001/antigravity-desktop-zhcn/releases/latest/download/Antigravity-Windows%2BMac.zip)

**普通用户只下载 `Antigravity-完整汉化包-Windows+Mac.zip`。** 不用下载绿色 Code 或 Source code。

下载后右键“全部解压缩”，再打开对应系统的文件夹，双击“启动中文”。不要直接在压缩包里面运行。解压后目录如下：

```text
antigravity汉化包/
├─ win启动/
│  ├─ 启动中文.bat
│  ├─ 恢复英文.bat
│  └─ 配套程序/
├─ mac启动/
│  ├─ 启动中文.command
│  ├─ 恢复英文.command
│  └─ 配套程序/
└─ 语言包/
   ├─ 使用说明.txt
   ├─ dom-translations.json
   └─ 核心程序/
```

- **Windows x64**：解压后打开 `win启动` 文件夹，双击运行 **`启动中文.bat`**。
- **Apple 芯片 Mac**：解压后打开 `mac启动` 文件夹，双击运行 **`启动中文.command`**（首次运行按提示输入密码并允许终端权限即可）。
- **恢复原版英文**：双击对应文件夹里的 **`恢复英文.bat`** 或 **`恢复英文.command`** 即可瞬间复原。

---

### [⬇ 仅更新语言包（老用户替换用）](https://github.com/Ace2025001/antigravity-desktop-zhcn/releases/latest/download/Language-Update-Only.zip)

已经下载过完整汉化包、只想更新翻译词库的用户，下载 `仅更新语言包-不能单独使用.zip`，解压后覆盖替换掉 `antigravity汉化包/语言包` 目录即可，无需重新下载几十兆的完整包。

---

## 包含内容与技术亮点

- **全量汉化词库**：全面覆盖界面菜单、模型配额与用量、设置项、上下文右键菜单、扩展插件市场详情页与文档说明。
- **双端无缝支持**：Windows x64 与 Apple Silicon macOS 开箱即用，无需配置 Python 或 Node.js 环境。
- **热重载与安全保障**：运行时动态注入汉化资源，不破坏官方客户端文件完整性，支持一键无痕恢复官方英文原版。

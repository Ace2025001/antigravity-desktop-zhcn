# Antigravity Desktop 中文汉化补丁
### Google Antigravity Desktop Chinese Localization Patch

[![Release Version](https://img.shields.io/badge/Release-v1.5.0-blue.svg)](https://github.com/Ace2025001/antigravity-desktop-zhcn/releases)
[![Client Compatibility](https://img.shields.io/badge/Antigravity-2.2.1~2.23.0+-green.svg)](https://github.com/Ace2025001/antigravity-desktop-zhcn)
[![Rules Count](https://img.shields.io/badge/Dictionary-2431%20Exact%20%2B%20371%20Patterns-orange.svg)](config/dom-translations.json)
[![Automated Tests](https://img.shields.io/badge/Tests-75%20Passed-brightgreen.svg)](tests/)
[![Platform](https://img.shields.io/badge/Platform-Windows%20x64-lightgrey.svg)](https://github.com/Ace2025001/antigravity-desktop-zhcn)
[![License](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)

专为 Windows 平台 Google Antigravity Desktop 打造的高性能、安全无损中文本地化增强补丁。

**核心特性**：内置 **2431 条精确词条映射 + 371 条动态正则规则**，覆盖全界面、设置面板、系统托盘、原生右键菜单、智能体权限弹窗及交互提示。支持**客户端自动跟进更新**、**温和退出落盘保护**、**一键生成桌面快捷方式**与**百分百无损还原官方英文**。

---

## 🔍 关键词 / Keywords & Topics

- **中文搜索**：`Antigravity 中文`、`Antigravity 汉化`、`Antigravity 汉化包`、`Google Antigravity 汉化`、`Antigravity 桌面版汉化补丁`、`Antigravity 中文语言包`、`Antigravity 自动汉化`
- **English Keywords**: `Antigravity Chinese Localization`, `Antigravity Desktop zh-CN`, `Google Antigravity Chinese Patch`, `Antigravity i18n`, `Antigravity Hans`, `Antigravity Desktop Translation`
- **GitHub Topics**: `antigravity`, `antigravity-desktop`, `antigravity-chinese`, `chinese-localization`, `zh-cn`, `electron-localization`, `i18n`, `desktop-app`, `windows`, `google-antigravity`

---

## 🌐 English Quick Start / Bilingual Summary

> **Google Antigravity Desktop Chinese Localization Patch** provides a seamless, non-destructive Chinese UI for Antigravity Desktop on Windows.

- **Non-destructive & Safe**: Automatic SHA-256 fingerprint verification and original binary backup before any injection.
- **Auto-follow Updates**: Start via `启动 Antigravity（自动汉化）.bat` or desktop shortcut to automatically adapt when Antigravity auto-updates.
- **Graceful Termination**: Ensures pending editor changes and project state are cleanly flushed to disk before patch execution.
- **Zero Configuration**: Release portable archive bundles an isolated official Node.js runtime—no system dependencies needed.

### Quick Usage:
1. Download the latest `antigravity-desktop-zhcn-portable-win-x64.zip` from [Releases](https://github.com/Ace2025001/antigravity-desktop-zhcn/releases/latest).
2. Extract all files into any local directory.
3. Run **`一键检查兼容性.bat`** to verify compatibility with your installed client.
4. Run **`一键汉化.bat`** to apply the patch, then restart Antigravity.
5. (Optional) Run **`生成桌面快捷方式.bat`** to place an auto-updating Chinese launch shortcut directly on your Windows desktop!
6. To restore pure official English at any time, simply run **`一键恢复英文.bat`**.

---

## 📸 效果预览 / Screenshots

### 1. Antigravity 设置页面汉化效果
![Antigravity 设置页面汉化效果](docs/images/antigravity-zhcn-settings.png)

### 2. Antigravity 主界面汉化效果
![Antigravity 主界面汉化效果](docs/images/antigravity-zhcn-main.png)

---

## 📊 版本兼容矩阵 / Compatibility Matrix

本项目采用严格的白名单指纹与语法树结构检测机制。目前已收录适配 21 个目标构建版本：

| 客户端版本 / Client Version | 内部构建目标 / Build Target | 指纹校验 / SHA-256 Fingerprint | 验证级别 / Verification Status | 自动跟进适配 / Auto Follow |
| :--- | :--- | :--- | :--- | :--- |
| **Antigravity 2.23.0** | `2.23.0-full` | 白名单已收录 (`config/compatibility-trust.json`) | 自动化测试通过（75 项单测绿标） | ✅ 支持自适应提取与校验 |
| **Antigravity 2.20.0** | `2.20.0-full` | 白名单已收录 | 实机运行验证通过 | ✅ 支持 |
| **Antigravity 2.17.0** | `2.17.0-full` | 白名单已收录 | 实机运行验证通过 | ✅ 支持 |
| **Antigravity 2.16.0** | `2.16.0-full` | 白名单已收录 | 实机运行验证通过 | ✅ 支持 |
| **Antigravity 2.15.1** | `2.15.1-full` | 白名单已收录 | 实机运行验证通过 | ✅ 支持 |
| **Antigravity 2.14.0** | `2.14.0-full` | 白名单已收录 | 实机运行验证通过 | ✅ 支持 |
| **Antigravity 2.11.0 ~ 2.13.0** | 早期各构建版本 | 白名单已收录 | 实机运行验证通过 | ✅ 支持 |
| **Antigravity 2.2.1 ~ 2.10.0** | 早期各构建版本 | 白名单已收录 | 实机运行验证通过 | ✅ 支持 |

> [!NOTE]
> **关于 2.23.0 验证说明**：针对 Antigravity Desktop 2.23.0，项目已完成构建语法树分析、词条提取录入与 75 项自动化单元测试验证。为确保严谨性，未在多台真实桌面设备经过完整日常会话验证的新版本均标注为“自动化测试通过”，欢迎社区用户反馈实测体验！

---

## 🏆 竞品对标与功能亮点 / Feature Comparison

全面调研 GitHub 社区各类 Antigravity 汉化方案（如 `yuexps/Antigravity-Hans`、`MIMICTE/Antigravity-zh-CN`、`cshitian/antigravity_chinese` 等），本项目在多项关键指标上实现领先：

| 对比维度 / Feature | 本项目 (Ace2025001) | 竞品 A (静态文件替换类) | 竞品 B (简单注入类) | 优势说明 |
| :--- | :--- | :--- | :--- | :--- |
| **汉化覆盖规模** | **2431 词条 + 371 正则** | 约 500 ~ 1200 词条 | 约 800 ~ 1500 词条 | 业内最全词库，全量覆盖欢迎引导、模型配额、设置和原生托盘 |
| **客户端自动升级跟进** | **原生自适应更新注入** | ❌ 升级即失效需重新下载 | ⚠️ 需手动重新覆盖 | 支持启动自适应跟进，客户端静默升级也能保持中文 |
| **客户端退出安全性** | **温和退出 + 超时兜底** | ❌ 强制杀进程 (`taskkill /F`) | ❌ 强制杀进程 | 先请求优雅关闭等待数据落盘，避免破坏工作区与未保存文件 |
| **桌面使用便捷度** | **一键生成桌面快捷方式** | ❌ 需每次进文件夹点击 | ❌ 需手动创建快捷方式 | 双击 `生成桌面快捷方式.bat` 即可生成一键汉化启动图标 |
| **安全与指纹机制** | **SHA-256 + 语法树结构校验** | ❌ 无指纹校验，容易损坏 | ⚠️ 仅匹配版本号文本 | 白名单防呆拦截，杜绝未知破坏性篡改 |
| **无损还原英文** | **原子备份与一键原样恢复** | ⚠️ 需手动备份或重装客户端 | ⚠️ 部分遗留残留文件 | 提供 `一键恢复英文.bat`，随时无损回到纯净官方英文 |
| **测试与质量保障** | **75 项自动化回归测试套件** | ❌ 无自动化测试 | ❌ 无自动化测试 | 覆盖词库冲突、正则防误伤、注入逆向、网络签名与模型隔离 |

---

## 🚀 快速使用指南 / Quick Start Guide

### 推荐方式：下载 Release 便携包（普通用户首选）
便携发布包已内置官方独立的 Node.js 运行时与锁定依赖，**用户电脑无需安装任何开发环境**。

1. **下载解压**：进入 [Releases 发布页面](https://github.com/Ace2025001/antigravity-desktop-zhcn/releases/latest)，下载最新的 `antigravity-desktop-zhcn-portable-win-x64.zip` 并解压到任意文件夹；
2. **检查兼容性（推荐）**：双击运行 **`一键检查兼容性.bat`**，确认当前安装的 Antigravity 是否在受支持列表内；
3. **应用汉化**：双击运行 **`一键汉化.bat`**，按屏幕提示完成安装；
4. **生成桌面快捷方式（强烈推荐）**：双击运行 **`生成桌面快捷方式.bat`**，会在您的 Windows 桌面上创建名为 **`Antigravity (中文自动汉化)`** 的快捷方式；
5. **日常启动**：以后只需从桌面快捷方式或文件夹中的 **`启动 Antigravity（自动汉化）.bat`** 打开即可！

---

## 🔄 客户端更新与自适应机制

当 Google Antigravity 官方在后台自动升级到新版本后：
1. **自动更新体验**：只要您通过 `启动 Antigravity（自动汉化）` 启动，补丁工具会自动识别客户端更新，对新版本执行结构安全检查、重新备份并自动注入汉化，随后启动客户端；
2. **温和落盘保护**：退出旧实例时采用两段式温和退出，确保编辑进度和会话落盘保存；
3. **防呆兜底**：若 Google 进行了重构导致代码锚点失效，工具会安全停止并保留官方文件，杜绝损坏客户端。若已打开客户端显示为英文，也可直接双击 **`自动跟进更新.bat`** 重新补丁。

---

## 🔙 恢复官方纯净英文

如果您需要排查官方原版问题或卸载汉化：
1. 双击运行目录下的 **`一键恢复英文.bat`**；
2. 脚本会自动安全清理汉化注入文件，并从初始备份中完整还原原版 `app.asar`；
3. 重启 Antigravity Desktop 即可完全恢复官方英文状态。

---

## 💻 开发者使用指南 / Developer Guide

若您希望参与贡献或从源码运行：
- **运行环境**：需要本地安装 **Node.js >= 22.12.0** 与 **npm**；
- **安装依赖**：在项目根目录运行 `npm ci`；
- **运行验证**：
  ```powershell
  # 运行项目结构与文件规则检查
  node scripts/validate-project.mjs

  # 运行自动化单元测试套件
  node --test
  ```
- **构建便携包**：
  ```powershell
  powershell -ExecutionPolicy Bypass -File scripts/build-portable.ps1
  ```

更多开发架构与维护文档请参考：
- [系统架构设计 (Architecture)](docs/architecture.md)
- [版本维护与适配指南 (Maintenance)](docs/maintenance.md)
- [Release 构建与发布流程 (Releasing)](docs/releasing.md)
- [社区贡献指南 (Contributing)](CONTRIBUTING.md)

---

## 📜 项目来源与开源致谢

本项目是在社区优秀开源项目 [chenmo00000/antigravity-desktop-zhcn](https://github.com/chenmo00000/antigravity-desktop-zhcn) 的基础上进行长期维护、深度架构重构与持续扩充，采用 [MIT License](LICENSE) 协议开源。由衷感谢原作者及社区早期贡献者的开源付出。

欢迎通过 [GitHub Issues](https://github.com/Ace2025001/antigravity-desktop-zhcn/issues) 提交反馈，或发起 [Pull Requests](https://github.com/Ace2025001/antigravity-desktop-zhcn/pulls) 参与维护！

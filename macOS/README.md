# macOS 平台一键脚本入口

本目录归档了适用于 **macOS（Apple Silicon `darwin-arm64` 与 Intel `darwin-x64`）** 平台的全部快捷启动器（`.command`），与项目根目录下的跨平台核心汉化引擎（`src/`）及共享词典（`config/dom-translations.json`）配合使用。

## 常用入口说明

| 脚本名称 | 作用说明 |
| --- | --- |
| `一键汉化.command` | 引导式安装简体中文补丁（若未登记指纹会自动回退至自适应汉化） |
| `启动 Antigravity（自动汉化）.command` | 动态自适应汉化并启动客户端（推荐客户端更新后使用） |
| `生成桌面快捷方式.command` | 在桌面创建自动汉化启动快捷方式 |
| `一键检查兼容性.command` | 检查本机客户端版本、ASAR 指纹与兼容状态 |
| `一键恢复英文.command` | 从原始备份恢复官方英文原版客户端 |
| `自动跟进更新.command` | 手动触发自适应跟进客户端更新流程 |
| `生成汉化预览.command` | 仅在 `.runtime/` 下生成汉化产物供预览，不修改客户端文件 |
| `清理缓存.command` | 安全清理汉化工具生成的临时缓存与过期备份 |
| `完全卸载.command` | 恢复官方原版并彻底清除所有本地汉化产物、备份与配置 |

## 使用方式

1. 完整解压/下载本项目到本地目录（不要在只读镜像卷中直接运行）。
2. 在 Finder 中打开 `macOS/` 目录，直接双击需要的 `.command` 文件即可运行。
3. 若首次在 macOS 运行双击提示权限问题，可在终端执行：
   ```bash
   chmod +x macOS/*.command scripts/*.sh
   ```
4. 安装完成后，脚本会自动处理 Electron 完整性校验与本机 ad-hoc 重签名，客户端可直接无缝启动。

## 跨平台共享架构约定

为了避免双份维护词典与核心逻辑，macOS 版本与 Windows 版本共用根目录下的核心资产：

1. **共享汉化词典**：[`config/dom-translations.json`](../config/dom-translations.json)（精确词条与动态正则规则全平台通用）
2. **共享汉化引擎**：[`src/lib/translator.mjs`](../src/lib/translator.mjs)、[`src/lib/patcher.mjs`](../src/lib/patcher.mjs)
3. **兼容性指纹分片**：在 `config/compatibility/<版本号>/` 下按 `<platform>-<arch>.json`（例如 `darwin-arm64.json`）存放
4. **共享启动驱动**：`scripts/run.sh` 对应 Windows 上的 `scripts/run.ps1`，负责环境检查、依赖安装及自适应调度。

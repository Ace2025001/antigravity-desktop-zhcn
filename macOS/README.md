# macOS 平台入口目录（预留给 macOS PR）

本目录用于存放 **macOS（Apple Silicon `darwin-arm64` / Intel `darwin-x64`）** 平台的专属快捷启动脚本（如 `.command` 或 `.sh`）及平台辅助说明。

## 跨平台共享架构约定

为了避免双份维护词典与核心逻辑，macOS 版本与 Windows 版本共用根目录下的核心资产：

1. **共享汉化词典**：[`config/dom-translations.json`](../config/dom-translations.json)（精确词条与动态正则规则全平台通用）
2. **共享汉化引擎**：[`src/lib/translator.mjs`](../src/lib/translator.mjs)、[`src/lib/patcher.mjs`](../src/lib/patcher.mjs)
3. **兼容性指纹分片**：在 `config/compatibility/<版本号>/` 下按 `<platform>-<arch>.json`（例如 `darwin-arm64.json`）存放
4. **macOS 专属入口**：请将 macOS 用户双击运行的 `.command` / `.sh` 脚本放置于本 `macOS/` 目录下，并通过相对路径调用根目录的 `src/cli.mjs` 或 `scripts/`。

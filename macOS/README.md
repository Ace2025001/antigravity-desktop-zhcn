# macOS 使用说明

支持 Apple 芯片 Mac 的 Antigravity Desktop 独立桌面客户端。朋友提供的补充包记录了 macOS 27.0.1、arm64、客户端 2.29.0 的实机验证；合并后的版本仍需 Mac 实机复验。Intel Mac 暂不作为已验证支持平台。

## 安装

普通用户完整解压 Mac 便携包后，双击**mac启动/启动中文.command**，按中文提示操作。工具会自动检查、打开官方应用、准备界面、安装并启动中文副本。只需在看到首页及正常退出应用后按提示回车，无需分别运行检查和采集脚本。

日常双击**mac启动/启动中文.command**；恢复时双击 **恢复英文.command**。官方更新后重新运行“安装中文”。

源码运行需 Node.js >= 22.12.0，并在根目录运行 npm ci --ignore-scripts。源码仍保留本目录的高级入口；正式包内实现位于 语言包/核心程序。

源码下载可能不保留执行权限，可在仓库根目录运行 `chmod +x macOS/*.command scripts/*.sh`，也可用 `bash macOS/一键检查兼容性.command` 执行入口。遇到 macOS 安全提示时按系统提示处理，不要关闭 Gatekeeper 或 SIP。

## 更新与恢复

官方更新后，重新运行mac启动/启动中文.command。缓存必须匹配当前官方资源指纹，结构或签名检查失败时停止操作。

`macOS/验证中文安装.command` 检查中文副本、界面文件、ASAR 内嵌完整性与本地签名。恢复英文前保存工作并退出中文版，再运行 `macOS/恢复英文.command`；此入口启动官方原版，不删除中文副本或用户资料。

## 工作方式

- 保留官方原版，在个人应用目录生成独立中文副本；副本采用本地临时签名，保留原权限声明与运行时标志。
- 原版和中文版共用用户资料，请勿同时运行。工具不会强制结束客户端。
- 状态及原始 UI 缓存：`~/Library/Application Support/AntigravityZhcnMac`。
- 中文 UI：`~/Library/Application Support/Antigravity/agy_zhcn_ui_main.js`。
- 构建失败会尝试回退，更新时保留上一版副本。不要删除恢复所需状态。
- Mac 菜单的更新动作保留英文，以维持原有操作。
- 不修改系统代理、节点、TUN 或模型配置。

## 构建

在 Apple 芯片 Mac 上执行 `npm run build:mac`。需 Node.js >= 22.12.0 和 npm；脚本校验官方 Node.js 下载的 SHA-256，打包运行环境与锁定依赖，输出 ZIP 及摘要到 `.runtime/release`。

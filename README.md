# Antigravity 汉化包：Windows / macOS

Windows x64 与 Apple 芯片 Mac 共用一份中文语言包。

## 下载与使用

在 [最新发布页](https://github.com/Ace2025001/antigravity-desktop-zhcn/releases/latest) 下载 **antigravity-zhcn-universal.zip**，完整解压：

```text
antigravity汉化包/
├─ win入口/
│  ├─ 启动中文.bat
│  └─ 恢复英文.bat
├─ mac入口/
│  ├─ 启动中文.command
│  └─ 恢复英文.command
└─ 语言包/
   ├─ dom-translations.json
   ├─ macos-translations.json
   └─ 使用说明.txt
```

**Windows 打开 win入口，Mac 打开 mac入口，然后双击“启动中文”。**

- 首次使用：按中文提示完成安装并启动。
- 已经安装：检查通过后直接启动。
- 语言包或客户端更新：检测变化后重新应用中文，再启动。
- 恢复英文：保存工作并退出应用，再双击“恢复英文”。

运行环境位于入口目录的隐藏 `.程序` 文件夹，不要删除。正式包内置运行环境，无需安装 Node.js。Mac 首次安装需要按提示等待原版首页显示、保存工作并按 ⌘Q 退出，不会强制关闭任务。

## 以后如何更新翻译？

下载 **antigravity-zhcn-language.zip**，将其中的“语言包”替换到原目录，然后再次运行“启动中文”。Windows 与 Mac 读取同一份词库，不必分别更新。

只有客户端底层结构、签名要求或执行器逻辑发生变化时，才需要下载完整包。更新词库不等于兼容所有新旧客户端版本。

## 支持范围

- 适用于 Antigravity Desktop 独立桌面客户端，不是 Antigravity IDE 扩展语言包。
- Windows x64：原有备份、恢复与动态适配流程。
- macOS Apple 芯片：保留官方原版，创建独立中文应用副本，使用本地签名。
- Mac 补充包作者记录实测 macOS 27.0.1 / Desktop 2.29.0 / arm64。合并后的完整流程仍待真实客户端实机复验；Intel Mac 未验证。
- 两端均须通过结构和资源检查；不承诺兼容所有新旧版本。不修改代理、节点或 TUN。

![汉化预览](docs/images/antigravity-zhcn-preview.png)

## 开发与高级说明

此仓库是源码目录，日常使用请下载正式包。源码需要 Node.js >= 22.12.0，执行 `npm ci --ignore-scripts`、`npm test` 和 `npm run validate`。

- [Mac 高级说明](macOS/README.md)
- [构建与发布](docs/releasing.md)
- [系统架构](docs/architecture.md)
- [问题反馈](https://github.com/Ace2025001/antigravity-desktop-zhcn/issues)

基于 [chenmo00000/antigravity-desktop-zhcn](https://github.com/chenmo00000/antigravity-desktop-zhcn) 维护扩展，采用 [MIT License](LICENSE)，与 Google 无隶属关系。

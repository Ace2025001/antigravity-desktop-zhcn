# 构建与发布

Node.js >= 22.12.0；先运行 `npm ci --ignore-scripts`、`npm test` 和 `npm run validate`。

发布工作流按以下顺序执行：

1. Windows 构建内置运行环境的中间包。
2. Mac 构建中间包，下载 Windows 构建产物。
3. `scripts/assemble-universal.mjs` 将源码执行器、两端运行环境和依赖整理为 `antigravity汉化包/{win启动,mac启动,语言包}`。每端包含启动中文、恢复英文和配套程序；共用实现只放在语言包/核心程序。
4. Mac 验证运行环境和共享词库，生成统一 ZIP、独立语言包 ZIP 与 SHA-256。
5. Windows 解压最终统一包，再次验证目录、Windows 运行环境和共享词库。
6. 两端通过后，在标签发布中公开两个 ZIP 和校验文件。手动运行工作流仅生成构建产物。

高级手动组装命令：

```text
node scripts/assemble-universal.mjs <Windows中间包目录> <Mac中间包目录> <尚不存在的输出目录>
node scripts/verify-universal.mjs <输出目录>
```

语言包通过入口设置的 `AGY_LANGUAGE_PACK` 定位，不受启动时的工作目录影响。执行器对语言文件与核心代码计算指纹，识别是否需重新应用。源码运行默认使用 config 中的词库。

语言更新只能修改翻译内容；执行器或客户端结构变化需发布完整包。自动化测试不替代真实 Mac 客户端的安装、启动和恢复验收。

## 本地使用包与源码

日常包不依赖源码目录。发布组装使用 launchers 中的入口模板，把共用源码和锁定依赖只放入 语言包/核心程序，Windows 和 Mac 的运行文件分别放入 win启动/配套程序、mac启动/配套程序。运行时不会下载依赖。
桌面快捷方式、已选择路径、安装状态与用户客户端缓存均不得进入发布包或 Git。快捷方式仅在成功启动后创建，并只在缺失或目标变化时写入。

提交前需要运行 npm test、npm run validate，并在两端验证 scripts/verify-universal.mjs。Windows 本机通过不代表 Mac 系统交互、签名、恢复和桌面权限已实机验证。

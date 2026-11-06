# 构建与发布

Node.js >= 22.12.0；先运行 `npm ci --ignore-scripts`、`npm test` 和 `npm run validate`。

发布工作流按以下顺序执行：

1. Windows 构建内置运行环境的中间包。
2. Mac 构建中间包，下载 Windows 构建产物。
3. `scripts/assemble-universal.mjs` 将源码执行器、两端运行环境和依赖整理为 `antigravity汉化包/{win入口,mac入口,语言包}`。每个入口仅显示启动中文和恢复英文，程序文件放在隐藏 `.程序` 内。
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

# Antigravity Desktop Chinese Localization

An MIT-licensed Simplified Chinese language pack for Google Antigravity Desktop on Windows x64 and Apple Silicon macOS. Includes offline runtimes, installation discovery, localization checks and English restoration. This project targets the standalone Desktop client, not an IDE extension.

[Download and setup guides (Chinese)](https://ace2025001.github.io/antigravity-desktop-zhcn/) · [中文说明](README.md)

Download `Antigravity-完整汉化包-Windows+Mac.zip` from [Releases](https://github.com/Ace2025001/antigravity-desktop-zhcn/releases/latest).
Extract it, open `win启动` on Windows x64 or `mac启动` on Apple Silicon macOS, and run `启动中文` (Start Chinese). It installs when needed, reapplies changed translations, or launches an existing verified installation. Use `恢复英文` to restore English.

Both platforms share the `语言包` directory. For translation-only updates, download `仅更新语言包-不能单独使用.zip` and replace that directory. Keep the shared implementation in `语言包/核心程序` and each platform runtime in its `配套程序` folder.

Mac retains the official app and creates a locally signed Chinese copy. The contributor tested Desktop 2.29.0 on macOS 27.0.1 arm64. The merged flow still needs real-client verification; Intel Macs are not verified. Structural checks apply to every client version. No proxy, node or TUN settings are changed.

See the [Chinese README](README.md) for details. MIT licensed.

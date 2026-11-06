# Antigravity Desktop Chinese Localization

Download `antigravity-zhcn-universal.zip` from [Releases](https://github.com/Ace2025001/antigravity-desktop-zhcn/releases/latest).
Extract it, open `win入口` on Windows x64 or `mac入口` on Apple Silicon macOS, and run `启动中文` (Start Chinese). It installs when needed, reapplies changed translations, or launches an existing verified installation. Use `恢复英文` to restore English.

Both platforms share the `语言包` directory. For translation-only updates, download `antigravity-zhcn-language.zip` and replace that directory. Keep the hidden `.程序` directory inside each platform folder; it contains the runtime and implementation.

Mac retains the official app and creates a locally signed Chinese copy. The contributor tested Desktop 2.29.0 on macOS 27.0.1 arm64. The merged flow still needs real-client verification; Intel Macs are not verified. Structural checks apply to every client version. No proxy, node or TUN settings are changed.

See the [Chinese README](README.md) for details. MIT licensed, based on chenmo00000/antigravity-desktop-zhcn.

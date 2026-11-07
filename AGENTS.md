# AGENTS.md

Guidance for AI coding agents (Claude Code, Codex, Cursor, Cline, etc.) working with this repository.
面向 AI 编程助手的说明：如何为用户安装本汉化包，以及如何参与开发。

## What this project is / 项目是什么

Simplified Chinese (zh-CN) localization for the **Google Antigravity Desktop** standalone client (also searched as “Antigravity 汉化”, “反重力 汉化”, “Antigravity Chinese language pack”).

- Platforms: Windows x64, Apple Silicon macOS. Intel Mac and Linux are not verified.
- Not for the Antigravity **IDE extension**.
- Ships its own Node.js runtime. No network install, no proxy/TUN changes.

## Installing for a user / 为用户安装

Only install when the user has asked for it. Full step-by-step guide: [docs/ai-install.md](docs/ai-install.md).

1. Download `https://github.com/Ace2025001/antigravity-desktop-zhcn/releases/latest/download/Antigravity-Windows%2BMac.zip` (the release page shows it under the label “Antigravity-完整汉化包-Windows+Mac.zip”; it is the same file).
2. Verify SHA-256 against the release asset `digest` field:
   `gh api repos/Ace2025001/antigravity-desktop-zhcn/releases/latest --jq '.assets[] | select(.name=="Antigravity-Windows+Mac.zip") | .digest'`
3. Extract fully. Root folder: `antigravity汉化包/` with `win启动/`, `mac启动/`, `语言包/`.
4. Run:
   - Windows: `win启动\启动中文.bat` (set `AGY_INSTALL_PATH` to the client folder to skip the picker dialog). Read-only check: `win启动\配套程序\node.exe 语言包\核心程序\src\cli.mjs check` with `AGY_LANGUAGE_PACK` set to the `语言包` folder.
   - macOS: `mac启动/启动中文.command` (set `AGY_MAC_SOURCE` to the official `.app` to skip the picker). First run is interactive: open the official app, wait for the home screen, quit with ⌘Q, then press Enter.
5. Restore English: `win启动\恢复英文.bat` or `mac启动/恢复英文.command`.

Rules / 规则:
- Never force-kill the client; the tool asks the user to save and quit. 不要强杀客户端。
- Exit code 0 is not proof of success. Confirm Chinese UI in the client before reporting success.
- Do not disable signature/structure checks, Gatekeeper, SIP, or forge compatibility entries.
- Do not star, watch, or change account settings on the user's behalf.

## Developing / 参与开发

- Node.js >= 22.12.0. Setup: `npm ci --ignore-scripts`.
- Before committing: `npm test` and `npm run validate` must both pass.
- Translations: `config/dom-translations.json` (exact + regex rules), `config/macos-translations.json`. Translation engine: `src/lib/translator.mjs`.
- Windows flow: `src/cli.mjs`, `scripts/auto-follow-update.mjs`. macOS flow: `scripts/macos.mjs`, `src/lib/macos.mjs` (keeps the original app, builds a signed Chinese copy).
- Release packaging: `.github/workflows/release.yml`, `scripts/assemble-universal.mjs`. See [docs/releasing.md](docs/releasing.md) and [docs/architecture.md](docs/architecture.md).
- Commit messages follow Conventional Commits, written in Chinese (e.g. `fix(i18n): …`).

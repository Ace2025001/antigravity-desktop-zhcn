# AGENTS.md

Guidance for AI coding agents (Claude Code, Codex, Cursor, Cline, etc.) working with this repository.
面向 AI 编程助手的说明：如何为用户安装本汉化包，以及如何参与开发。

## What this project is / 项目是什么

Simplified Chinese (zh-CN) localization for the **Google Antigravity Desktop** standalone client (also searched as “Antigravity 汉化”, “反重力 汉化”, “Antigravity Chinese language pack”).

- Platforms: Windows x64, Apple Silicon macOS. Intel Mac and Linux are not verified.
- Not for the Antigravity **IDE extension**.
- Ships its own Node.js runtime. No network install, no proxy/TUN changes.
- Optional, user-chosen features (first-run questions, editable later via `汉化设置`):
  - **Auto-follow updates** (Windows): when the patched client quits (e.g. the user clicks “Restart to update”), it starts a short-lived helper that waits for the installer, then re-localizes the new version (or asks first). No scheduled task or resident process; the hook is removed on restore / uninstall, and any `AntigravityZhcnAutoFollow` task left by v3.0.0 is deleted.
  - **Online supplementary translation**: untranslated UI strings and conversation titles are sent to Google Translate through the patched main process. Chat content, code, terminal output, files and user input are never sent.

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

First-run questions only appear in an interactive terminal. In unattended runs the defaults apply (auto-follow `auto`, pack auto-update `auto`, title auto-translate on). Tell the user about these defaults, or preset them with environment variables before running:

- `AGY_AUTO_FOLLOW=auto|ask|off`
- `AGY_PACK_AUTO_UPDATE=auto|ask|off`
- `AGY_TITLE_AUTO_TRANSLATE=on|off`

Rules / 规则:
- Ask the user to save their work before running. If the client is running, the tool waits 60 s, then requests a normal quit and force-closes it. Press `2` in the terminal if the user prefers to quit manually. Do not kill the client yourself outside the tool. 运行前先提醒用户保存工作，不要绕开工具自行结束客户端。
- Exit code 0 is not proof of success. Confirm Chinese UI in the client before reporting success.
- Do not disable signature/structure checks, Gatekeeper, SIP, or forge compatibility entries.
- Do not star, watch, or change account settings on the user's behalf.

## Developing / 参与开发

### Red lines / 红线（日常补充词条时不得自行越过，需要时先征得维护者同意）

1. **No new network access, background tasks or writes to user data without an explicit user setting.** Any new outbound request, scheduled task / daemon / autostart, or change to the user's Antigravity data (conversations, titles, settings) must be opt-in through `src/lib/user-settings.mjs`, shown in the first-run questions and `汉化设置`, removed on restore / uninstall, and documented in README. 不得未经用户设置就新增联网、常驻后台或修改用户数据。
2. **Page code never calls the network directly.** Title auto-translation goes only through the `agy-zhcn://translate` proxy in `src/lib/patcher.mjs`, which checks `titleAutoTranslate` first, and startup pack update checks go through `agy_zhcn_pack_hook.json` / `src/lib/self-update.mjs` honoring `packAutoUpdate` with SHA-256 verification. Do not reintroduce direct `fetch("https://…")` or local translator ports in `createRuntimeOverlay`. 页面代码不得直接联网。
3. **Translation rules never shrink by accident.** `npm run validate` fails if the exact or pattern count drops below `config/translation-baseline.json`. Raise the baseline after adding rules; never lower it to make validation pass. 词条数量只增不减。
4. **Behaviour changes update the docs in the same commit**: README, `docs/ai-install.md`, the FAQ page and this file. 行为变化必须同步更新说明。
5. **Each change set is released on its own**: after `npm test` and `npm run validate` pass, bump `package.json`, update `src/lib/release-notes.mjs` and `docs/changelog/`, then push a `v*` tag. 每批修改单独发版。

### Workflow

- Node.js >= 22.12.0. Setup: `npm ci --ignore-scripts`.
- Before committing: `npm test` and `npm run validate` must both pass.
- Applying translation changes on the maintainer's machine (Windows): `npm run hot-update` regenerates the Chinese UI from the original UI embedded in the install directory and replaces it atomically, without closing the client; reload the window (View → Reload) to see it. Use `--dry-run` to check first. If the client version changed, the user runs `启动中文` instead. Never close or restart the client yourself. 修改词库后用 `npm run hot-update` 热更新，不关闭客户端。
- Translations: `config/dom-translations.json` (exact + regex rules), `config/macos-translations.json`. Translation engine: `src/lib/translator.mjs`.
- Windows flow: `src/cli.mjs`, `scripts/auto-follow-update.mjs`. macOS flow: `scripts/macos.mjs`, `src/lib/macos.mjs` (keeps the original app, builds a signed Chinese copy).
- Release packaging: `.github/workflows/release.yml`, `scripts/assemble-universal.mjs`. See [docs/releasing.md](docs/releasing.md) and [docs/architecture.md](docs/architecture.md).
- Commit messages follow Conventional Commits, written in Chinese (e.g. `fix(i18n): …`).

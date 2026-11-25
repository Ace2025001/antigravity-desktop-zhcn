# Antigravity Desktop Chinese Localization (zh-CN Language Pack)

[![Latest release](https://img.shields.io/github/v/release/Ace2025001/antigravity-desktop-zhcn)](https://github.com/Ace2025001/antigravity-desktop-zhcn/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/Ace2025001/antigravity-desktop-zhcn/total)](https://github.com/Ace2025001/antigravity-desktop-zhcn/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%20x64%20%7C%20macOS%20Apple%20Silicon-blue)](#supported-platforms)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

A **Simplified Chinese (zh-CN) language pack / Chinese patch** for the **Google Antigravity Desktop** client. Works on Windows x64 and Apple Silicon Macs, runs straight from the extracted folder, re-localizes right after you click “Restart to update” in the client, and restores English anytime.

[中文说明](README.md) · [Setup guides (Chinese)](https://ace2025001.github.io/antigravity-desktop-zhcn/) · [Guide for AI agents](docs/ai-install.md)

| Sign-in | Agent run | Settings |
|---|---|---|
| ![Antigravity sign-in page in Simplified Chinese](docs/images/zhcn-login.jpg) | ![Antigravity agent run steps in Simplified Chinese](docs/images/zhcn-agent-run.jpg) | ![Antigravity general settings in Simplified Chinese](docs/images/zhcn-settings-general.jpg) |

## Download and use

1. Download [**Antigravity-Windows+Mac.zip**](https://github.com/Ace2025001/antigravity-desktop-zhcn/releases/latest/download/Antigravity-Windows%2BMac.zip) and extract it, then run it from the extracted folder.
2. Open `win启动` (Windows) or `mac启动` (macOS).
3. Run **`启动中文`** (Start Chinese). Use **`恢复英文`** to restore English and **`汉化设置`** to change settings.

```text
antigravity汉化包/
├─ win启动/     Windows entry points: 启动中文.bat, 恢复英文.bat, 汉化设置.bat
├─ mac启动/     macOS entry points (.command), same usage
└─ 语言包/      translation data and shared code — keep it
```

## First-run settings

The first run asks setup questions; press Enter to accept the recommended values. Change them later with `汉化设置`.

| Setting | Options | Recommended |
|---|---|---|
| After the client updates (Windows) | Localize automatically / Ask me / Do nothing | Localize automatically |
| Language pack auto-update | Auto-update / Ask me / Off | Auto-update |
| Online fill-in for UI text not yet in the dictionary | On / Off | On |
| Title auto-translation (Antigravity generates English titles by default) | On / Off | On |

- **Localize automatically**: after “Restart to update”, the new version is localized and reopened in Chinese in about 40 seconds. **Ask me** prompts with an update card. No scheduled task or resident process is installed.
- **Language pack auto-update**: regardless of how Antigravity is launched, checks the latest GitHub release against SHA-256 `digest`. **Auto-update** updates translations and core scripts silently in the background; **Ask me** prompts first; **Off** disables pack update checks. Existing installs created before this setting default to **Ask me**.
- **Online fill-in**: the UI uses curated human translations first. When a client update adds buttons, menus or hints the dictionary does not cover yet, they are shown in Chinese via Google Translate until a curated translation ships, which then replaces it. Existing installs are asked once on the next `启动中文` run and stay off until they answer.
- **Title auto-translation**: when enabled, only AI-generated English conversation titles are translated for display, and stored chat records stay as they are; manually renamed titles keep the name you gave them.
- Chat content, code, terminal output, file names, links, paths, account details, your own skills and rules, and anything you type are never sent. Language pack auto-update only reads the GitHub release page and downloads the package; nothing is uploaded.

## Features

- **Ready to run**: bundled runtime, no Node.js needed; finds the client automatically.
- **Thorough**: 17,000+ curated translations: menus, tray, settings, agent execution traces and tool calls (file edits, shell commands with exit codes, MCP tools, image generation), the plugin marketplace (100+ plugins), quotas and input shortcuts. Names such as `agy` CLI, Catppuccin and Dracula are kept.
- **Reversible**: conversation data is never modified; on Mac the official app stays untouched.
- **Client-only**: changes only the Antigravity client; proxy, network and system settings stay as you set them.

## Supported platforms

| Item | Notes |
|---|---|
| Windows x64 | Tested on Antigravity Desktop 2.32.2, 2.33.0, 2.34.0 and 2.35.1; follows client updates automatically |
| Apple Silicon macOS | Keeps the official app and builds a locally signed Chinese copy; Intel Macs not verified |
| Scope | Antigravity Desktop client only — **not** the Antigravity IDE extension |
| Compatibility | The client's file structure is checked before every run; new versions are adapted automatically when possible, otherwise it stops with a message instead of forcing changes |

## FAQ

- **Restore English?** Save your work and run `恢复英文`; the official English client is restored and conversations are untouched.
- **Full pack, language update or Source code?** First-time users need the full pack only. The language update is for existing users; Source code is for developers.
- **Updating the pack?** Keep **Language pack auto-update** enabled to update automatically on launch/quit, run `scripts/self-update.mjs`, or download the latest release and overwrite the folder.
- **Install with an AI agent?** Ask Claude Code, Codex, Cursor or another agent to follow [docs/ai-install.md](docs/ai-install.md).

## Development

Requires Node.js >= 22.12.0. Run `npm ci --ignore-scripts`, `npm test` and `npm run validate`. See [architecture](docs/architecture.md), [releasing](docs/releasing.md), [contributing](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md).

MIT licensed.

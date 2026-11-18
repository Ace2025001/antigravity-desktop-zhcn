# Antigravity Desktop Chinese Localization (zh-CN Language Pack)

[![Latest release](https://img.shields.io/github/v/release/Ace2025001/antigravity-desktop-zhcn)](https://github.com/Ace2025001/antigravity-desktop-zhcn/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/Ace2025001/antigravity-desktop-zhcn/total)](https://github.com/Ace2025001/antigravity-desktop-zhcn/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%20x64%20%7C%20macOS%20Apple%20Silicon-blue)](#faq)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

A **Simplified Chinese (zh-CN) language pack / Chinese patch** for the **Google Antigravity Desktop** client. Works on Windows x64 and Apple Silicon Macs, runs straight from the extracted folder, re-localizes right after you click “Restart to update” in the client, and restores English anytime.

[中文说明](README.md) · [Setup guides (Chinese)](https://ace2025001.github.io/antigravity-desktop-zhcn/) · [Guide for AI agents](docs/ai-install.md)

## Download and use

1. Download [**Antigravity-Windows+Mac.zip**](https://github.com/Ace2025001/antigravity-desktop-zhcn/releases/latest/download/Antigravity-Windows%2BMac.zip) and extract it.
2. Open `win启动` (Windows) or `mac启动` (macOS).
3. Run **`启动中文`** (Start Chinese). Use **`恢复英文`** to restore English and **`汉化设置`** to change settings.

## Features

- **Ready to run**: bundled runtime, no Node.js needed; finds the client automatically.
- **Follows updates**: after “Restart to update”, the new version is localized and reopened in Chinese automatically, or you are asked first (Windows).
- **Thorough**: 16,000+ curated translations: menus, tray, settings, agent execution traces and tool calls (file edits, shell commands with exit codes, MCP tools, image generation), the plugin marketplace (75+ plugins), quotas and input shortcuts. Names such as `agy` CLI, Catppuccin and Dracula are kept.
- **Optional online fill-in**: untranslated UI strings go to Google Translate; chat content, code and files are never sent. Can be turned off.
- **Reversible**: conversation data is never modified; on Mac the official app stays untouched.

## FAQ

- **Supported versions?** Windows x64 (tested on Desktop 2.32.2) and Apple Silicon macOS; Intel Macs are not verified. Not for the Antigravity IDE extension.
- **Updating translations?** Download the latest release, replace the `语言包` folder and run `启动中文` again.
- **Install with an AI agent?** Ask Claude Code, Codex, Cursor or another agent to follow [docs/ai-install.md](docs/ai-install.md).

## Development

Requires Node.js >= 22.12.0. Run `npm ci --ignore-scripts`, `npm test` and `npm run validate`. See [architecture](docs/architecture.md), [releasing](docs/releasing.md), [contributing](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md).

MIT licensed.

# Antigravity Desktop Chinese Localization (zh-CN Language Pack)

[![Latest release](https://img.shields.io/github/v/release/Ace2025001/antigravity-desktop-zhcn)](https://github.com/Ace2025001/antigravity-desktop-zhcn/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/Ace2025001/antigravity-desktop-zhcn/total)](https://github.com/Ace2025001/antigravity-desktop-zhcn/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%20x64%20%7C%20macOS%20Apple%20Silicon-blue)](#supported-platforms)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

An open-source **Simplified Chinese (zh-CN) language pack / Chinese patch** for the **Google Antigravity Desktop** standalone client, on Windows x64 and Apple Silicon macOS. One download works on both platforms, runs offline with a bundled runtime, finds your installation automatically, re-applies Chinese after client updates, and restores English at any time. Tested on Antigravity Desktop 2.29.0.

This targets the standalone Desktop client, **not** the Antigravity IDE extension.

[中文说明](README.md) · [Setup guides (Chinese)](https://ace2025001.github.io/antigravity-desktop-zhcn/) · [Guide for AI agents](docs/ai-install.md) · [AGENTS.md](AGENTS.md)

## Download and install

1. Download the full package: [**Antigravity-Windows+Mac.zip**](https://github.com/Ace2025001/antigravity-desktop-zhcn/releases/latest/download/Antigravity-Windows%2BMac.zip). The release page labels it `Antigravity-完整汉化包-Windows+Mac.zip`; it is the same file.
2. Extract the whole ZIP. Do not run files from inside the archive.
3. Open `win启动` (Windows) or `mac启动` (macOS) and run **`启动中文`** ("Start Chinese").
4. To go back to English, save your work, quit the client and run **`恢复英文`** ("Restore English").

After the first successful launch, an **Antigravity自动汉化** shortcut is created on the desktop. It checks the localization and re-applies it when the client or the language pack changes.

```text
antigravity汉化包/
├─ win启动/   Windows launchers + bundled node.exe
├─ mac启动/   macOS launchers + bundled node
└─ 语言包/    shared translations and core program
```

## Supported platforms

- **Windows x64**: patches the installed client with a backup; restore puts the original back.
- **macOS, Apple Silicon**: keeps the official app untouched and builds a locally signed Chinese copy at `~/Applications/Antigravity 中文.app`. Intel Macs are not verified.
- Every client version must pass structure and resource checks. Unregistered versions are adapted dynamically from the running UI; nothing is forced.
- If the client is running, you get 60 seconds to save and quit. Quitting yourself is detected automatically; press `Y` to force-close now or `N` to wait for you without forcing. With no answer the tool asks the client to quit, then force-closes it.
- The tool never changes proxy, node or TUN settings.

## What gets translated

Menus, tray, settings, the standalone chat panel, deep agent execution traces and tool calling lifecycle (file operations, shell commands with exit codes, MCP tools, multi-modal image generation, thinking/working status), conversation timeline cards, input shortcuts (Cancel Ctrl+D, send, queue), dynamic home greetings, model and user quota panels, the complete plugin marketplace catalog (75+ official & partner plugins with sub-options and suggested prompts), and permission prompts. Over 12,300 exact rules and 3,100 dynamic rules. Product and command names such as `agy` CLI, Catppuccin, Dracula, One Dark Pro and Tokyo Night are preserved.

## Language pack updates

Translations are updated continuously. If you already have a recent full package, download the language-only update from the [latest release](https://github.com/Ace2025001/antigravity-desktop-zhcn/releases/latest), replace the `语言包` folder and run `启动中文` again.

## Install with an AI agent

Point Claude Code, Codex, Cursor or another agent at this repository and ask it to follow [docs/ai-install.md](docs/ai-install.md). It covers the download URL, SHA-256 verification through the GitHub API `digest` field, per-platform commands, how to judge success, and how to restore English.

## Development

Requires Node.js >= 22.12.0. Run `npm ci --ignore-scripts`, `npm test` and `npm run validate`. See [architecture](docs/architecture.md), [releasing](docs/releasing.md) and [contributing](CONTRIBUTING.md).

## Acknowledgements

- [@javaht](https://github.com/javaht): macOS adaptation, real-device testing and cross-platform path fixes ([#7](https://github.com/Ace2025001/antigravity-desktop-zhcn/pull/7)).

MIT licensed.

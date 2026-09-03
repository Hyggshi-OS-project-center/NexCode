# NexCode IDE

<div id="NexCode-logo" align="center">
    <br />
    <img src="./build/icon.svg" alt="NexCode IDE Logo" width="180"/>
    <h1>NexCode IDE</h1>
    <p><strong>A fast, lightweight, and extensible code editor for modern development.</strong></p>
    <p><em>Part of the <a href="https://github.com/Hyggshi-OS-project-center">Hyggshi OS</a> ecosystem.</em></p>
</div>

<div id="badges" align="center">

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-lightgrey)](https://github.com/Hyggshi-OS-project-center/NexCode/releases)
[![GitHub All Releases](https://img.shields.io/github/downloads/Hyggshi-OS-project-center/NexCode/total.svg)](https://github.com/Hyggshi-OS-project-center/NexCode/releases) 
[![current release](https://img.shields.io/github/release/Hyggshi-OS-project-center/NexCode.svg)](https://github.com/Hyggshi-OS-project-center/NexCode/releases)

[![NexCode v 4.0.0 test local](https://hyggshi-badge.vercel.app/api/badge?message=v+4.0.0+test+local&label=NexCode&color=6366f1&labelColor=0f172a&style=hyggshi&shape=cyberpunk&icon=nexcode&animation=gradient-shift)](https://hyggshi-badge.vercel.app/api/badge?message=v+4.0.0+test+local&label=NexCode&color=6366f1&labelColor=0f172a&style=hyggshi&shape=cyberpunk&icon=nexcode&animation=gradient-shift)

[![Built with Electron](https://hyggshi-badge.vercel.app/api/badge?message=Electron+37.2.1&label=Built+with&color=6366f1&labelColor=0f172a&style=plastic&icon=electron&animation=gradient-shift)](https://www.electronjs.org/)
[![TypeScript](https://hyggshi-badge.vercel.app/api/badge?message=5.x&label=TypeScript&color=6366f1&labelColor=0f172a&style=plastic&icon=typescript&animation=gradient-shift)](https://www.typescriptlang.org/)
[![Vite](https://hyggshi-badge.vercel.app/api/badge?message=6.x&label=Vite&color=6366f1&labelColor=0f172a&style=plastic&icon=vite&animation=gradient-shift)](https://vitejs.dev/)
[![Monaco Editor](https://hyggshi-badge.vercel.app/api/badge?message=0.55.x&label=monaco+editor&color=6366f1&labelColor=0f172a&style=plastic&animation=gradient-shift)](https://microsoft.github.io/monaco-editor/)

[![Stars](https://hyggshi-badge.vercel.app/api/github/stars/Hyggshi-OS-project-center/NexCode?style=plastic&color=6366f1&labelColor=0f172a&animation=gradient-shift&icon=star)](https://github.com/Hyggshi-OS-project-center/NexCode/stargazers)
[![Forks](https://hyggshi-badge.vercel.app/api/github/forks/Hyggshi-OS-project-center/NexCode?style=plastic&color=6366f1&labelColor=0f172a&animation=gradient-shift&icon=gitfork)](https://github.com/Hyggshi-OS-project-center/NexCode/forks)
[![Issues](https://hyggshi-badge.vercel.app/api/github/issues/Hyggshi-OS-project-center/NexCode?style=plastic&color=6366f1&labelColor=0f172a&animation=gradient-shift)](https://github.com/Hyggshi-OS-project-center/NexCode/issues)
[![Pull Requests](https://hyggshi-badge.vercel.app/api/github/pulls/Hyggshi-OS-project-center/NexCode?style=plastic&color=6366f1&labelColor=0f172a&animation=gradient-shift)](https://github.com/Hyggshi-OS-project-center/NexCode/pulls)
[![Downloads](https://hyggshi-badge.vercel.app/api/github/downloads/Hyggshi-OS-project-center/NexCode?style=plastic&color=6366f1&labelColor=0f172a&animation=gradient-shift)](https://github.com/Hyggshi-OS-project-center/NexCode/releases)
[![Releases](https://hyggshi-badge.vercel.app/api/github/releases/Hyggshi-OS-project-center/NexCode?style=plastic&color=6366f1&labelColor=0f172a&animation=gradient-shift)](https://github.com/Hyggshi-OS-project-center/NexCode/releases)
[![Pre-releases](https://hyggshi-badge.vercel.app/api/github/prerelease/Hyggshi-OS-project-center/NexCode?style=plastic&color=6366f1&labelColor=0f172a&animation=gradient-shift)](https://github.com/Hyggshi-OS-project-center/NexCode/releases)
[![Latest Pre-release](https://hyggshi-badge.vercel.app/api/github/latest-prerelease/Hyggshi-OS-project-center/NexCode?style=plastic&color=6366f1&labelColor=0f172a&animation=gradient-shift)](https://github.com/Hyggshi-OS-project-center/NexCode/releases)

</div>

---

![Nexcode IDE Screenshot](./Resources/Screenshot%202026-09-03.png)

## Overview

**NexCode IDE** is a modern, hackable desktop code editor built on **Electron**, **TypeScript**, **Vite**, and **Monaco Editor**. It is designed to combine the power and familiar experience of VS Code with a super-fast startup, ultra-low resource usage, and first-class integration for the **HOSC/HOSC++** language and **Hyggshi OS** ecosystem.

The source code is open source and available under the [MIT License](LICENSE).

---

## ✨ Features

### 🖥️ Core Code Editor (Monaco-powered)
- **Engineered with Monaco Editor**: The same battle-tested editing core that powers VS Code.
- **Rich Language Intelligence**: Syntax highlighting, IntelliSense completions, parameter hints, code folding, bracket matching, and multi-cursor editing.
- **Broad Language Support**: TypeScript, JavaScript, Python, C/C++, HTML, CSS, JSON, Markdown, Lua, Go, Rust, and **HOSC/HOSC++**.
- **Split Editor & Tabs**: Split views horizontally or vertically, drag-and-drop tabs, and smooth tab scrolling.
- **Find & Replace**: Comprehensive regex search and replace across files.
- **Invisible Unicode Detector**: Automatically highlights invisible/confusable Unicode characters to protect against Trojan Source attacks.

### 📝 Markdown Live Preview
- Full-width Markdown preview panel with instant synchronization.
- Rich Markdown rendering: LaTeX math equations, Mermaid sequence/flow diagrams, GFM task lists, tables, syntax-highlighted code blocks with one-click copy.
- Quick switch button between source code and preview mode.

### 💻 Integrated Terminal (xterm.js)
- Multi-session embedded terminal supporting your favorite local shells (`bash`, `zsh`, `cmd`, `PowerShell`).
- Enhanced with ligatures, Unicode 11, Fit addon, Clipboard addon, and clickable URL links (`WebLinksAddon`).
- Shell quick-switcher and toggleable terminal panel.

### 🤖 AI Assistant & IDE Agent
- **AI IDE Agent**: Dedicated AI agent panel with chat interface for interactive coding assistance.
- **Gemini AI Diff Review**: Inline code diff reviews, explanations, and refactoring suggestions.

### 🌲 Git & Source Control
- Built-in Git panel: view unstaged/staged changes, inline diff viewer, stage/unstage files, commit messages, and branch status.

### 🐞 Run & Debugger
- **One-Click Run (`F5`)**: Execute current active scripts directly in the terminal.
- **Interactive Debugger**: Breakpoints, step execution, call stack inspection, and real-time variable watch.

### 🧩 Extensions & Themes
- **Extension Marketplace**: Integration with [Open VSX](https://open-vsx.org) registry.
- **HSIXET Theme Engine**: Custom `.hsiext` theme format for UI palettes and editor color schemes.

### 📄 Built-in Viewers & Web Preview
- **PDF Viewer**: Embedded PDF rendering panel without external viewer dependencies.
- **Browser Preview**: Iframe web browser preview with responsive simulation for web development.
- **Media Viewer**: Fast binary preview for images, video, and audio files.

### 🌸 Easter Eggs & Moments
- Interactive chibi characters (Shiroko, Hoshino, Momoi) and audio moments that bring personality to your coding sessions.

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) 20.x or newer
- `npm` (comes with Node.js)
- `git`

### Installation & Run from Source

```bash
# 1. Clone the repository
git clone https://github.com/Hyggshi-OS-project-center/NexCode.git
cd NexCode

# 2. Install dependencies
npm install

# 3. Start development mode (Vite + Electron)
npm run dev
```

---

## 🛠️ Build & Package Commands

| Command | Description |
|---|---|
| `npm run dev` | Run Vite renderer server and Electron with hot reload |
| `npm run dev:renderer` | Run only the Vite development server |
| `npm run dev:electron` | Build main process and start Electron |
| `npm run build` | Full production build (icons + main + renderer + agent) |
| `npm run buildfast` | Quick build without regenerating icons |
| `npm run build:main` | Compile main process TypeScript to `dist/main` |
| `npm run build:renderer` | Build renderer bundle with Vite to `dist/renderer` |
| `npm run typecheck` | Run TypeScript type checks on main and renderer |
| `npm run check` | Run typecheck + build:main + build:renderer |
| `npm run icons` | Regenerate app and file association icons |
| `npm run pack` | Build Windows NSIS installer (`.exe`) |
| `npm run pack:portable` | Build Windows portable executable |
| `npm run pack:linux` | Build Linux package set (AppImage, `.deb`, `.tar.gz`, `.zip`) |
| `npm run pack:portable:linux` | Build Linux standalone AppImage |

> For comprehensive build details, hardware recommendations, and troubleshooting, read [BUILD.md](BUILD.md).

---

## 🏗️ Tech Stack & Architecture

```
┌────────────────────────────────────────────────────────┐
│                      NexCode IDE                       │
├───────────────────────────┬────────────────────────────┤
│       Main Process        │      Renderer Process      │
│  (Node.js + Electron API) │  (Vite + TypeScript + DOM) │
├───────────────────────────┼────────────────────────────┤
│ • App Lifecycle & Window  │ • Monaco Editor Engine     │
│ • IPC Handlers & PTY      │ • UI Shell & Tabs System   │
│ • File System & Dialogs   │ • xterm.js Terminal Panel  │
│ • Auto-Update Service     │ • Markdown & PDF Viewers   │
│ • External Protocol Safe  │ • AI Agent & Git Panels    │
└───────────────────────────┴────────────────────────────┘
```

| Layer | Technology |
|---|---|
| **Desktop Shell** | [Electron 37](https://www.electronjs.org/) |
| **Language** | [TypeScript 5.8](https://www.typescriptlang.org/) |
| **Build Tool / Bundler** | [Vite 6](https://vitejs.dev/) |
| **Editor Engine** | [Monaco Editor 0.55](https://microsoft.github.io/monaco-editor/) |
| **Terminal Emulator** | [xterm.js 5.5](https://xtermjs.org/) + `node-pty` |
| **Packaging** | [electron-builder 25](https://www.electron.build/) |

---

## ⌨️ Common Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl + S` / `Cmd + S` | Save current file |
| `Ctrl + Shift + S` | Save As |
| `Ctrl + W` | Close active tab |
| `Ctrl + \`` | Toggle integrated terminal |
| `F5` | Run active file |
| `Ctrl + F` | Find in editor |
| `Ctrl + H` | Replace in editor |
| `Ctrl + B` | Toggle primary sidebar |
| `Ctrl + Shift + P` | Command palette |

---

## 🌐 Related Projects

NexCode IDE is an integral component of the **Hyggshi OS** project ecosystem:

- 🌌 [Hyggshi OS](https://github.com/Hyggshi-OS-project-center) — The primary OS project and simulator.
- ⚡ [HOSC Language](https://github.com/Hyggshi-OS-project-center/HOSC-Language) — Custom programming language and bytecode virtual machine.
- 🌐 [Hyggshi OS Web Edition](https://hyggshi-os-website.pages.dev/OSmain) — Progressive Web App version.

---

## 🤝 Contributing

Contributions are warmly welcomed!
- 🐛 [Report a bug or submit feedback](https://github.com/Hyggshi-OS-project-center/NexCode/issues)
- 💡 [Submit feature requests](https://github.com/Hyggshi-OS-project-center/NexCode/issues/new)
- 🔀 [Submit pull requests](https://github.com/Hyggshi-OS-project-center/NexCode/pulls)

Please refer to the [Core Feature Set](docs/CORE_FEATURES.md) and [Extension Development](docs/EXTENSION_DEVELOPMENT.md) documents when proposing major architectural additions.

---

## 📄 License

Copyright © Hyggshi OS Project Center. All rights reserved.

Licensed under the [MIT License](LICENSE).

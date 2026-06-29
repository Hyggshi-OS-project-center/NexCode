# NexCode IDE — Core Feature Set

**Project:** NexCode IDE  
**License:** HOSL-1.3  
**Maintained by:** Hyggshi OS (NexCode)  
**Document version:** 1.0.0  
**Date published:** 2026-06-29  
**Applies to versions:** v3.0.0 and later

> This document defines the Core Feature Set referenced in Section 1(g) of the HOSL-1.3 license.  
> Any Competing Web Service determination under Section 1(f) shall be evaluated against this list,  
> using the version in effect on the date of the alleged infringing act.

---

## Core Features

### CF-01 · Code Editor (Monaco-based)
A full-featured source code editor powered by Monaco Editor, supporting syntax highlighting, IntelliSense / autocomplete, multi-cursor editing, code folding, find & replace, and minimap. Language support includes TypeScript, JavaScript, Python, C/C++, HTML, CSS, JSON, Markdown, and HOSC.

### CF-02 · File Explorer & Project Management
A sidebar file tree allowing users to open, create, rename, delete, and navigate files and directories within a local project. Supports multi-root workspaces and recent projects list.

### CF-03 · Integrated Terminal
An embedded terminal emulator supporting shell access (bash/zsh/PowerShell) directly within the IDE window, with support for multiple terminal tabs.

### CF-04 · Extension System (`.hsiext` format)
A proprietary extension/theme packaging format (`.hsiext`) that allows installation of themes, audio packs, and UI customizations. Extensions are loaded and managed through the IDE's built-in extension manager.

### CF-05 · Easter Egg System
An interactive easter egg subsystem featuring animated chibi characters (Shiroko, Hoshino, Momoi) with accompanying audio, triggered through specific in-app interactions. Integral to the NexCode identity and user experience.

### CF-06 · Gemini AI Diff Review
An AI-powered code review feature using Google Gemini, allowing users to select a code diff or block and receive automated analysis, suggestions, and explanations inline.

### CF-07 · Multi-Architecture Build System
GitHub Actions-based CI/CD pipeline producing release artifacts for:
- Windows: x64, ARM64, ia32 (NSIS installer)
- Linux: AppImage, .deb, .rpm

### CF-08 · Stable / Insider Update Channels
A dual-channel software update system (Stable and Insider), with automatic update checking, download, and installation from the official GitHub Releases endpoint.

### CF-09 · Custom Titlebar with Fluent/Segoe MDL2 Icons
A native-style frameless titlebar using Segoe MDL2 Assets and Fluent Icons, replacing the default OS chrome. Includes window controls (minimize, maximize, close) and menu integration.

### CF-10 · PDF Viewer
A built-in PDF rendering panel allowing users to open and read PDF documents without leaving the IDE.

### CF-11 · Crash Handler & Error Recovery
A dedicated crash handler that captures unhandled exceptions, logs diagnostics, displays a user-friendly crash screen, and offers recovery options (restart / report).

### CF-12 · HOSC Language Support
First-class editor support for the HOSC/HOSC++ programming language, including syntax highlighting, basic IntelliSense, and integration with the HOSC LSP server when available.

### CF-13 · Lightweight Resource Profile
A designed-in target of ≤150 MB RAM usage under typical workloads, positioned explicitly as a lightweight alternative to heavier Electron-based editors.

---

## Non-Core Features

The following features are present in NexCode but are **not** part of the Core Feature Set for the purposes of Section 1(f) Competing Web Service evaluation:

- Splash screen / branding animations  
- Specific color themes or icon sets  
- README.md or documentation content  
- Keyboard shortcut assignments  
- Window size / layout defaults  

---

## Revision History

| Version | Date       | Changes             | Author     |
|---------|------------|---------------------|------------|
| 1.0.0   | 2026-06-29 | Initial publication | Hyggshi OS |

---

*This document is part of the NexCode project and is itself covered by HOSL-1.3.*
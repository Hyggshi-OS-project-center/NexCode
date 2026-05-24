# NexCode IDE

Modern desktop code editor built with **Electron**, **Monaco Editor**, and a VS Code–inspired UI.

## Quick start

```bash
npm install
npm run build
npm start
```

Development (rebuild renderer on change):

```bash
npm run dev
```

## Project structure

```
src/
├── main/           # Electron main process, IPC, terminal shell
├── renderer/       # UI modules (editor, explorer, terminal, …)
└── shared/         # Shared types between processes
```

## Features

- File explorer, tabs, syntax highlighting, IntelliSense, minimap
- Dark / light themes, integrated terminal, auto-save
- Search & replace, Ctrl+scroll zoom, status bar, welcome screen
- Settings panel, context menus, drag-and-drop
- Lua, Python, JavaScript, JSON, Markdown, Plain Text
- Built-in preview for images, video, and audio files

## Extending

Register plugins via `PluginHost` in `src/renderer/modules/plugin/PluginHost.ts`.

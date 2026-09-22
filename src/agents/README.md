# NexCode AI Agent window

This is the standalone, frameless "NexCode AI Agent" window (opened via
`createOrFocusAgentWindow()` in `src/main/main.ts`). It is a separate UI from
the in-editor chat sidebar (`src/renderer/modules/chat/ChatPanel.ts`), but
**both share the exact same backend**: this window's renderer
(`src/renderer/modules/agent.js`) talks to the main process purely over the
`ai:chat` IPC channel, which is handled by `src/main/ai/{claudeService,
geminiService,openRouterService}.ts` — the same services the main IDE window
uses. There is no separate AI backend here anymore.

## Layout

- `src/renderer/index.html` — window markup.
- `src/renderer/modules/agent.js` — UI logic: sessions, message rendering,
  attachments, settings, and applying agent actions.
- `src/renderer/modules/preload.js` — the `contextBridge` surface for this
  window. In addition to `aiChat`, it exposes `writeFile` / `deleteFile` /
  `validateFile` so this window can apply the agent's file actions directly.
- `src/renderer/styles/styles.css` — window styling.

## Autonomous by design

Unlike the main IDE window, this window has no diff-review UI. When the
agent proposes a `write_file` or `delete_file` action, `agent.js` applies it
to disk immediately (via the preload bridge above) and then runs local
validation when possible. This window is meant to be used as a fully
autonomous coding agent; use the main IDE window's chat sidebar instead if
you want to review each file change before it's written.

## History

Earlier versions of this window had their own duplicated copies of
`agentWorkflow.ts` / `geminiService.ts` / `openRouterService.ts` under
`src/main/ai/` in this folder. Those files were never wired into the build
(not referenced by any `tsconfig`, and `main.ts` only loads this window's
static `renderer` files) and have been removed — the shared services under
the top-level `src/main/ai/` are the single source of truth now.

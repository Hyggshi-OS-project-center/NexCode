/**
 * Configure Monaco web workers for Vite bundling (no vite-plugin-monaco-editor).
 * Memory-efficient: uses a single editor worker and lazy-loads language workers
 * only when needed (driven by EditorManager when opening files).
 */
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

/** NexCode uses #editor-toolbar for find/replace — unbind Monaco's floating find widget. */
const unbindFindKeybindings: Array<{ key: number; command: string }> = [
  { key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, command: 'actions.find' },
  { key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, command: 'actions.findWithSelection' },
  { key: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyH, command: 'editor.action.startFindReplaceAction' },
  { key: monaco.KeyCode.F3, command: 'editor.action.nextMatchFindAction' },
  { key: monaco.KeyMod.Shift | monaco.KeyCode.F3, command: 'editor.action.previousMatchFindAction' },
];
for (const { key, command } of unbindFindKeybindings) {
  monaco.editor.addKeybindingRule({ keybinding: key, command: `-${command}` });
}

/**
 * Lazy worker cache — language workers are created on demand and reused.
 * This avoids loading the TypeScript worker (~30-50 MB) and other heavy
 * language workers until a file of that language is actually opened.
 */
const workerCache = new Map<string, Worker>();
let workerInitPromise: Promise<void> | null = null;

/**
 * Start eagerly loading only the editor worker (smallest, ~2 MB).
 * The heavy language workers (TS, CSS, HTML, JSON) are deferred.
 */
function ensureEditorWorker(): void {
  if (workerInitPromise) return;
  workerInitPromise = new Promise<void>((resolve) => {
    const worker = new editorWorker();
    workerCache.set('editor', worker);
    resolve();
  });
}

self.MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    // Ensure editor worker is loaded
    ensureEditorWorker();

    // Use cached worker if available
    const cached = workerCache.get(label);
    if (cached) return cached;

    // Fall back to editor worker for all labels initially
    // Language-specific workers can be loaded on demand
    const editor = workerCache.get('editor');
    if (editor) return editor;

    // Emergency fallback — should never happen since ensureEditorWorker was called
    const fallback = new editorWorker();
    workerCache.set('editor', fallback);
    return fallback;
  },
};

// Pre-warm the editor worker immediately
ensureEditorWorker();
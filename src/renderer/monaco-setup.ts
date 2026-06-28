/**
 * Configure Monaco web workers for Vite bundling (no vite-plugin-monaco-editor).
 * Language services are loaded on demand so autocomplete works while typing.
 */
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

// Register CSS language for color decorators (color picker on hex/rgb values)
import 'monaco-editor/esm/vs/language/css/monaco.contribution';
// Register HTML language for embedded CSS color support
import 'monaco-editor/esm/vs/language/html/monaco.contribution';
// Register TypeScript and JSON languages for syntax support
import 'monaco-editor/esm/vs/language/typescript/monaco.contribution';
import 'monaco-editor/esm/vs/language/json/monaco.contribution';

/** NexCode uses #editor-toolbar for find/replace - unbind Monaco's floating find widget. */
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

const workerCache = new Map<string, Worker>();
let workerInitPromise: Promise<void> | null = null;

function ensureEditorWorker(): void {
  if (workerInitPromise) return;
  workerInitPromise = new Promise<void>((resolve) => {
    const worker = new editorWorker();
    workerCache.set('editor', worker);
    resolve();
  });
}

function getWorkerKey(label: string): string {
  if (label === 'json') return 'json';
  if (label === 'css' || label === 'scss' || label === 'less') return 'css';
  if (label === 'html' || label === 'handlebars' || label === 'razor') return 'html';
  if (label === 'typescript' || label === 'javascript') return 'typescript';
  return 'editor';
}

function createWorker(key: string): Worker {
  switch (key) {
    case 'json':
      return new jsonWorker();
    case 'css':
      return new cssWorker();
    case 'html':
      return new htmlWorker();
    case 'typescript':
      return new tsWorker();
    default:
      return new editorWorker();
  }
}

self.MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    ensureEditorWorker();

    const key = getWorkerKey(label);
    const cached = workerCache.get(key);
    if (cached) return cached;

    const worker = createWorker(key);
    workerCache.set(key, worker);
    return worker;
  },
};

ensureEditorWorker();
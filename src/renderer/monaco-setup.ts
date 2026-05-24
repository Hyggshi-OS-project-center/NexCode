/**
 * Configure Monaco web workers for Vite bundling (no vite-plugin-monaco-editor).
 */
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

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

self.MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    switch (label) {
      case 'json':
        return new jsonWorker();
      case 'css':
      case 'scss':
      case 'less':
        return new cssWorker();
      case 'html':
      case 'handlebars':
      case 'razor':
        return new htmlWorker();
      case 'typescript':
      case 'javascript':
        return new tsWorker();
      default:
        return new editorWorker();
    }
  },
};

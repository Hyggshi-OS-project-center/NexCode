/**
 * Monaco Editor module — core editing experience with themes, IntelliSense, minimap, zoom.
 */
import * as monaco from 'monaco-editor';
import type { AiEditorContext, AppSettings } from '../../../shared/types';
import { getLanguageFromPath } from '../../utils/language';

export type EditorChangeHandler = (path: string) => void;
export type EditorAutoSaveHandler = (path: string, value: string) => void;
export type CursorChangeHandler = (line: number, column: number, langId: string) => void;

interface EditorInstance {
  path: string;
  model: monaco.editor.ITextModel;
}

type EditorPane = 'primary' | 'secondary';

export class EditorManager {
  private host: HTMLElement;
  private splitRoot: HTMLElement;
  private secondaryHost: HTMLElement;
  private divider: HTMLElement;
  private editor: monaco.editor.IStandaloneCodeEditor | null = null;
  private editorSecondary: monaco.editor.IStandaloneCodeEditor | null = null;
  private splitActive = false;
  private focusedPane: EditorPane = 'primary';
  private models = new Map<string, EditorInstance>();
  private activePath: string | null = null;
  private settings: AppSettings;
  private onChange?: EditorChangeHandler;
  private onAutoSave?: EditorAutoSaveHandler;
  private onCursorChange?: CursorChangeHandler;
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Set by cancelAutoSave() to block scheduleAutoSave from creating a new timer
   * even if onDidChangeContent fires while the "unsaved changes" dialog is open.
   * Cleared by resumeAutoSave() once the dialog is dismissed and saving is safe again.
   */
  private autoSavePaused = false;
  private suppressChangeFor = new Set<string>();
  private breakpoints = new Map<string, Set<number>>();
  private primaryBreakpointDecorations: monaco.editor.IEditorDecorationsCollection | null = null;
  private secondaryBreakpointDecorations: monaco.editor.IEditorDecorationsCollection | null = null;
  private primaryDebugLineDecorations: monaco.editor.IEditorDecorationsCollection | null = null;
  private secondaryDebugLineDecorations: monaco.editor.IEditorDecorationsCollection | null = null;

  constructor(hostId: string, settings: AppSettings) {
    this.host = document.getElementById(hostId)!;
    this.splitRoot = document.getElementById('editor-split-root')!;
    this.secondaryHost = document.getElementById('monaco-host-secondary')!;
    this.divider = document.getElementById('editor-split-divider')!;
    this.settings = settings;
    this.defineThemes();

    this.host.addEventListener('mousedown', () => {
      this.focusedPane = 'primary';
    });
    this.secondaryHost.addEventListener('mousedown', () => {
      this.focusedPane = 'secondary';
    });
  }

  setHandlers(
    onChange: EditorChangeHandler,
    onAutoSave: EditorAutoSaveHandler,
    onCursorChange: CursorChangeHandler,
  ): void {
    this.onChange = onChange;
    this.onAutoSave = onAutoSave;
    this.onCursorChange = onCursorChange;
  }

  /** Register custom Monaco themes aligned with VS Code Dark+/Light+ neutrals */
  private defineThemes(): void {
    monaco.editor.defineTheme('nexus-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#1e1e1e',
        'editor.foreground': '#d4d4d4',
        'editorLineNumber.foreground': '#858585',
        'editor.selectionBackground': '#264f78',
        'editor.inactiveSelectionBackground': '#3a3d41',
        'editorCursor.foreground': '#aeafad',
        'editor.lineHighlightBackground': '#2a2d2e',
        'editorWidget.background': '#252526',
        'editorSuggestWidget.background': '#252526',
        'minimap.background': '#1e1e1e',
      },
    });

    monaco.editor.defineTheme('nexus-light', {
      base: 'vs',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#ffffff',
        'editor.foreground': '#000000',
        'editorLineNumber.foreground': '#237893',
        'editor.selectionBackground': '#add6ff',
        'editorCursor.foreground': '#000000',
        'editor.lineHighlightBackground': '#f0f0f0',
        'editorWidget.background': '#f3f3f3',
      },
    });
  }

  /** NexCode uses the editor-toolbar for find/replace — disable Monaco's floating find widget shortcuts. */
  private disableBuiltInFindKeybindings(editor: monaco.editor.IStandaloneCodeEditor): void {
    const keys = [
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF,
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyH,
      monaco.KeyCode.F3,
      monaco.KeyMod.Shift | monaco.KeyCode.F3,
    ];
    for (const keybinding of keys) {
      editor.addCommand(keybinding, () => undefined);
    }
  }

  private createEditorIfNeeded(): void {
    if (this.editor) return;

    this.editor = monaco.editor.create(this.host, this.buildOptions());
    this.disableBuiltInFindKeybindings(this.editor);
    this.host.classList.remove('hidden');
    this.splitRoot.classList.remove('hidden');

    this.bindEditorPane(this.editor, this.host, 'primary');

    // Drag and drop files into editor
    this.host.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    this.host.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer?.files[0];
      if (file) {
        const text = await file.text();
        const path = (file as any).path || file.name;
        await this.openFile(path, text);
      }
    });
  }

  private bindEditorPane(
    editor: monaco.editor.IStandaloneCodeEditor,
    host: HTMLElement,
    pane: EditorPane,
  ): void {
    if (pane === 'primary') {
      if (!this.primaryBreakpointDecorations) this.primaryBreakpointDecorations = editor.createDecorationsCollection([]);
      if (!this.primaryDebugLineDecorations) this.primaryDebugLineDecorations = editor.createDecorationsCollection([]);
    }
    if (pane === 'secondary') {
      if (!this.secondaryBreakpointDecorations) this.secondaryBreakpointDecorations = editor.createDecorationsCollection([]);
      if (!this.secondaryDebugLineDecorations) this.secondaryDebugLineDecorations = editor.createDecorationsCollection([]);
    }

    editor.onMouseDown((e) => {
      if (e.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN || !e.target.position) {
        return;
      }
      const model = editor.getModel();
      if (!model) return;
      const path = this.pathForModel(model);
      if (!path) return;
      this.toggleBreakpoint(path, e.target.position.lineNumber);
    });

    editor.onDidChangeCursorPosition(() => {
      if (this.getFocusedEditor() === editor) this.notifyCursor();
    });

    host.addEventListener('wheel', (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -1 : 1;
        const size = editor.getOption(monaco.editor.EditorOption.fontSize) + delta;
        editor.updateOptions({ fontSize: Math.min(32, Math.max(10, size)), colorDecorators: true, colorDecoratorsActivatedOn: 'clickAndHover' });
      }
    }, { passive: false });
  }

  private getFocusedEditor(): monaco.editor.IStandaloneCodeEditor | null {
    return this.focusedPane === 'secondary' ? this.editorSecondary : this.editor;
  }

  splitDown(): void {
    if (this.splitActive) {
      this.unsplit();
      return;
    }
    if (!this.editor) this.createEditorIfNeeded();
    if (!this.editor) return;

    this.splitActive = true;
    this.splitRoot.classList.add('split');
    this.divider.classList.remove('hidden');
    this.secondaryHost.classList.remove('hidden');

    if (!this.editorSecondary) {
      this.editorSecondary = monaco.editor.create(this.secondaryHost, this.buildOptions());
      this.disableBuiltInFindKeybindings(this.editorSecondary);
      this.bindEditorPane(this.editorSecondary, this.secondaryHost, 'secondary');
    }

    if (this.activePath) {
      const instance = this.models.get(this.activePath);
      if (instance) this.editorSecondary.setModel(instance.model);
    }

    this.editorSecondary.layout();
    this.editor.layout();
    document.getElementById('btn-split-down')?.classList.add('active');
  }

  unsplit(): void {
    if (!this.splitActive) return;
    this.splitActive = false;
    this.splitRoot.classList.remove('split');
    this.divider.classList.add('hidden');
    this.secondaryHost.classList.add('hidden');
    this.focusedPane = 'primary';
    this.editor?.layout();
    document.getElementById('btn-split-down')?.classList.remove('active');
  }

  isSplit(): boolean {
    return this.splitActive;
  }

  private buildOptions(): monaco.editor.IStandaloneEditorConstructionOptions {
    return {
      theme: this.settings.theme === 'dark' ? 'nexus-dark' : 'nexus-light',
      fontFamily: this.settings.fontFamily,
      fontSize: this.settings.fontSize,
      tabSize: this.settings.tabSize,
      insertSpaces: true,
      wordWrap: this.settings.wordWrap ? 'on' : 'off',
      minimap: { enabled: this.settings.minimap },
      automaticLayout: true,
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      renderWhitespace: 'selection',
      bracketPairColorization: { enabled: true },
      suggestOnTriggerCharacters: true,
      quickSuggestions: true,
      wordBasedSuggestions: 'matchingDocuments',
      formatOnPaste: true,
      padding: { top: 12 },
      glyphMargin: true,
      folding: true,
      lineNumbers: 'on',
      renderLineHighlight: 'all',
      find: { addExtraSpaceOnTop: false },
      colorDecorators: true,
      colorDecoratorsActivatedOn: 'clickAndHover',
    };
  }

  applySettings(settings: AppSettings): void {
    this.settings = settings;
    const options = {
      theme: settings.theme === 'dark' ? 'nexus-dark' : 'nexus-light',
      fontFamily: settings.fontFamily,
      fontSize: settings.fontSize,
      tabSize: settings.tabSize,
      wordWrap: settings.wordWrap ? ('on' as const) : ('off' as const),
      minimap: { enabled: settings.minimap },
    };
    this.editor?.updateOptions(options);
    this.editorSecondary?.updateOptions(options);
    document.body.dataset.theme = settings.theme;
  }

  async openFile(path: string, content: string): Promise<void> {
    this.createEditorIfNeeded();
    if (!this.editor) return;

    let instance = this.models.get(path);
    if (!instance) {
      const lang = getLanguageFromPath(path);
      const uri = monaco.Uri.file(path);
      let model = monaco.editor.getModel(uri);
      if (!model) {
        model = monaco.editor.createModel(content, lang, uri);
      } else {
        model.setValue(content);
      }
      instance = { path, model };
      this.models.set(path, instance);

      model.onDidChangeContent(() => {
        if (this.suppressChangeFor.has(path)) return;
        this.onChange?.(path);
        this.scheduleAutoSave(path);
      });
    }

    this.activePath = path;
    this.editor.setModel(instance.model);
    if (this.splitActive && this.editorSecondary) {
      this.editorSecondary.setModel(instance.model);
    }
    this.getFocusedEditor()?.focus() ?? this.editor.focus();
    this.notifyCursor();
    this.syncBreakpointDecorations();
  }

  private pathForModel(model: monaco.editor.ITextModel): string | null {
    for (const [path, inst] of this.models) {
      if (inst.model === model) return path;
    }
    return null;
  }

  toggleBreakpoint(path: string, line: number): void {
    let lines = this.breakpoints.get(path);
    if (!lines) {
      lines = new Set();
      this.breakpoints.set(path, lines);
    }
    if (lines.has(line)) lines.delete(line);
    else lines.add(line);
    if (lines.size === 0) this.breakpoints.delete(path);
    this.refreshBreakpointDecorations(path);
  }

  toggleBreakpointAtCursor(): void {
    const path = this.activePath;
    const ed = this.getFocusedEditor();
    if (!path || !ed) return;
    const line = ed.getPosition()?.lineNumber;
    if (line) this.toggleBreakpoint(path, line);
  }

  hasBreakpoint(path: string, line: number): boolean {
    return this.breakpoints.get(path)?.has(line) ?? false;
  }

  setDebugLineDecoration(path: string, line: number | null): void {
    this.applyDebugLineToPane(this.editor, this.primaryDebugLineDecorations, path, line);
    this.applyDebugLineToPane(this.editorSecondary, this.secondaryDebugLineDecorations, path, line);
  }

  private applyDebugLineToPane(
    editor: monaco.editor.IStandaloneCodeEditor | null,
    collection: monaco.editor.IEditorDecorationsCollection | null,
    path: string,
    line: number | null,
  ): void {
    if (!editor || !collection) return;
    const model = editor.getModel();
    if (!model) return;
    if (this.pathForModel(model) !== path) return;

    if (line === null) {
      collection.clear();
      return;
    }

    collection.set([
      {
        range: new monaco.Range(line, 1, line, 1),
        options: {
          isWholeLine: true,
          className: 'debug-current-line-highlight',
          glyphMarginClassName: 'debug-current-line-glyph',
          glyphMarginHoverMessage: { value: 'Current Instruction Pointer' },
        },
      },
    ]);
  }

  private refreshBreakpointDecorations(path: string): void {
    const lines = [...(this.breakpoints.get(path) ?? [])].sort((a, b) => a - b);
    const decorations: monaco.editor.IModelDeltaDecoration[] = lines.map((line) => ({
      range: new monaco.Range(line, 1, line, 1),
      options: {
        glyphMarginClassName: 'breakpoint-glyph',
        glyphMarginHoverMessage: { value: 'Breakpoint' },
      },
    }));

    this.applyBreakpointsToPane(this.editor, this.primaryBreakpointDecorations, path, decorations);
    this.applyBreakpointsToPane(this.editorSecondary, this.secondaryBreakpointDecorations, path, decorations);
  }

  private applyBreakpointsToPane(
    editor: monaco.editor.IStandaloneCodeEditor | null,
    collection: monaco.editor.IEditorDecorationsCollection | null,
    path: string,
    decorations: monaco.editor.IModelDeltaDecoration[],
  ): void {
    if (!editor || !collection) return;
    const model = editor.getModel();
    if (!model) return;
    if (this.pathForModel(model) === path) collection.set(decorations);
  }

  /** Re-apply gutter breakpoints after switching the active file. */
  syncBreakpointDecorations(): void {
    if (!this.activePath) {
      this.primaryBreakpointDecorations?.clear();
      this.secondaryBreakpointDecorations?.clear();
      return;
    }
    this.refreshBreakpointDecorations(this.activePath);
  }

  /**
   * Schedule a deferred auto-save for `path`.
   *
   * FIX: Guards on `autoSavePaused` so that keyboard input reaching Monaco
   * while the "unsaved changes" dialog is open cannot start a new timer
   * (which would fire after "Don't Save" is clicked and save the file).
   * The timer reference is also nulled inside the callback so that a
   * subsequent cancelAutoSave() call doesn't attempt to clear a stale ID.
   */
  private scheduleAutoSave(path: string): void {
    if (!this.settings.autoSave || this.autoSavePaused) return;
    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => {
      this.autoSaveTimer = null; // Clear reference once fired
      if (this.autoSavePaused) return; // Safety guard for the tiny cancel window
      const value = this.models.get(path)?.model.getValue() ?? '';
      this.onAutoSave?.(path, value);
    }, this.settings.autoSaveDelayMs);
  }

  /**
   * Cancel any pending auto-save and block new ones from being scheduled.
   *
   * FIX: Setting `autoSavePaused = true` ensures that even if Monaco fires
   * onDidChangeContent while the "unsaved changes" dialog is visible (the
   * overlay does not trap all keyboard events), scheduleAutoSave is a no-op
   * until resumeAutoSave() is explicitly called.
   *
   * Called by the renderer when the unsaved-changes dialog is about to open.
   */
  cancelAutoSave(): void {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    this.autoSavePaused = true;
  }

  /**
   * Re-enable auto-save scheduling after it was suspended by cancelAutoSave().
   *
   * The renderer must call this:
   *   • When "Cancel" or backdrop-click dismisses the dialog (tab stays open).
   *   • Inside onTabClose() for every tab close (covers both "Save" and
   *     "Don't Save", since the tab is gone and auto-save should resume for
   *     remaining files).
   */
  resumeAutoSave(): void {
    this.autoSavePaused = false;
  }

  getContent(path: string): string {
    return this.models.get(path)?.model.getValue() ?? '';
  }

  updateFileContent(path: string, content: string): void {
    const instance = this.models.get(path);
    if (!instance) return;

    const model = instance.model;
    const viewStates = [
      { editor: this.editor, state: this.editor?.getModel() === model ? this.editor.saveViewState() : null },
      {
        editor: this.editorSecondary,
        state: this.editorSecondary?.getModel() === model ? this.editorSecondary.saveViewState() : null,
      },
    ];

    this.suppressChangeFor.add(path);
    try {
      model.setValue(content);
    } finally {
      this.suppressChangeFor.delete(path);
    }

    for (const item of viewStates) {
      if (item.editor && item.state && item.editor.getModel() === model) {
        try { item.editor.restoreViewState(item.state); } catch { /* model may be disposed */ }
      }
    }
    this.notifyCursor();
    this.syncBreakpointDecorations();
  }

  renamePath(oldPath: string, newPath: string): void {
    const instance = this.models.get(oldPath);
    if (!instance) return;
    this.models.delete(oldPath);
    instance.path = newPath;
    this.models.set(newPath, instance);

    const breakpoints = this.breakpoints.get(oldPath);
    if (breakpoints) {
      this.breakpoints.delete(oldPath);
      this.breakpoints.set(newPath, breakpoints);
    }

    if (this.activePath === oldPath) this.activePath = newPath;
    this.syncBreakpointDecorations();
  }

  getActiveEditor(): monaco.editor.IStandaloneCodeEditor | null {
    return this.getFocusedEditor() ?? this.editor;
  }

  getActivePath(): string | null {
    return this.activePath;
  }

  insertFontFamily(fontFamily: string): boolean {
    const editor = this.getFocusedEditor() ?? this.editor;
    const path = this.activePath;
    const model = editor?.getModel();
    const selection = editor?.getSelection();
    if (!editor || !model || !selection || !path) return false;

    const selectedText = model.getValueInRange(selection);
    const fontValue = fontFamily.trim() || 'Arial, Helvetica, sans-serif';
    const ext = path.split('.').pop()?.toLowerCase() ?? '';
    const isMarkup = ['html', 'htm', 'md', 'markdown'].includes(ext);
    const isStylesheet = ['css', 'scss', 'sass', 'less'].includes(ext);
    let text: string;

    if (isMarkup) {
      const content = selectedText || 'Text';
      text = `<span style="font-family: ${fontValue};">${content}</span>`;
    } else if (isStylesheet) {
      text = `font-family: ${fontValue};`;
    } else {
      text = `font-family: ${fontValue};`;
    }

    editor.executeEdits('insert-font-family', [{ range: selection, text, forceMoveMarkers: true }]);
    const end = selection.getStartPosition();
    editor.setPosition({
      lineNumber: end.lineNumber,
      column: end.column + text.length,
    });
    editor.focus();
    return true;
  }

  show(): void {
    this.splitRoot.classList.remove('hidden');
    this.host.classList.remove('hidden');
  }

  hide(): void {
    this.splitRoot.classList.add('hidden');
    this.host.classList.add('hidden');
    this.secondaryHost.classList.add('hidden');
  }

  layout(): void {
    this.editor?.layout();
    this.editorSecondary?.layout();
  }

  revealLine(line: number): void {
    const ed = this.getFocusedEditor() ?? this.editor;
    if (!ed) return;
    ed.revealLineInCenter(line);
    ed.setPosition({ lineNumber: line, column: 1 });
    ed.focus();
  }

  getActiveModel(): monaco.editor.ITextModel | null {
    return this.getFocusedEditor()?.getModel() ?? this.editor?.getModel() ?? null;
  }

  getAiContext(): AiEditorContext {
    const ed = this.getFocusedEditor() ?? this.editor;
    const model = ed?.getModel() ?? null;
    const content = model?.getValue() ?? '';
    const selection = ed?.getSelection() ?? null;
    const selectedText = model && selection && !selection.isEmpty() ? model.getValueInRange(selection) : '';
    const contentLimit = 20000;
    const selectedLimit = 10000;

    return {
      activeFilePath: this.activePath,
      languageId: model?.getLanguageId() ?? null,
      cursor: ed?.getPosition() ?? null,
      selection: selection
        ? {
            startLineNumber: selection.startLineNumber,
            startColumn: selection.startColumn,
            endLineNumber: selection.endLineNumber,
            endColumn: selection.endColumn,
          }
        : null,
      selectedText: selectedText.slice(0, selectedLimit),
      selectedTextTruncated: selectedText.length > selectedLimit,
      content: content.slice(0, contentLimit),
      contentTruncated: content.length > contentLimit,
    };
  }

  /** Run a built-in Monaco editor command (e.g. editor.action.undo). */
  runEditorAction(actionId: string): boolean {
    const ed = this.getFocusedEditor() ?? this.editor;
    if (!ed) return false;
    const action = ed.getAction(actionId);
    if (!action) return false;
    void action.run();
    return true;
  }

  /** Highlight invisible / ambiguous unicode (VS Code-style warning) */
  setUnicodeHighlight(enabled: boolean): void {
    this.editor?.updateOptions({
      unicodeHighlight: {
        nonBasicASCII: enabled,
        invisibleCharacters: enabled,
        ambiguousCharacters: enabled,
      },
    });
  }

  private notifyCursor(): void {
    const ed = this.getFocusedEditor();
    if (!ed || !this.activePath) return;
    const pos = ed.getPosition();
    const model = ed.getModel();
    if (pos && model) {
      this.onCursorChange?.(pos.lineNumber, pos.column, model.getLanguageId());
    }
  }

  /** Basic IntelliSense snippets for supported languages */
  static registerSnippets(): void {
    monaco.languages.registerCompletionItemProvider('lua', {
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        const snippets = ['function', 'local', 'end', 'if', 'then', 'else', 'for', 'while', 'print'];
        return {
          suggestions: snippets.map((label) => ({
            label,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: label,
            range,
          })),
        };
      },
    });

    monaco.languages.registerCompletionItemProvider('python', {
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        const snippets = ['def', 'class', 'import', 'from', 'if', 'elif', 'else', 'for', 'while', 'return', 'print'];
        return {
          suggestions: snippets.map((label) => ({
            label,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: label,
            range,
          })),
        };
      },
    });
  }
}
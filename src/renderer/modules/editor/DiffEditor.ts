/**
 * DiffEditor — Monaco Diff Editor component for AI agent file change review.
 *
 * Shows a side-by-side diff of original vs modified content with
 * Approve / Reject / Accept All buttons so the user can review
 * AI-suggested changes before writing to disk.
 */
import * as monaco from 'monaco-editor';

export interface DiffEditorPendingWrite {
  path: string;
  originalContent: string;
  modifiedContent: string;
  label: string;
}

export type DiffEditorApproveHandler = (path: string, content: string) => void | Promise<void>;
export type DiffEditorRejectHandler = (path: string, originalContent: string) => void | Promise<void>;

export class DiffEditor {
  private container: HTMLElement;
  private diffEditor: monaco.editor.IStandaloneDiffEditor | null = null;
  private originalModel: monaco.editor.ITextModel | null = null;
  private modifiedModel: monaco.editor.ITextModel | null = null;
  private pendingWrites: DiffEditorPendingWrite[] = [];
  private currentIndex = 0;
  private onApprove: DiffEditorApproveHandler = () => {};
  private onReject: DiffEditorRejectHandler = () => {};
  private onAcceptAll: () => void = () => {};
  private onDismiss: () => void = () => {};
  private onHide: () => void = () => {};
  private mounted = false;

  // UI elements
  private overlayEl: HTMLElement | null = null;
  private filePathEl: HTMLElement | null = null;
  private counterEl: HTMLElement | null = null;
  private approveBtn: HTMLButtonElement | null = null;
  private rejectBtn: HTMLButtonElement | null = null;
  private acceptAllBtn: HTMLButtonElement | null = null;
  private dismissBtn: HTMLButtonElement | null = null;

  constructor(containerId: string) {
    this.container = document.getElementById(containerId)!;
  }

  /**
   * Show the diff editor with pending file changes.
   */
  show(
    writes: DiffEditorPendingWrite[],
    handlers: {
      onApprove: DiffEditorApproveHandler;
      onReject: DiffEditorRejectHandler;
      onAcceptAll: () => void;
      onDismiss: () => void;
      onHide?: () => void;
    },
  ): void {
    if (writes.length === 0) return;

    this.pendingWrites = writes;
    this.currentIndex = 0;
    this.onApprove = handlers.onApprove;
    this.onReject = handlers.onReject;
    this.onAcceptAll = handlers.onAcceptAll;
    this.onDismiss = handlers.onDismiss;
    this.onHide = handlers.onHide ?? (() => {});

    this.renderOverlay();
    this.mountDiffEditor();
    this.updateCurrentWrite();
  }

  /**
   * Hide and dispose the diff editor.
   */
  hide(): void {
    this.disposeDiffEditor();
    this.removeOverlay();
    this.pendingWrites = [];
    this.currentIndex = 0;
    this.onHide();
  }

  /**
   * Check if the diff editor is currently visible.
   */
  isVisible(): boolean {
    return this.overlayEl !== null && !this.overlayEl.classList.contains('hidden');
  }

  // ─── Private ──────────────────────────────────────────────────────────

  private renderOverlay(): void {
    this.removeOverlay();

    const overlay = document.createElement('div');
    overlay.id = 'diff-editor-overlay';
    overlay.className = 'diff-editor-overlay';
    overlay.innerHTML = `
      <div class="diff-editor-toolbar">
        <div class="diff-editor-toolbar-left">
          <svg class="diff-editor-icon" viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
            <path d="M8 2.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8z"/>
            <path d="M5 7.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5z"/>
          </svg>
          <span class="diff-editor-title">AI Changes Review</span>
          <span class="diff-editor-counter" id="diff-editor-counter"></span>
        </div>
        <div class="diff-editor-toolbar-right">
          <span class="diff-editor-filepath" id="diff-editor-filepath"></span>
          <button type="button" class="diff-btn diff-btn-reject" id="diff-btn-reject" title="Reject changes (restore original)">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854z"/></svg>
            Reject
          </button>
          <button type="button" class="diff-btn diff-btn-approve" id="diff-btn-approve" title="Approve changes (keep modified version)">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/></svg>
            Approve
          </button>
          <button type="button" class="diff-btn diff-btn-accept-all" id="diff-btn-accept-all" title="Approve all remaining changes">
            Accept All
          </button>
          <button type="button" class="diff-btn diff-btn-dismiss" id="diff-btn-dismiss" title="Dismiss without reviewing remaining">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854z"/></svg>
          </button>
        </div>
      </div>
      <div class="diff-editor-container" id="diff-editor-mount"></div>
    `;

    this.container.appendChild(overlay);
    this.overlayEl = overlay;
    this.filePathEl = overlay.querySelector('#diff-editor-filepath');
    this.counterEl = overlay.querySelector('#diff-editor-counter');
    this.approveBtn = overlay.querySelector('#diff-btn-approve');
    this.rejectBtn = overlay.querySelector('#diff-btn-reject');
    this.acceptAllBtn = overlay.querySelector('#diff-btn-accept-all');
    this.dismissBtn = overlay.querySelector('#diff-btn-dismiss');

    this.approveBtn?.addEventListener('click', () => void this.handleApprove());
    this.rejectBtn?.addEventListener('click', () => void this.handleReject());
    this.acceptAllBtn?.addEventListener('click', () => this.handleAcceptAll());
    this.dismissBtn?.addEventListener('click', () => this.handleDismiss());

    // Keyboard shortcuts
    this.overlayEl.addEventListener('keydown', (e) => {
      // Ctrl+Enter → Approve
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void this.handleApprove();
        return;
      }
      // Ctrl+Shift+A → Accept All
      if (e.key === 'A' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault();
        this.handleAcceptAll();
        return;
      }
      // Esc → Reject current change, move to next
      if (e.key === 'Escape') {
        e.preventDefault();
        void this.handleReject();
      }
    });
  }

  private removeOverlay(): void {
    if (this.overlayEl) {
      this.overlayEl.remove();
      this.overlayEl = null;
    }
  }

  private mountDiffEditor(): void {
    this.disposeDiffEditor();

    const mountEl = document.getElementById('diff-editor-mount');
    if (!mountEl) return;

    const theme = document.body.dataset.theme === 'light' ? 'vs' : 'vs-dark';

    this.diffEditor = monaco.editor.createDiffEditor(mountEl, {
      automaticLayout: true,
      readOnly: true,
      renderSideBySide: true,
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      renderOverviewRuler: true,
      overviewRulerBorder: false,
      diffCodeLens: true,
      scrollbar: {
        verticalScrollbarSize: 10,
        horizontalScrollbarSize: 10,
        useShadows: false,
      },
      minimap: { enabled: false },
      renderLineHighlight: 'all',
      theme,
    });

    this.mounted = true;
    // Force a layout pass after the editor is mounted and the overlay is in
    // the DOM. automaticLayout relies on a ResizeObserver which may not
    // fire in time for the very first paint.
    requestAnimationFrame(() => this.diffEditor?.layout());
  }

  private updateCurrentWrite(): void {
    const write = this.pendingWrites[this.currentIndex];
    if (!write) {
      this.hide();
      return;
    }

    // Update toolbar info
    if (this.filePathEl) {
      const name = write.path.split(/[/\\]/).pop() ?? write.path;
      this.filePathEl.textContent = write.path;
      this.filePathEl.title = write.path;
    }
    if (this.counterEl) {
      this.counterEl.textContent = `${this.currentIndex + 1} of ${this.pendingWrites.length}`;
    }

    // Detect language from file extension
    const ext = write.path.split('.').pop()?.toLowerCase() ?? '';
    const langMap: Record<string, string> = {
      ts: 'typescript', tsx: 'typescriptreact', js: 'javascript', jsx: 'javascriptreact',
      py: 'python', rs: 'rust', go: 'go', java: 'java', c: 'c', cpp: 'cpp', cs: 'csharp',
      html: 'html', css: 'css', scss: 'scss', json: 'json', md: 'markdown', yaml: 'yaml',
      yml: 'yaml', xml: 'xml', sql: 'sql', sh: 'shell', bash: 'shell', lua: 'lua',
      php: 'php', rb: 'ruby', swift: 'swift', kt: 'kotlin', dart: 'dart',
    };
    const language = langMap[ext] ?? 'plaintext';

    // Reuse models by updating their content and language rather than
    // disposing and recreating. This avoids Monaco tears downs / rebuilds
    // that can trigger "InstantiationService has been disposed" errors when
    // suggestion widgets or other async Monaco widgets fire during the
    // churn of model disposal + recreation.
    if (this.originalModel && this.modifiedModel) {
      this.originalModel.setValue(write.originalContent);
      this.modifiedModel.setValue(write.modifiedContent);
      // Update language in case extension changed between files
      monaco.editor.setModelLanguage(this.originalModel, language);
      monaco.editor.setModelLanguage(this.modifiedModel, language);
    } else {
      this.originalModel = monaco.editor.createModel(
        write.originalContent,
        language,
        monaco.Uri.parse(`diff-original:${encodeURIComponent(write.path)}`),
      );
      this.modifiedModel = monaco.editor.createModel(
        write.modifiedContent,
        language,
        monaco.Uri.parse(`diff-modified:${encodeURIComponent(write.path)}`),
      );
      this.diffEditor?.setModel({
        original: this.originalModel,
        modified: this.modifiedModel,
      });
    }

    // Focus the diff editor
    setTimeout(() => {
      this.diffEditor?.getModifiedEditor().focus();
    }, 100);
  }

  private disposeModels(): void {
    if (this.originalModel) {
      this.originalModel.dispose();
      this.originalModel = null;
    }
    if (this.modifiedModel) {
      this.modifiedModel.dispose();
      this.modifiedModel = null;
    }
  }

  private disposeDiffEditor(): void {
    if (this.diffEditor) {
      // Dispose the diff editor FIRST so it releases its references to the models.
      // Then dispose the models themselves. Reversing this order would cause
      // "TextModel got disposed before DiffEditorWidget model got reset".
      this.diffEditor.dispose();
      this.diffEditor = null;
    }
    this.disposeModels();
    this.mounted = false;
  }

  private async handleApprove(): Promise<void> {
    const write = this.pendingWrites[this.currentIndex];
    if (!write) return;

    await this.onApprove(write.path, write.modifiedContent);
    this.advanceOrFinish();
  }

  private async handleReject(): Promise<void> {
    const write = this.pendingWrites[this.currentIndex];
    if (!write) return;

    // Proper Monaco Diff Editor reject workflow:
    // null out the diff model FIRST so DiffEditorWidget releases its
    // references to the TextModels, then dispose the models safely.
    // Reversing the order causes "TextModel got disposed before
    // DiffEditorWidget model got reset".
    if (this.diffEditor) {
      this.diffEditor.setModel(null);
    }
    this.disposeModels();

    await this.onReject(write.path, write.originalContent);

    if (this.diffEditor) {
      this.diffEditor.dispose();
      this.diffEditor = null;
      this.mounted = false;
    }
    this.removeOverlay();

    // Move to the next pending write (or finish if this was the last one)
    const wasLast = this.currentIndex >= this.pendingWrites.length - 1;
    if (wasLast) {
      this.pendingWrites = [];
      this.currentIndex = 0;
    } else {
      // Rebuild for next file
      this.currentIndex++;
      this.renderOverlay();
      this.mountDiffEditor();
      this.updateCurrentWrite();
    }
  }

  private async handleAcceptAll(): Promise<void> {
    // Approve all remaining writes sequentially so that failures are caught
    // and don't result in unhandled promise rejections that silently allow
    // modified code to remain without the original being properly restored.
    for (let i = this.currentIndex; i < this.pendingWrites.length; i++) {
      const write = this.pendingWrites[i];
      try {
        await this.onApprove(write.path, write.modifiedContent);
      } catch (err) {
        console.error(`[DiffEditor] Failed to approve ${write.path}:`, err);
      }
    }
    this.onAcceptAll();
    this.hide();
  }

  private async handleDismiss(): Promise<void> {
    // Proper Monaco Diff Editor dismiss workflow:
    // null out the diff model FIRST so DiffEditorWidget releases its
    // references to the TextModels, then dispose the models safely.
    if (this.diffEditor) {
      this.diffEditor.setModel(null);
    }
    this.disposeModels();

    for (let i = this.currentIndex; i < this.pendingWrites.length; i++) {
      const write = this.pendingWrites[i];
      try {
        await this.onReject(write.path, write.originalContent);
      } catch (err) {
        console.error(`[DiffEditor] Failed to reject ${write.path}:`, err);
      }
    }
    this.onDismiss();
    this.hide();
  }

  private advanceOrFinish(): void {
    this.currentIndex++;
    if (this.currentIndex >= this.pendingWrites.length) {
      this.hide();
    } else {
      this.updateCurrentWrite();
    }
  }
}
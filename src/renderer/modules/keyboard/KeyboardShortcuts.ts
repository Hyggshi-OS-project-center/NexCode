/**
 * Global keyboard shortcuts — work from editor, terminal (CMD), and media preview.
 * Uses capture phase so xterm/Monaco cannot swallow Mod+key combos first.
 */

export interface ShortcutActions {
  save: () => void;
  find: () => void;
  replace: () => void;
  toggleTerminal: () => void;
  openFile: () => void;
  openFolder: () => void;
  run: () => void;
  openNexCat?: () => void;
  toggleBreakpoint?: () => void;
  stepOver?: () => void;
  stopDebug?: () => void;
  closeSearch?: () => void;
}

export class KeyboardShortcuts {
  private bound = false;

  constructor(private actions: ShortcutActions) {}

  bind(): void {
    if (this.bound) return;
    this.bound = true;
    window.addEventListener('keydown', (e) => this.onKeyDown(e), true);
  }

  /** Returns true if the event was handled (for xterm customKeyEventHandler). */
  handleEvent(e: KeyboardEvent): boolean {
    return this.tryHandle(e);
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (this.tryHandle(e)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  private tryHandle(e: KeyboardEvent): boolean {
    if (e.defaultPrevented || e.repeat) return false;

    if (e.key === 'F5') {
      if (e.shiftKey && this.actions.stopDebug) {
        this.actions.stopDebug();
      } else {
        this.actions.run();
      }
      return true;
    }
    if (e.key === 'F9' && this.actions.toggleBreakpoint) {
      this.actions.toggleBreakpoint();
      return true;
    }
    if (e.key === 'F10' && this.actions.stepOver) {
      this.actions.stepOver();
      return true;
    }

    const mod = e.ctrlKey || e.metaKey;
    if (!mod) {
      if (e.key === 'Escape' && this.actions.closeSearch) {
        const target = e.target as HTMLElement;
        if (target.closest('#editor-toolbar')) {
          this.actions.closeSearch();
          return true;
        }
      }
      return false;
    }

    const target = e.target as HTMLElement;
    if (!this.shouldHandleFromTarget(target)) return false;

    const key = e.key.toLowerCase();

    if (key === 'n' && e.shiftKey && e.altKey && this.actions.openNexCat) {
      this.actions.openNexCat();
      return true;
    }

    if (key === 's') {
      this.actions.save();
      return true;
    }
    if (key === 'f') {
      this.actions.find();
      return true;
    }
    if (key === 'h') {
      this.actions.replace();
      return true;
    }
    if (key === 'o' && !e.shiftKey) {
      this.actions.openFile();
      return true;
    }
    if (key === 'o' && e.shiftKey) {
      this.actions.openFolder();
      return true;
    }
    if (key === '`') {
      this.actions.toggleTerminal();
      return true;
    }
    if (key === 'enter' && target.closest('.monaco-editor')) {
      this.actions.run();
      return true;
    }

    return false;
  }

  /**
   * Allow shortcuts from editor/terminal; skip plain settings sidebar inputs only.
   */
  private shouldHandleFromTarget(target: HTMLElement | null): boolean {
    if (!target) return true;

    if (target.closest('.xterm')) return true;
    if (target.closest('.monaco-editor')) return true;
    if (target.closest('#editor-toolbar')) return true;
    if (target.closest('.binary-view') || target.closest('#welcome-screen')) return true;

    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      if (target.closest('.settings-panel')) return false;
      if (target.closest('.search-sidebar')) return false;
    }
    if (target.closest('.terminal-command-row')) return false;
    if (target.closest('.explorer-filter')) return false;
    if (target.closest('#create-item-dialog')) return false;
    if (target.closest('.chat-panel')) return false;
    if (target.closest('.git-panel')) return false;
    if (target.closest('.git-commit-input')) return false;

    return true;
  }
}

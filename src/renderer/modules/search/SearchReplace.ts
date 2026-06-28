/**
 * Search & Replace — custom toolbar above the editor (Monaco find widget stays closed).
 */
import * as monaco from 'monaco-editor';
import type { EditorManager } from '../editor/EditorManager';
import { bindReliableTextFocus } from '../../utils/textInputFocus';

export class SearchReplace {
  private toolbar: HTMLElement;
  private searchInput: HTMLInputElement;
  private replaceInput: HTMLInputElement;
  private editorManager: EditorManager;
  private visible = false;
  private matches: monaco.editor.FindMatch[] = [];
  private matchIndex = 0;

  constructor(editorManager: EditorManager) {
    this.editorManager = editorManager;
    this.toolbar = document.getElementById('editor-toolbar')!;
    this.searchInput = document.getElementById('search-input') as HTMLInputElement;
    this.replaceInput = document.getElementById('replace-input') as HTMLInputElement;

    document.getElementById('btn-search-next')?.addEventListener('click', () => this.findNext());
    document.getElementById('btn-search-prev')?.addEventListener('click', () => this.findPrevious());
    document.getElementById('btn-replace-one')?.addEventListener('click', () => this.replaceOne());
    document.getElementById('btn-replace-all')?.addEventListener('click', () => this.replaceAll());
    document.getElementById('btn-close-search')?.addEventListener('click', () => this.hide());

    this.searchInput.addEventListener('input', () => this.refreshMatches(true));
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.shiftKey ? this.findPrevious() : this.findNext();
      }
      if (e.key === 'Escape') this.hide();
    });
    this.replaceInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.hide();
    });

    bindReliableTextFocus(this.searchInput);
    bindReliableTextFocus(this.replaceInput);
  }

  show(focusReplace = false): void {
    this.closeMonacoFindWidget();
    this.toolbar.classList.remove('hidden');
    this.visible = true;
    const input = focusReplace ? this.replaceInput : this.searchInput;
    input.focus();
    input.select();
    this.refreshMatches(true);
  }

  hide(): void {
    this.toolbar.classList.add('hidden');
    this.visible = false;
    this.matches = [];
    this.matchIndex = 0;
    this.closeMonacoFindWidget();
  }

  isVisible(): boolean {
    return this.visible;
  }

  private getEditor(): monaco.editor.IStandaloneCodeEditor | null {
    return this.editorManager.getActiveEditor();
  }

  /** Monaco's floating find box — separate from our toolbar; keep it closed. */
  private closeMonacoFindWidget(): void {
    const editor = this.getEditor();
    if (!editor) return;
    editor.trigger('nexcode-search', 'closeFindWidget', null);
  }

  private refreshMatches(jumpToFirst: boolean): void {
    const editor = this.getEditor();
    if (!editor) return;

    const query = this.searchInput.value;
    const model = editor.getModel();
    if (!model || !query) {
      this.matches = [];
      this.matchIndex = 0;
      return;
    }

    this.matches = model.findMatches(query, true, false, false, null, false);
    if (jumpToFirst && this.matches.length > 0) {
      this.matchIndex = 0;
      this.revealMatch(this.matchIndex);
    } else if (this.matchIndex >= this.matches.length) {
      this.matchIndex = Math.max(0, this.matches.length - 1);
    }
  }

  private revealMatch(index: number): void {
    const editor = this.getEditor();
    if (!editor || !this.matches[index]) return;
    const range = this.matches[index].range;
    editor.setSelection(range);
    editor.revealRangeInCenter(range);
  }

  private findNext(): void {
    if (!this.matches.length) {
      this.refreshMatches(true);
      return;
    }
    this.matchIndex = (this.matchIndex + 1) % this.matches.length;
    this.revealMatch(this.matchIndex);
  }

  private findPrevious(): void {
    if (!this.matches.length) {
      this.refreshMatches(true);
      return;
    }
    this.matchIndex = (this.matchIndex - 1 + this.matches.length) % this.matches.length;
    this.revealMatch(this.matchIndex);
  }

  private replaceOne(): void {
    const editor = this.getEditor();
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;
    const selection = editor.getSelection();
    if (!selection) return;

    const search = this.searchInput.value;
    const replace = this.replaceInput.value;
    if (!search) return;

    const selected = model.getValueInRange(selection);
    if (selected === search) {
      editor.executeEdits('replace', [{ range: selection, text: replace }]);
      this.refreshMatches(false);
    }
    this.findNext();
  }

  private replaceAll(): void {
    const editor = this.getEditor();
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;
    const search = this.searchInput.value;
    const replace = this.replaceInput.value;
    if (!search) return;

    const matches = model.findMatches(search, true, false, false, null, false);
    const edits = matches.map((m) => ({ range: m.range, text: replace }));
    editor.executeEdits('replaceAll', edits.reverse());
    this.refreshMatches(true);
  }
}

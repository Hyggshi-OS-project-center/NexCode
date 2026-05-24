/**
 * PowerShell-style command row — history (↑/↓) and path tab completion.
 */
import type { TerminalShell } from '../../../shared/types';
import { bindReliableTextFocus } from '../../utils/textInputFocus';
import {
  applyPathCompletion,
  listPathCompletions,
  normalizeTerminalCommand,
} from './terminalNavigation';

export interface TerminalCommandContext {
  shell: TerminalShell;
  cwd: string | null;
  home: string;
}

export class TerminalCommandInput {
  private history: string[] = [];
  private historyIndex = -1;
  private draft = '';
  private completionMatches: string[] = [];
  private completionIndex = -1;
  private completionMeta: {
    dir: string;
    prefix: string;
    replaceStart: number;
  } | null = null;

  constructor(
    private readonly input: HTMLInputElement,
    private readonly getContext: () => TerminalCommandContext,
    private readonly onSubmit: (command: string) => void,
  ) {
    this.input.addEventListener('keydown', (e) => void this.onKeyDown(e));
    bindReliableTextFocus(this.input);
  }

  resetCompletions(): void {
    this.completionMatches = [];
    this.completionIndex = -1;
    this.completionMeta = null;
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.submit();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.historyUp();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.historyDown();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      void this.tabComplete(e.shiftKey);
      return;
    }
    if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete') {
      this.resetCompletions();
    }
  }

  private submit(): void {
    const raw = this.input.value.trim();
    if (!raw) return;

    if (this.history[this.history.length - 1] !== raw) {
      this.history.push(raw);
      if (this.history.length > 200) this.history.shift();
    }
    this.historyIndex = -1;
    this.draft = '';
    this.resetCompletions();

    const { shell, cwd, home } = this.getContext();
    const command = normalizeTerminalCommand(raw, shell, cwd, home);
    this.input.value = '';
    this.onSubmit(command);
  }

  private historyUp(): void {
    if (this.history.length === 0) return;
    if (this.historyIndex === -1) {
      this.draft = this.input.value;
      this.historyIndex = this.history.length - 1;
    } else if (this.historyIndex > 0) {
      this.historyIndex -= 1;
    }
    this.input.value = this.history[this.historyIndex] ?? '';
  }

  private historyDown(): void {
    if (this.historyIndex === -1) return;
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex += 1;
      this.input.value = this.history[this.historyIndex] ?? '';
    } else {
      this.historyIndex = -1;
      this.input.value = this.draft;
    }
  }

  private async tabComplete(reverse: boolean): Promise<void> {
    const value = this.input.value;
    const ctx = this.getContext();

    if (this.completionMatches.length === 0) {
      const result = await listPathCompletions(value, ctx.cwd, ctx.home);
      if (!result || result.completions.length === 0) return;
      this.completionMeta = {
        dir: result.dir,
        prefix: result.prefix,
        replaceStart: result.replaceStart,
      };
      this.completionMatches = result.completions;
      this.completionIndex = reverse ? result.completions.length - 1 : 0;
    } else {
      const delta = reverse ? -1 : 1;
      this.completionIndex =
        (this.completionIndex + delta + this.completionMatches.length) %
        this.completionMatches.length;
    }

    const match = this.completionMatches[this.completionIndex]!;
    const meta = this.completionMeta!;
    this.input.value = applyPathCompletion(
      value,
      meta.dir,
      match,
      meta.replaceStart,
      ctx.shell,
    );
  }
}

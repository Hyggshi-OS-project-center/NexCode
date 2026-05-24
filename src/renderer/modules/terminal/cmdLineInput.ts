/**
 * Line-oriented input for piped CMD — buffer keys locally, submit only on Enter.
 * Ignores stray CR/LF bundled with printable keys (avoids running one letter per key).
 */
import type { Terminal } from '@xterm/xterm';

export type CmdLineSubmitHandler = (payload: string) => void;

export class CmdLineInput {
  private buffer = '';

  constructor(
    private readonly term: Terminal,
    private readonly onSubmit: CmdLineSubmitHandler,
  ) {}

  handleData(data: string): void {
    if (data === '\r' || data === '\n' || data === '\r\n') {
      this.submitLine();
      return;
    }

    if (/[\r\n]/.test(data)) {
      const parts = data.split(/\r\n|\n|\r/);
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) this.submitLine();
        this.insertText(parts[i] ?? '');
      }
      return;
    }

    this.insertText(data);
  }

  private insertText(text: string): void {
    for (const ch of text) {
      if (ch === '\x7f' || ch === '\b') {
        if (this.buffer.length > 0) {
          this.buffer = this.buffer.slice(0, -1);
          this.term.write('\b \b');
        }
        continue;
      }
      if (ch === '\x03') {
        this.buffer = '';
        this.term.write('^C\r\n');
        this.onSubmit('\x03');
        continue;
      }
      if (ch.charCodeAt(0) < 32 && ch !== '\t') continue;
      this.term.write(ch);
      this.buffer += ch;
    }
  }

  private submitLine(): void {
    if (this.buffer.length > 0) this.term.write('\r\n');
    const line = this.buffer;
    this.buffer = '';
    this.onSubmit(line.length > 0 ? `${line}\r\n` : '\r\n');
  }

  reset(): void {
    this.buffer = '';
  }
}

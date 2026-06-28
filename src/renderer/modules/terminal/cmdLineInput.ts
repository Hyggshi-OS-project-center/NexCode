/**
 * Line-oriented input for piped CMD — buffer keys locally, submit only on Enter.
 *
 * Improvements over the original:
 *  - Tracks cursor position within the line (left/right/home/end arrows work)
 *  - Grapheme-cluster-safe delete (handles surrogate pairs, emoji, CJK, …)
 *  - Forward Delete key (xterm sends ESC [ 3 ~)
 *  - Mid-line insert and backspace re-render the tail correctly
 *  - ^C clears the buffer and sends the interrupt byte
 */
import type { Terminal } from '@xterm/xterm';

export type CmdLineSubmitHandler = (payload: string) => void;

/** Split a string into an array of user-perceived characters (grapheme clusters). */
function toGraphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && (Intl as unknown as Record<string, unknown>)['Segmenter']) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return [...new (Intl as any).Segmenter().segment(text)].map(
      (s: { segment: string }) => s.segment,
    );
  }
  // Fallback: spread handles surrogate pairs even without Segmenter
  return [...text];
}

export class CmdLineInput {
  /** Current line as grapheme clusters */
  private graphemes: string[] = [];
  /** Cursor position in grapheme-cluster units (0 = before first char) */
  private cursor = 0;

  constructor(
    private readonly term: Terminal,
    private readonly onSubmit: CmdLineSubmitHandler,
  ) {}

  // ─── public API ────────────────────────────────────────────────────────────

  handleData(data: string): void {
    // Pure line terminators
    if (data === '\r' || data === '\n' || data === '\r\n') {
      this.submitLine();
      return;
    }

    // Escape sequences (xterm sends these for special keys)
    switch (data) {
      case '\x1b[3~':             // Delete (forward-delete)
        this.deleteForward();
        return;
      case '\x1b[D':             // Left arrow
        this.moveCursorBy(-1);
        return;
      case '\x1b[C':             // Right arrow
        this.moveCursorBy(+1);
        return;
      case '\x1b[H':             // Home (xterm)
      case '\x1b[1~':            // Home (rxvt / PuTTY)
        this.moveCursorTo(0);
        return;
      case '\x1b[F':             // End (xterm)
      case '\x1b[4~':            // End (rxvt / PuTTY)
        this.moveCursorTo(this.graphemes.length);
        return;
      default:
        break;
    }

    // Multi-line paste — split on any newline style
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

  reset(): void {
    this.graphemes = [];
    this.cursor = 0;
  }

  // ─── private ───────────────────────────────────────────────────────────────

  private insertText(text: string): void {
    for (const ch of toGraphemes(text)) {
      const cp = ch.codePointAt(0) ?? 0;

      // Backspace / DEL
      if (ch === '\x7f' || ch === '\b') {
        this.deleteBackward();
        continue;
      }

      // Ctrl-C — interrupt
      if (ch === '\x03') {
        this.graphemes = [];
        this.cursor = 0;
        this.term.write('^C\r\n');
        this.onSubmit('\x03');
        continue;
      }

      // Skip non-printable control chars (allow Tab)
      if (cp < 32 && ch !== '\t') continue;

      // Insert grapheme at cursor position
      this.graphemes.splice(this.cursor, 0, ch);
      this.cursor++;

      if (this.cursor === this.graphemes.length) {
        // Cursor is at end — simple write
        this.term.write(ch);
      } else {
        // Mid-line insert — write char then re-render the tail
        this.term.write(ch);
        this.rerenderTail();
      }
    }
  }

  private deleteBackward(): void {
    if (this.cursor === 0) return;
    this.graphemes.splice(this.cursor - 1, 1);
    this.cursor--;

    if (this.cursor === this.graphemes.length) {
      // Cursor is at end — classic VT100 backspace-space-backspace
      this.term.write('\b \b');
    } else {
      // Mid-line — move back one column then re-render tail
      this.term.write('\b');
      this.rerenderTail();
    }
  }

  private deleteForward(): void {
    if (this.cursor >= this.graphemes.length) return;
    this.graphemes.splice(this.cursor, 1);
    this.rerenderTail();
  }

  private moveCursorBy(delta: number): void {
    const next = Math.max(0, Math.min(this.graphemes.length, this.cursor + delta));
    if (next === this.cursor) return;
    // ESC[C = right, ESC[D = left
    const seq = delta > 0 ? '\x1b[C' : '\x1b[D';
    this.term.write(seq.repeat(Math.abs(next - this.cursor)));
    this.cursor = next;
  }

  private moveCursorTo(pos: number): void {
    this.moveCursorBy(pos - this.cursor);
  }

  /**
   * After a mid-line edit (insert or delete): overwrite everything from cursor
   * to old end-of-line, append a blank to erase the last char if the line
   * got shorter, then move the terminal cursor back to `this.cursor`.
   */
  private rerenderTail(): void {
    const tail = this.graphemes.slice(this.cursor).join('');
    // Write tail + one blank (covers the character position that may have shifted off)
    this.term.write(tail + ' ');
    // Move cursor back: tail.length chars + 1 for the blank
    const back = tail.length + 1;
    this.term.write(`\x1b[${back}D`);
  }

  private submitLine(): void {
    const line = this.graphemes.join('');
    if (line.length > 0) this.term.write('\r\n');
    this.graphemes = [];
    this.cursor = 0;
    this.onSubmit(line.length > 0 ? `${line}\r\n` : '\r\n');
  }
}

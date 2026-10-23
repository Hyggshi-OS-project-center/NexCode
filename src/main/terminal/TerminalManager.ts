/**
 * Integrated Terminal Manager — Native pseudo-terminal (node-pty) engine.
 * Provides standard VT100 / xterm-256color ANSI emulation, real-time PTY resizing,
 * multi-session lifecycle, and graceful fallback.
 */
import { type BrowserWindow } from 'electron';
import type * as PtyModule from 'node-pty';
import { existsSync, statSync } from 'fs';
import os from 'os';
import path from 'path';
import type { TerminalCreateOptions, TerminalShell, TerminalShellInfo } from '../../shared/types';
import { getSettings } from '../settings/store';
import { getAvailableShells, resolveShellProfile } from './shellConfig';

type PtyApi = typeof PtyModule;

let ptyModule: PtyApi | null = null;
let ptyLoadError: string | null = null;

/**
 * node-pty is a native addon. Loading it eagerly at the top of the file made the whole
 * main process crash on startup (no window) whenever the binary was missing or built
 * for the wrong Electron ABI. Load it lazily so the GUI always starts and only the
 * integrated terminal degrades.
 */
function loadPty(): PtyApi | null {
  if (ptyModule) return ptyModule;
  if (ptyLoadError) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ptyModule = require('node-pty') as PtyApi;
    return ptyModule;
  } catch (err: unknown) {
    ptyLoadError = err instanceof Error ? err.message : String(err);
    console.error('[terminal] node-pty failed to load:', ptyLoadError);
    return null;
  }
}

interface TerminalSession {
  id: number;
  ptyProcess: PtyModule.IPty;
  shell: TerminalShell;
  shellName: string;
  title: string;
  cwd: string;
}

export class TerminalManager {
  private sessions = new Map<number, TerminalSession>();
  private nextId = 1;

  create(window: BrowserWindow, options?: TerminalCreateOptions | string): number {
    const id = this.nextId++;
    const pty = loadPty();
    if (!pty) {
      if (!window.isDestroyed()) {
        window.webContents.send('terminal:data', {
          id,
          data:
            '\r\n\x1b[31;1m[Terminal unavailable: native module node-pty could not be loaded.]\x1b[0m\r\n' +
            `\x1b[33m${ptyLoadError ?? ''}\x1b[0m\r\n` +
            '\x1b[33mFix: run "npm run rebuild:native" (needs python3, make, g++) and restart.\x1b[0m\r\n',
        });
      }
      return -1;
    }
    const opts: TerminalCreateOptions =
      typeof options === 'string'
        ? { cwd: options }
        : options || {};

    const requestedShell = opts.shell || getSettings().terminalShell;
    const profile = resolveShellProfile(requestedShell);

    let startCwd = opts.cwd || process.cwd();
    if (!this.isValidDirectory(startCwd)) {
      startCwd = os.homedir();
    }

    const cols = Math.max(10, opts.cols || 80);
    const rows = Math.max(5, opts.rows || 24);

    const env: Record<string, string> = {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      TERM_PROGRAM: 'NexCode-IDE',
      TERM_PROGRAM_VERSION: '3.5.7',
      LANG: process.env.LANG || 'en_US.UTF-8',
      LC_ALL: process.env.LC_ALL || 'en_US.UTF-8',
      ...profile.env,
    };

    let ptyProc: PtyModule.IPty;
    try {
      ptyProc = pty.spawn(profile.exe, profile.args, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: startCwd,
        env,
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      // Fallback attempt with bash or default system shell
      try {
        const fallbackExe = process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || '/bin/sh');
        ptyProc = pty.spawn(fallbackExe, [], {
          name: 'xterm-256color',
          cols,
          rows,
          cwd: os.homedir(),
          env,
        });
      } catch (fallbackErr: unknown) {
        const finalMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        if (!window.isDestroyed()) {
          window.webContents.send('terminal:data', {
            id,
            data: `\r\n\x1b[31;1m[Failed to spawn terminal: ${errMsg} | Fallback failed: ${finalMsg}]\x1b[0m\r\n`,
          });
        }
        return -1;
      }
    }

    const session: TerminalSession = {
      id,
      ptyProcess: ptyProc,
      shell: profile.kind,
      shellName: profile.name,
      title: profile.name,
      cwd: startCwd,
    };
    this.sessions.set(id, session);

    ptyProc.onData((data: string) => {
      if (window.isDestroyed()) return;

      // Extract CWD from OSC 7 escape sequence if emitted by modern shells
      const osc7Match = data.match(/\x1b\]7;file:\/\/[^/]*([^\x1b\x07]+)(?:\x1b\\|\x07)/);
      if (osc7Match && osc7Match[1]) {
        try {
          const rawPath = decodeURIComponent(osc7Match[1]);
          const normalized = process.platform === 'win32' && rawPath.startsWith('/') ? rawPath.slice(1) : rawPath;
          if (this.isValidDirectory(normalized) && session.cwd !== normalized) {
            session.cwd = normalized;
            window.webContents.send('terminal:cwd', { id, cwd: normalized });
          }
        } catch {
          /* ignore decoding errors */
        }
      }

      // Extract title from OSC 0 or OSC 2
      const titleMatch = data.match(/\x1b\](?:0|2);([^\x1b\x07]+)(?:\x1b\\|\x07)/);
      if (titleMatch && titleMatch[1]) {
        let raw = titleMatch[1].trim();
        if (raw.includes('@') && raw.includes(':')) {
          const colon = raw.lastIndexOf(':');
          const p = raw.slice(colon + 1).trim();
          const folder = p.replace(/^~[\\/]?/, '').split(/[\\/]/).filter(Boolean).pop();
          raw = folder ? `${session.shell}: ${folder}` : session.shell;
        }
        if (raw && session.title !== raw) {
          session.title = raw;
          window.webContents.send('terminal:title', { id, title: raw });
        }
      }

      window.webContents.send('terminal:data', { id, data });
    });

    ptyProc.onExit(({ exitCode, signal }) => {
      if (!window.isDestroyed()) {
        window.webContents.send('terminal:exit', { id, exitCode, signal });
      }
      this.sessions.delete(id);
    });

    return id;
  }

  write(id: number, data: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    try {
      session.ptyProcess.write(data);
    } catch {
      /* process may already be closed */
    }
  }

  resize(id: number, cols: number, rows: number): void {
    const session = this.sessions.get(id);
    if (!session) return;
    if (cols <= 0 || rows <= 0) return;
    try {
      session.ptyProcess.resize(Math.max(1, cols), Math.max(1, rows));
    } catch {
      /* process may already be closed */
    }
  }

  kill(id: number): void {
    const session = this.sessions.get(id);
    if (!session) return;
    try {
      session.ptyProcess.kill();
    } catch {
      /* already terminated */
    }
    this.sessions.delete(id);
  }

  killAll(): void {
    for (const session of this.sessions.values()) {
      try {
        session.ptyProcess.kill();
      } catch {
        /* already terminated */
      }
    }
    this.sessions.clear();
  }

  listAvailableShells(): TerminalShellInfo[] {
    return getAvailableShells();
  }

  private isValidDirectory(dirPath: string): boolean {
    try {
      return existsSync(dirPath) && statSync(dirPath).isDirectory();
    } catch {
      return false;
    }
  }
}

/**
 * Integrated terminal — spawns cmd.exe, PowerShell, or bash via child_process.
 */
import { type BrowserWindow } from 'electron';
import { execSync, spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { existsSync, statSync } from 'fs';
import type { TerminalShell } from '../../shared/types';
import { getSettings } from '../settings/store';
import {
  parseCmdPromptCwd,
  parsePowerShellPromptCwd,
  stripCwdOsc,
} from './cwdProtocol';
import { resolveShellProfile } from './shellConfig';
import {
  createTerminalDecoder,
  decodeTerminalChunk,
  encodeTerminalInput,
  flushTerminalDecoder,
  type TerminalStreamDecoder,
} from './terminalEncoding';

interface TerminalSession {
  id: number;
  process: ChildProcessWithoutNullStreams;
  shell: TerminalShell;
  decoder: TerminalStreamDecoder;
}

export class TerminalManager {
  private sessions = new Map<number, TerminalSession>();
  private lastCwd = new Map<number, string>();
  private nextId = 1;

  create(window: BrowserWindow, cwd?: string): number {
    const id = this.nextId++;
    const shell = getSettings().terminalShell;
    const profile = resolveShellProfile(shell);

    const proc = spawn(profile.exe, profile.args, {
      cwd: cwd || process.cwd(),
      env: {
        ...process.env,
        PYTHONUTF8: '1',
        PYTHONIOENCODING: 'utf-8',
        LANG: 'en_US.UTF-8',
        LC_ALL: 'en_US.UTF-8',
      },
      windowsHide: true,
    });

    const decoder = createTerminalDecoder(profile.stdioEncoding);
    this.sessions.set(id, { id, process: proc, shell, decoder });

    const emitCwd = (cwdPath: string) => {
      if (window.isDestroyed() || !cwdPath) return;
      if (!isExistingDirectory(cwdPath)) return;
      if (this.lastCwd.get(id) === cwdPath) return;
      this.lastCwd.set(id, cwdPath);
      window.webContents.send('terminal:cwd', { id, cwd: cwdPath });
    };

    const sendOutput = (chunk: string) => {
      if (window.isDestroyed()) return;
      const { output, cwd } = stripCwdOsc(chunk);
      if (cwd) emitCwd(cwd);

      let promptCwd: string | null = null;
      if (profile.kind === 'powershell') promptCwd = parsePowerShellPromptCwd(output);
      else if (profile.kind === 'cmd') promptCwd = parseCmdPromptCwd(output);

      if (promptCwd) emitCwd(promptCwd);
      if (output) window.webContents.send('terminal:data', { id, data: output });
    };

    const onChunk = (buf: Buffer) => {
      const text = decodeTerminalChunk(decoder, buf);
      if (text) sendOutput(text);
    };

    proc.stdout.on('data', onChunk);
    proc.stderr.on('data', onChunk);

    if (profile.init) proc.stdin.write(encodeTerminalInput(shell, profile.init));

    proc.on('error', (err) => {
      sendOutput(`\r\n[Failed to start ${profile.exe}: ${err.message}]\r\n`);
      this.sessions.delete(id);
      this.lastCwd.delete(id);
    });

    proc.on('exit', () => {
      const tail = flushTerminalDecoder(decoder);
      if (tail) sendOutput(tail);
      sendOutput('\r\n[Process exited]\r\n');
      this.sessions.delete(id);
      this.lastCwd.delete(id);
    });

    return id;
  }

  write(id: number, data: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    session.process.stdin.write(encodeTerminalInput(session.shell, data));
  }

  resize(_id: number, _cols: number, _rows: number): void {
    // Resize not supported without node-pty; placeholder for future extension
  }

  kill(id: number): void {
    const session = this.sessions.get(id);
    if (!session) return;
    this.terminateProcess(session.process);
    this.sessions.delete(id);
    this.lastCwd.delete(id);
  }

  /** Terminate every shell session (cmd.exe, PowerShell, bash) — call on app quit. */
  killAll(): void {
    for (const session of this.sessions.values()) {
      this.terminateProcess(session.process);
    }
    this.sessions.clear();
    this.lastCwd.clear();
  }

  private terminateProcess(proc: ChildProcessWithoutNullStreams): void {
    const pid = proc.pid;
    if (pid == null) return;

    try {
      if (process.platform === 'win32') {
        // /T kills child processes (e.g. programs started from CMD)
        execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore', windowsHide: true });
      } else {
        proc.kill('SIGTERM');
      }
    } catch {
      try {
        proc.kill('SIGKILL');
      } catch {
        /* already exited */
      }
    }
  }
}

function isExistingDirectory(filePath: string): boolean {
  try {
    return existsSync(filePath) && statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

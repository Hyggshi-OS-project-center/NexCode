/**
 * Decode/encode integrated terminal I/O on Windows (chunk-safe, shell-aware).
 */
import { StringDecoder } from 'string_decoder';
import type { TerminalShell } from '../../shared/types';
import { POWERSHELL_PIPED_PROMPT_HOOK } from './cwdProtocol';

export type TerminalStdioEncoding = BufferEncoding;

/** CMD: quiet session + UTF-8 code page (spawn args — avoids echoing init on stdin) */
export const CMD_STARTUP_ARGS = ['/Q', '/K', 'chcp 65001 >nul'] as const;

/** @deprecated Use CMD_STARTUP_ARGS */
export const CMD_UTF8_INIT = '@chcp 65001>nul\r\n';

export function isPwshExe(exe: string): boolean {
  return exe.toLowerCase().includes('pwsh');
}

/** Piped child_process sessions — UTF-8 after explicit shell setup (see startup scripts). */
export function stdioEncodingForShell(_shell: TerminalShell, _exe: string): TerminalStdioEncoding {
  return 'utf8';
}

function looksUtf16Le(buf: Buffer): boolean {
  const n = Math.min(buf.length, 128);
  if (n < 4) return false;
  let asciiNulls = 0;
  for (let i = 1; i < n; i += 2) {
    if (buf[i] === 0 && buf[i - 1] >= 0x20 && buf[i - 1] <= 0x7e) asciiNulls++;
  }
  return asciiNulls >= 4;
}

/** Detect UTF-16 LE / UTF-8 BOM on the first chunk, else fall back to preferred. */
export function resolveStreamEncoding(buf: Buffer, preferred: TerminalStdioEncoding): TerminalStdioEncoding {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return 'utf16le';
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return 'utf8';
  if (looksUtf16Le(buf)) return 'utf16le';
  return preferred;
}

export interface TerminalStreamDecoder {
  write(buf: Buffer): string;
  end(): string;
}

export function createTerminalDecoder(preferred: TerminalStdioEncoding = 'utf8'): TerminalStreamDecoder {
  let encoding = preferred;
  let decoder = new StringDecoder(encoding);
  let settled = preferred !== 'utf8';

  return {
    write(buf: Buffer): string {
      if (!settled && buf.length) {
        encoding = resolveStreamEncoding(buf, preferred);
        settled = true;
        if (encoding !== preferred) decoder = new StringDecoder(encoding);
      }
      return decoder.write(buf);
    },
    end(): string {
      return decoder.end();
    },
  };
}

/** Base64 -EncodedCommand (UTF-16 LE script) — runs silently, no stdin echo */
export function toPowerShellEncodedCommand(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64');
}

/** UTF-8 console + prompt text only (no OSC on stdout — avoids mojibake in piped mode) */
export function buildPowerShellEncodedStartup(_exe: string): string {
  const script =
    '$__nc=[System.Text.UTF8Encoding]::new($false);' +
    '[Console]::InputEncoding=[Console]::OutputEncoding=$__nc;' +
    '$OutputEncoding=$__nc;' +
    POWERSHELL_PIPED_PROMPT_HOOK;
  return toPowerShellEncodedCommand(script);
}

export function decodeTerminalChunk(decoder: TerminalStreamDecoder, buf: Buffer): string {
  if (!buf.length) return '';
  return decoder.write(buf);
}

export function flushTerminalDecoder(decoder: TerminalStreamDecoder): string {
  return decoder.end();
}

/** stdin.write(string) — UTF-8 bytes for the shell */
export function encodeTerminalInput(_shell: TerminalShell, data: string): Buffer {
  return Buffer.from(data, 'utf8');
}

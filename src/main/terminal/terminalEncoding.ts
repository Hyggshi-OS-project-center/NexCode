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

/**
 * Detect encoding from the first chunk of shell output.
 *
 * Only BOM bytes are used as evidence — the previous heuristic (`looksUtf16Le`)
 * was too aggressive: the initial CMD banner (printed in the system OEM
 * encoding before `chcp 65001` takes effect) could contain byte patterns that
 * looked like UTF-16 LE, permanently switching the decoder and corrupting
 * all subsequent output.
 *
 * BOM detection is still useful for edge cases (e.g. PowerShell scripts that
 * emit a UTF-16 LE BOM), so we keep those two checks.
 */
export function resolveStreamEncoding(
  buf: Buffer,
  preferred: TerminalStdioEncoding,
): TerminalStdioEncoding {
  // UTF-16 LE BOM: FF FE
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return 'utf16le';
  // UTF-8 BOM: EF BB BF
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return 'utf8';
  // No BOM — trust the encoding that the shell startup script configured
  return preferred;
}

export interface TerminalStreamDecoder {
  write(buf: Buffer): string;
  end(): string;
}

export function createTerminalDecoder(
  preferred: TerminalStdioEncoding = 'utf8',
): TerminalStreamDecoder {
  let encoding = preferred;
  let decoder = new StringDecoder(encoding);
  // Always inspect the first chunk for a BOM, then commit to an encoding.
  let settled = false;

  return {
    write(buf: Buffer): string {
      if (!settled && buf.length) {
        const detected = resolveStreamEncoding(buf, preferred);
        settled = true;
        if (detected !== encoding) {
          encoding = detected;
          decoder = new StringDecoder(encoding);
        }
        // Strip BOM bytes so they don't appear in the terminal output
        if (encoding === 'utf16le' && buf[0] === 0xff && buf[1] === 0xfe) {
          return decoder.write(buf.slice(2));
        }
        if (encoding === 'utf8' && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
          return decoder.write(buf.slice(3));
        }
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
    // Force UTF-8 on all console I/O streams
    '$__nc=[System.Text.UTF8Encoding]::new($false);' +
    '[Console]::InputEncoding=[Console]::OutputEncoding=$__nc;' +
    '$OutputEncoding=$__nc;' +
    // PSReadLine tweaks for piped/non-PTY sessions:
    //   - BellStyle None     — silence the bell (avoids stray \x07 bytes)
    //   - ViModeIndicator None — suppress VT cursor-shape changes (ESC[5q etc.)
    // Wrapped in try/catch so it is safe on PS 2.x / Server Core without PSReadLine.
    'try{Set-PSReadLineOption -BellStyle None -ViModeIndicator None}catch{};' +
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

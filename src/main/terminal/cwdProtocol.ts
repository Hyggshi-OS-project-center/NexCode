/**
 * Terminal CWD reporting — custom OSC so renderer can sync the file explorer with `cd`.
 * Format: ESC ] 65432 ; Cwd=<path> ESC \
 */
const CWD_OSC_RE = /\x1b\]65432;Cwd=([^\x07\x1b]+)\x1b\\/g;

/**
 * PowerShell prompt for piped terminals (no OSC — OSC bytes show as mojibake without a real TTY).
 * CWD is parsed from `PS path>` lines in TerminalManager.
 */
export const POWERSHELL_PIPED_PROMPT_HOOK =
  'function global:prompt { "PS $((Get-Location).ProviderPath)> " }';

/** OSC prompt hook — only for real TTY / bash where escape stripping works reliably */
export const POWERSHELL_PROMPT_HOOK =
  'function global:prompt { $p=(Get-Location).ProviderPath; $e=[char]27; $b=[char]92; [Console]::Out.Write("$e]65432;Cwd=$p$e$b"); "PS $p> " }';

/** @deprecated Use POWERSHELL_PIPED_PROMPT_HOOK + buildPowerShellEncodedStartup */
export const POWERSHELL_CWD_PROMPT_INIT = `${POWERSHELL_PIPED_PROMPT_HOOK}\r\n`;

/** Bash prompt hook (non-Windows shells) */
export const BASH_CWD_PROMPT_INIT =
  "export PS1='\\[\\033]65432;Cwd='\"\\$(pwd)\"'\\033\\\\\\]\\u@\\h:\\w\\$ '\r\n";

export function stripCwdOsc(data: string): { output: string; cwd: string | null } {
  let cwd: string | null = null;
  const output = data.replace(CWD_OSC_RE, (_match, raw: string) => {
    const path = raw.trim();
    if (path) cwd = path;
    return '';
  });
  return { output, cwd };
}

/** Fallback: parse default PowerShell prompt lines when OSC hook is unavailable */
export function parsePowerShellPromptCwd(data: string): string | null {
  const matches = [...data.matchAll(/(?:^|\r?\n)PS\s+((?:[A-Za-z]:)?[^\r\n>]+)>\s*/g)];
  const last = matches.at(-1);
  return last?.[1]?.trim() ?? null;
}

/** Parse classic CMD prompt: C:\Users\You\project> */
export function parseCmdPromptCwd(data: string): string | null {
  const matches = [
    ...data.matchAll(/(?:^|\r?\n)([A-Za-z]:)([^\r\n>]*)>\s*/g),
  ];
  const last = matches.at(-1);
  if (!last) return null;
  const drive = last[1];
  const rest = last[2].trim();
  return rest ? `${drive}${rest.startsWith('\\') ? '' : '\\'}${rest}` : `${drive}\\`;
}

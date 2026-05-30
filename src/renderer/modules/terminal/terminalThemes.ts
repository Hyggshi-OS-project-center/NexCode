/**
 * xterm.js themes — follow IDE light/dark workbench; CMD keeps classic colors in dark only.
 */
import type { ITheme } from '@xterm/xterm';
import type { TerminalShell } from '../../../shared/types';

export type UiTheme = 'light' | 'dark';

/** Classic Windows CMD (dark UI only) */
export const CMD_DARK_THEME: ITheme = {
  background: '#0c0c0c',
  foreground: '#cccccc',
  cursor: '#cccccc',
  cursorAccent: '#0c0c0c',
  selectionBackground: '#264f78',
  selectionForeground: '#ffffff',
  black: '#0c0c0c',
  red: '#c50f1f',
  green: '#13a10e',
  yellow: '#c19c00',
  blue: '#0037da',
  magenta: '#881798',
  cyan: '#3a96dd',
  white: '#cccccc',
  brightBlack: '#767676',
  brightRed: '#e74856',
  brightGreen: '#16c60c',
  brightYellow: '#f9f1a5',
  brightBlue: '#3b78ff',
  brightMagenta: '#b4009e',
  brightCyan: '#61d6d6',
  brightWhite: '#f2f2f2',
};

/** CMD-style ANSI on a light panel */
export const CMD_LIGHT_THEME: ITheme = {
  background: '#ffffff',
  foreground: '#333333',
  cursor: '#333333',
  cursorAccent: '#ffffff',
  selectionBackground: '#add6ff',
  selectionForeground: '#333333',
  black: '#000000',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#ffffff',
};

/** PowerShell / generic — dark workbench */
export const IDE_TERMINAL_DARK: ITheme = {
  background: '#1e1e1e',
  foreground: '#cccccc',
  cursor: '#aeafad',
  cursorAccent: '#1e1e1e',
  selectionBackground: '#264f78',
  selectionForeground: '#ffffff',
};

/** PowerShell / generic — light workbench */
export const IDE_TERMINAL_LIGHT: ITheme = {
  background: '#ffffff',
  foreground: '#333333',
  cursor: '#333333',
  cursorAccent: '#ffffff',
  selectionBackground: '#add6ff',
  selectionForeground: '#333333',
};

/** Modern Windows PowerShell — dark UI */
export const POWERSHELL_DARK_THEME: ITheme = {
  background: '#012456',
  foreground: '#eeeeee',
  cursor: '#f9f1a5', // signature yellow cursor
  cursorAccent: '#012456',
  selectionBackground: '#0a3a75',
  selectionForeground: '#ffffff',
  black: '#0c0c0c',
  red: '#c50f1f',
  green: '#13a10e',
  yellow: '#c19c00',
  blue: '#0037da',
  magenta: '#881798',
  cyan: '#3a96dd',
  white: '#cccccc',
  brightBlack: '#767676',
  brightRed: '#e74856',
  brightGreen: '#16c60c',
  brightYellow: '#f9f1a5',
  brightBlue: '#3b78ff',
  brightMagenta: '#b4009e',
  brightCyan: '#61d6d6',
  brightWhite: '#f2f2f2',
};

/** Modern Windows PowerShell — light UI */
export const POWERSHELL_LIGHT_THEME: ITheme = {
  background: '#eef4fc',
  foreground: '#012456',
  cursor: '#012456',
  cursorAccent: '#eef4fc',
  selectionBackground: '#add6ff',
  selectionForeground: '#012456',
  black: '#000000',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#ffffff',
};

/** Modern Unix Bash — dark UI */
export const BASH_DARK_THEME: ITheme = {
  background: '#12171f', // sleek dark slate
  foreground: '#e6ebf1',
  cursor: '#10b981', // emerald green cursor
  cursorAccent: '#12171f',
  selectionBackground: '#2d3748',
  selectionForeground: '#ffffff',
  black: '#1a1f26',
  red: '#f87171',
  green: '#34d399',
  yellow: '#fbbf24',
  blue: '#60a5fa',
  magenta: '#f472b6',
  cyan: '#2dd4bf',
  white: '#f3f4f6',
  brightBlack: '#4b5563',
  brightRed: '#ef4444',
  brightGreen: '#10b981',
  brightYellow: '#f59e0b',
  brightBlue: '#3b82f6',
  brightMagenta: '#ec4899',
  brightCyan: '#14b8a6',
  brightWhite: '#ffffff',
};

/** Modern Unix Bash — light UI */
export const BASH_LIGHT_THEME: ITheme = {
  background: '#f8fafc',
  foreground: '#0f172a',
  cursor: '#0f172a',
  cursorAccent: '#f8fafc',
  selectionBackground: '#cbd5e1',
  selectionForeground: '#0f172a',
  black: '#0f172a',
  red: '#dc2626',
  green: '#16a34a',
  yellow: '#d97706',
  blue: '#2563eb',
  magenta: '#c026d3',
  cyan: '#0891b2',
  white: '#cbd5e1',
  brightBlack: '#64748b',
  brightRed: '#ef4444',
  brightGreen: '#22c55e',
  brightYellow: '#eab308',
  brightBlue: '#3b82f6',
  brightMagenta: '#d946ef',
  brightCyan: '#06b6d4',
  brightWhite: '#f8fafc',
};

export function getTerminalTheme(shell: TerminalShell, uiTheme: UiTheme): ITheme {
  if (uiTheme === 'light') {
    if (shell === 'cmd') return CMD_LIGHT_THEME;
    if (shell === 'powershell') return POWERSHELL_LIGHT_THEME;
    if (shell === 'bash') return BASH_LIGHT_THEME;
    return IDE_TERMINAL_LIGHT;
  }
  if (shell === 'cmd') return CMD_DARK_THEME;
  if (shell === 'powershell') return POWERSHELL_DARK_THEME;
  if (shell === 'bash') return BASH_DARK_THEME;
  return IDE_TERMINAL_DARK;
}

export function getTerminalFontFamily(shell: TerminalShell): string {
  if (shell === 'cmd') {
    // "Cascadia Mono" and "Noto Sans Mono" cover Unicode ranges (Vietnamese,
    // CJK, emoji fallback) that Consolas / Lucida Console / Courier New miss.
    // Listed after Consolas so the classic CMD look is preserved on systems
    // that already have Consolas; broader Unicode support activates elsewhere.
    return 'Consolas, "Cascadia Mono", "Cascadia Code", "Noto Sans Mono", "Lucida Console", "Courier New", monospace';
  }
  return 'Consolas, "Cascadia Mono", "Cascadia Code", "Noto Sans Mono", monospace';
}

export function getTerminalPanelTitle(shell: TerminalShell): string {
  switch (shell) {
    case 'cmd':
      return 'COMMAND PROMPT';
    case 'powershell':
      return 'POWERSHELL';
    default:
      return 'TERMINAL';
  }
}

export function getDefaultPromptLabel(shell: TerminalShell): string {
  if (shell === 'cmd') return 'C:\\>';
  if (shell === 'powershell') return 'PS>';
  return '$';
}

/**
 * xterm.js themes — follow IDE light/dark workbench; CMD keeps classic colors in dark only.
 */
import type { ITheme } from '@xterm/xterm';
import type { AppTheme, TerminalShell } from '../../../shared/types';

export type UiTheme = AppTheme;

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

export const IDE_TERMINAL_CUTE: ITheme = {
  background: '#fff7fb',
  foreground: '#4a3441',
  cursor: '#d14f85',
  cursorAccent: '#fff7fb',
  selectionBackground: '#ffd4e6',
  selectionForeground: '#4a3441',
  black: '#4a3441',
  red: '#c94f6d',
  green: '#4f9a74',
  yellow: '#b8842b',
  blue: '#5b7fcf',
  magenta: '#c45aa0',
  cyan: '#3f9d9a',
  white: '#f5dce8',
  brightBlack: '#8a6677',
  brightRed: '#e66d8a',
  brightGreen: '#62b98d',
  brightYellow: '#d7a647',
  brightBlue: '#7599ed',
  brightMagenta: '#df77bb',
  brightCyan: '#58bab6',
  brightWhite: '#ffffff',
};

export const IDE_TERMINAL_MIDNIGHT: ITheme = {
  background: '#10131f',
  foreground: '#d8e3ff',
  cursor: '#7dd3fc',
  cursorAccent: '#10131f',
  selectionBackground: '#33446f',
  selectionForeground: '#ffffff',
  black: '#10131f',
  red: '#fb7185',
  green: '#34d399',
  yellow: '#fbbf24',
  blue: '#60a5fa',
  magenta: '#c084fc',
  cyan: '#22d3ee',
  white: '#d8e3ff',
  brightBlack: '#64748b',
  brightRed: '#fda4af',
  brightGreen: '#86efac',
  brightYellow: '#fde68a',
  brightBlue: '#93c5fd',
  brightMagenta: '#d8b4fe',
  brightCyan: '#67e8f9',
  brightWhite: '#ffffff',
};

export const IDE_TERMINAL_FOREST: ITheme = {
  background: '#14201b',
  foreground: '#d7e7dc',
  cursor: '#9ee7b8',
  cursorAccent: '#14201b',
  selectionBackground: '#315846',
  selectionForeground: '#ffffff',
  black: '#14201b',
  red: '#e06c75',
  green: '#87d49a',
  yellow: '#d8b86a',
  blue: '#7bb6d9',
  magenta: '#c59ad6',
  cyan: '#70d6c7',
  white: '#d7e7dc',
  brightBlack: '#6c8f79',
  brightRed: '#f08a91',
  brightGreen: '#a6efb7',
  brightYellow: '#efd486',
  brightBlue: '#98d3f1',
  brightMagenta: '#ddb4ee',
  brightCyan: '#91f1e2',
  brightWhite: '#ffffff',
};

export const IDE_TERMINAL_ROSE: ITheme = {
  background: '#fffaf7',
  foreground: '#46342e',
  cursor: '#b45f4d',
  cursorAccent: '#fffaf7',
  selectionBackground: '#f4d7cc',
  selectionForeground: '#46342e',
  black: '#46342e',
  red: '#b84f42',
  green: '#5c8a64',
  yellow: '#a87931',
  blue: '#5f7fba',
  magenta: '#a25d8f',
  cyan: '#4f918a',
  white: '#eadbd4',
  brightBlack: '#8a6d64',
  brightRed: '#d96f60',
  brightGreen: '#75a87d',
  brightYellow: '#c6954b',
  brightBlue: '#7899d8',
  brightMagenta: '#bf78aa',
  brightCyan: '#68ada6',
  brightWhite: '#ffffff',
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
  if (uiTheme === 'cute') return IDE_TERMINAL_CUTE;
  if (uiTheme === 'midnight') return IDE_TERMINAL_MIDNIGHT;
  if (uiTheme === 'forest') return IDE_TERMINAL_FOREST;
  if (uiTheme === 'rose') return IDE_TERMINAL_ROSE;
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

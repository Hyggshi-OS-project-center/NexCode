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

export function getTerminalTheme(shell: TerminalShell, uiTheme: UiTheme): ITheme {
  if (uiTheme === 'light') {
    return shell === 'cmd' ? CMD_LIGHT_THEME : IDE_TERMINAL_LIGHT;
  }
  return shell === 'cmd' ? CMD_DARK_THEME : IDE_TERMINAL_DARK;
}

export function getTerminalFontFamily(shell: TerminalShell): string {
  if (shell === 'cmd') {
    return 'Consolas, "Lucida Console", "Courier New", monospace';
  }
  return 'Consolas, "Cascadia Mono", "Cascadia Code", monospace';
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

/** Shortcut action ids sent from main process (before-input-event) to renderer */
export type ShortcutAction =
  | 'save'
  | 'saveAs'
  | 'find'
  | 'replace'
  | 'toggleTerminal'
  | 'openFile'
  | 'openFolder'
  | 'run'
  | 'openNexCat';

export function shortcutFromInput(input: {
  control?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  key: string;
}): ShortcutAction | null {
  const mod = input.control || input.meta;
  const key = input.key.toLowerCase();
  if (key === 'f5') return 'run';

  if (!mod) return null;

  if (key === 's' && input.shift) return 'saveAs';
  if (key === 's') return 'save';
  if (key === 'f') return 'find';
  if (key === 'h') return 'replace';
  if (key === 'n' && input.shift && input.alt) return 'openNexCat';
  if (key === '`' || key === '~') return 'toggleTerminal';
  if (key === 'o' && input.shift) return 'openFolder';
  if (key === 'o' && !input.shift) return 'openFile';
  return null;
}

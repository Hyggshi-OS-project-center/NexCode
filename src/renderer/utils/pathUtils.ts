/** Path helpers for renderer (Windows-friendly). */
export function joinPath(base: string, name: string): string {
  const sep = base.includes('\\') ? '\\' : '/';
  const trimmed = base.endsWith(sep) || base.endsWith('/') ? base.slice(0, -1) : base;
  return `${trimmed}${sep}${name}`;
}

export function basename(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || filePath;
}

export function parentDir(filePath: string): string {
  const idx = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'));
  return idx > 0 ? filePath.slice(0, idx) : filePath;
}

/** Case-insensitive path compare on Windows */
export function pathsEqual(a: string, b: string): boolean {
  const na = a.replace(/\//g, '\\').replace(/\\+$/, '');
  const nb = b.replace(/\//g, '\\').replace(/\\+$/, '');
  return na.toLowerCase() === nb.toLowerCase();
}

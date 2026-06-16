/** Path helpers for renderer (Windows-friendly). */
export function joinPath(base: string, name: string): string {
  const sep = base.includes('\\') || name.includes('\\') ? '\\' : '/';
  const baseNorm = base.replace(/\//g, sep);
  const nameNorm = name.replace(/\//g, sep);

  if (/^[a-zA-Z]:[\\/]/.test(nameNorm) || nameNorm.startsWith('\\\\')) {
    return normalizePath(nameNorm, sep);
  }

  const trimmed = baseNorm.endsWith(sep) ? baseNorm.slice(0, -1) : baseNorm;
  return normalizePath(`${trimmed}${sep}${nameNorm}`, sep);
}

export function basename(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || filePath;
}

export function parentDir(filePath: string): string {
  const idx = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'));
  return idx > 0 ? filePath.slice(0, idx) : filePath;
}

function normalizePath(input: string, sep: '\\' | '/'): string {
  const prefixMatch = input.match(/^[a-zA-Z]:[\\/]|^\\\\/);
  const prefix = prefixMatch?.[0] ?? '';
  const rest = input.slice(prefix.length).split(/[\\/]+/);
  const stack: string[] = [];

  for (const part of rest) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (stack.length > 0 && stack[stack.length - 1] !== '..') stack.pop();
      else if (!prefix) stack.push('..');
      continue;
    }
    stack.push(part);
  }

  return prefix + stack.join(sep);
}

/** Case-insensitive path compare on Windows */
export function pathsEqual(a: string, b: string): boolean {
  const na = a.replace(/\//g, '\\').replace(/\\+$/, '');
  const nb = b.replace(/\//g, '\\').replace(/\\+$/, '');
  return na.toLowerCase() === nb.toLowerCase();
}

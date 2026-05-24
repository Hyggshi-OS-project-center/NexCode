/**
 * Supported local extension manifests:
 * - .vsix (JSON manifest)
 * - .hsixet (INI-like manifest)
 */
export interface VsixCommandContribution {
  id: string;
  title: string;
}

export interface VsixExtensionManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  commands?: VsixCommandContribution[];
}

export const VSIX_EXTENSION = 'vsix';
export const HSIXET_EXTENSION = 'hsixet';

export function isVsixFile(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(`.${VSIX_EXTENSION}`) || lower.endsWith(`.${HSIXET_EXTENSION}`);
}

export function parseVsixManifest(raw: string): VsixExtensionManifest {
  const trimmed = raw.trim();

  // JSON (.vsix) format
  if (trimmed.startsWith('{')) {
    const data = JSON.parse(trimmed) as VsixExtensionManifest;
    if (!data.id || !data.name || !data.version) {
      throw new Error('Invalid .vsix manifest: id, name, and version are required');
    }
    return data;
  }

  // INI-like (.hsixet) format
  // Example:
  // id=my.extension
  // name=My Extension
  // version=1.0.0
  // author=You
  // description=Demo
  // commands=format:Format File|run:Run Script
  const map = new Map<string, string>();
  for (const line of trimmed.split(/\r?\n/)) {
    const text = line.trim();
    if (!text || text.startsWith(';') || text.startsWith('#') || text.startsWith('[')) continue;
    const eq = text.indexOf('=');
    if (eq <= 0) continue;
    const key = text.slice(0, eq).trim().toLowerCase();
    const value = text.slice(eq + 1).trim();
    map.set(key, value);
  }

  const id = map.get('id') ?? '';
  const name = map.get('name') ?? '';
  const version = map.get('version') ?? '';
  if (!id || !name || !version) {
    throw new Error('Invalid extension manifest: id, name, and version are required');
  }

  const commandsRaw = map.get('commands') ?? '';
  const commands: VsixCommandContribution[] = commandsRaw
    ? commandsRaw
        .split('|')
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => {
          const [cmdId, cmdTitle] = item.split(':');
          return {
            id: (cmdId ?? '').trim(),
            title: (cmdTitle ?? cmdId ?? '').trim(),
          };
        })
        .filter((cmd) => cmd.id)
    : [];

  return {
    id,
    name,
    version,
    author: map.get('author'),
    description: map.get('description'),
    commands,
  };
}

/**
 * Supported local extension manifests:
 * - .vsix  — ZIP archive chứa extension/package.json (VSCode format)
 * - .hsixet — INI-like manifest (NexCode native format)
 */
import { unzipSync, strFromU8 } from 'fflate';

export interface VsixCommandContribution {
  id: string;
  title: string;
  category?: string;
  /** VSCode raw field alias — normalized to id on parse */
  command?: string;
}

export interface VsixExtensionManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  main?: string;
  activationEvents?: string[];
  contributes?: {
    commands?: VsixCommandContribution[];
  };
  commands?: VsixCommandContribution[];
}

export const VSIX_EXTENSION = 'vsix';
export const HSIXET_EXTENSION = 'hsixet';

export function isVsixFile(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(`.${VSIX_EXTENSION}`) || lower.endsWith(`.${HSIXET_EXTENSION}`);
}

/**
 * Parse manifest từ raw bytes (Uint8Array) hoặc plain text (string).
 *
 * - .vsix  → ZIP → đọc extension/package.json bên trong
 * - .hsixet → INI-like text
 */
export function parseVsixManifest(raw: Uint8Array | string): VsixExtensionManifest {
  // ── .vsix: ZIP archive ──────────────────────────────────────────────────────
  if (isZipBytes(raw)) {
    return parseFromZip(raw as Uint8Array);
  }

  const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
  const trimmed = text.trim();

  // ── Plain JSON (non-zip .vsix hoặc direct JSON) ─────────────────────────────
  if (trimmed.startsWith('{')) {
    return parseFromJson(trimmed);
  }

  // ── .hsixet INI-like ────────────────────────────────────────────────────────
  return parseFromIni(trimmed);
}

// ── ZIP (real .vsix) ─────────────────────────────────────────────────────────

function isZipBytes(raw: Uint8Array | string): boolean {
  if (typeof raw === 'string') return false;
  // ZIP magic: PK (0x50 0x4B)
  return raw.length > 2 && raw[0] === 0x50 && raw[1] === 0x4b;
}

function parseFromZip(bytes: Uint8Array): VsixExtensionManifest {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch (e) {
    throw new Error(`Failed to unzip .vsix: ${(e as Error).message}`);
  }

  // VSCode .vsix lưu manifest tại extension/package.json
  const entry = files['extension/package.json'];
  if (!entry) {
    throw new Error(
      'Invalid .vsix: missing extension/package.json inside ZIP. ' +
      `Found entries: ${Object.keys(files).slice(0, 8).join(', ')}`
    );
  }

  return parseFromJson(strFromU8(entry));
}

// ── JSON ─────────────────────────────────────────────────────────────────────

function parseFromJson(text: string): VsixExtensionManifest {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error('Invalid .vsix manifest: malformed JSON');
  }

  // VSCode dùng "publisher" + "name" thay vì "id"
  // Synthesize id nếu thiếu
  if (!data['id'] && data['publisher'] && data['name']) {
    data['id'] = `${data['publisher']}.${data['name']}`;
  }

  const id = (data['id'] as string | undefined) ?? '';
  const name = (data['name'] as string | undefined) ?? '';
  const version = (data['version'] as string | undefined) ?? '';

  if (!id || !name || !version) {
    throw new Error(
      `Invalid extension manifest: missing ${[!id && 'id', !name && 'name', !version && 'version'].filter(Boolean).join(', ')}`
    );
  }

  const manifest: VsixExtensionManifest = {
    id,
    name,
    version,
    description: data['description'] as string | undefined,
    author: typeof data['author'] === 'string'
      ? data['author']
      : (data['author'] as { name?: string } | undefined)?.name,
    main: data['main'] as string | undefined,
    activationEvents: data['activationEvents'] as string[] | undefined,
    contributes: data['contributes'] as VsixExtensionManifest['contributes'],
  };

  manifest.commands = normalizeCommands(manifest);
  return manifest;
}

// ── INI-like (.hsixet) ────────────────────────────────────────────────────────

function parseFromIni(text: string): VsixExtensionManifest {
  const map = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith(';') || t.startsWith('#') || t.startsWith('[')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    map.set(t.slice(0, eq).trim().toLowerCase(), t.slice(eq + 1).trim());
  }

  const id = map.get('id') ?? '';
  const name = map.get('name') ?? '';
  const version = map.get('version') ?? '';

  if (!id || !name || !version) {
    throw new Error(
      `Invalid .hsixet manifest: missing ${[!id && 'id', !name && 'name', !version && 'version'].filter(Boolean).join(', ')}`
    );
  }

  const commandsRaw = map.get('commands') ?? '';
  const commands: VsixCommandContribution[] = commandsRaw
    ? commandsRaw
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((item) => {
          const [cmdId, cmdTitle] = item.split(':');
          return { id: (cmdId ?? '').trim(), title: (cmdTitle ?? cmdId ?? '').trim() };
        })
        .filter((cmd) => cmd.id)
    : [];

  return {
    id,
    name,
    version,
    author: map.get('author'),
    description: map.get('description'),
    main: map.get('main'),
    activationEvents: splitList(map.get('activationevents')),
    commands,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeCommands(manifest: VsixExtensionManifest): VsixCommandContribution[] {
  const seen = new Set<string>();
  return [
    ...(manifest.commands ?? []),
    ...(manifest.contributes?.commands ?? []),
  ]
    .map((cmd) => {
      const raw = cmd as Record<string, any>;
      const id = (raw['id'] as string) || (raw['command'] as string) || '';
      const title = (raw['title'] as string) || id;
      return { id, title, category: raw['category'] as string | undefined, command: raw['command'] as string | undefined } as VsixCommandContribution;
    })
    .filter((cmd) => {
      if (!cmd.id || seen.has(cmd.id)) return false;
      seen.add(cmd.id);
      return true;
    });
}

function splitList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  return value.split(/[|,]/).map((s) => s.trim()).filter(Boolean);
}
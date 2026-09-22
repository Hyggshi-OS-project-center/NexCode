/**
 * Loads a project-level override for the Easter Egg window from
 * `<workspace>/.nexcode/custom/easter-egg.json`, so a project can point at
 * its own image(s) instead of the built-in art.
 *
 * Supported file shapes:
 *
 *   // one custom character
 *   { "image": "arisu.png" }
 *
 *   // several, plus whether to replace or add to the built-ins
 *   {
 *     "mode": "replace",
 *     "characters": [
 *       { "image": "arisu.png" },
 *       { "image": "myuser.png", "audio": "myuser-voice.mp3" }
 *     ]
 *   }
 *
 * `image`/`audio` paths may be given as:
 *   - relative to the workspace root (e.g. "./src/icons/Easter_Egg/Arisu.jpg",
 *     matching how the project's own files are usually referenced), or
 *   - relative to the `.nexcode/custom/` folder itself (so assets can just
 *     sit next to the json), or
 *   - an absolute path.
 * Whichever of these actually resolves to a real file wins. Missing or
 * unreadable files are silently skipped.
 */
import fs from 'fs/promises';
import path from 'path';
import { getExtension, getMediaKind, getMediaMime } from '../utils/fileKind';
import type { CustomEasterEggCharacter, CustomEasterEggConfig } from '../../shared/types';

const MAX_CHARACTERS = 20;

interface RawCharacter {
    image?: unknown;
    audio?: unknown;
}

function getCustomEasterEggPath(workspacePath: string): string {
    return path.join(workspacePath, '.nexcode', 'custom', 'easter-egg.json');
}

/** Resolves a path against each candidate base dir in order and reads the first one that exists, as a `data:` URL. */
async function resolveAsset(
    rawValue: unknown,
    baseDirs: string[],
    kind: 'image' | 'audio',
): Promise<string | null> {
    if (typeof rawValue !== 'string' || !rawValue.trim()) return null;

    const ext = getExtension(rawValue);
    if (getMediaKind(ext) !== kind) return null;

    const candidates = path.isAbsolute(rawValue) ? [rawValue] : baseDirs.map((dir) => path.join(dir, rawValue));

    for (const resolved of candidates) {
        try {
            const buf = await fs.readFile(resolved);
            return `data:${getMediaMime(ext)};base64,${buf.toString('base64')}`;
        } catch {
            // try the next candidate base dir
        }
    }
    return null;
}

async function toCharacter(raw: RawCharacter, baseDirs: string[]): Promise<CustomEasterEggCharacter | null> {
    const image = await resolveAsset(raw.image, baseDirs, 'image');
    if (!image) return null;
    const audio = await resolveAsset(raw.audio, baseDirs, 'audio');
    return audio ? { image, audio } : { image };
}

/** Returns null when the workspace has no (usable) custom Easter Egg config. */
export async function loadCustomEasterEggConfig(
    workspacePath: string | null,
): Promise<CustomEasterEggConfig | null> {
    if (!workspacePath) return null;

    const configPath = getCustomEasterEggPath(workspacePath);
    let raw: unknown;
    try {
        const text = await fs.readFile(configPath, 'utf-8');
        raw = JSON.parse(text);
    } catch {
        return null; // missing file, unreadable, or invalid JSON — silently fall back
    }
    if (!raw || typeof raw !== 'object') return null;

    const obj = raw as Record<string, unknown>;
    // Workspace root first (matches how paths are written elsewhere in the project),
    // then the config's own folder (so assets can just sit next to the json).
    const baseDirs = [workspacePath, path.dirname(configPath)];
    const mode: CustomEasterEggConfig['mode'] = obj.mode === 'extend' ? 'extend' : 'replace';

    const rawList: RawCharacter[] = Array.isArray(obj.characters)
        ? (obj.characters as RawCharacter[]).slice(0, MAX_CHARACTERS)
        : typeof obj.image === 'string'
            ? [{ image: obj.image, audio: obj.audio }]
            : [];

    const resolved = await Promise.all(rawList.map((entry) => toCharacter(entry, baseDirs)));
    const characters = resolved.filter((c): c is CustomEasterEggCharacter => c !== null);

    if (characters.length === 0) return null;
    return { mode, characters };
}

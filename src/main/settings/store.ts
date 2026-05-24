/**
 * Persistent settings stored in userData directory.
 */
import { app } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { DEFAULT_SETTINGS, type AppSettings } from '../../shared/types';
import { defaultTerminalShell } from '../terminal/shellConfig';

let cache: AppSettings = { ...DEFAULT_SETTINGS };

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await fs.readFile(settingsPath(), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    cache = {
      ...DEFAULT_SETTINGS,
      ...parsed,
      terminalShell: parsed.terminalShell ?? defaultTerminalShell(),
    };
  } catch {
    cache = { ...DEFAULT_SETTINGS, terminalShell: defaultTerminalShell() };
  }
  return cache;
}

export function getSettings(): AppSettings {
  return { ...cache };
}

export async function setSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  cache = { ...cache, ...partial };
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true });
  await fs.writeFile(settingsPath(), JSON.stringify(cache, null, 2), 'utf-8');
  return { ...cache };
}

app.whenReady().then(() => loadSettings());

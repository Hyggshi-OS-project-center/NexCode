/**
 * Loads .vsix convenience store extensions from the workspace.
 */
import { unzipSync, strFromU8 } from 'fflate';
import type { VsixExtensionManifest } from '../../../shared/vsix';
import { isVsixFile, parseVsixManifest } from '../../../shared/vsix';
import { joinPath } from '../../utils/pathUtils';
import type { ExtensionContext, NexusPlugin, PluginHost } from './PluginHost';

export interface InstalledVsixExtension {
  path: string;
  manifest: VsixExtensionManifest;
  plugin: NexusPlugin;
}

const EXTENSION_DIRS = ['.nexcode/extensions', '.nexus/extensions'];

export class VsixExtensionStore {
  private installed = new Map<string, InstalledVsixExtension>();
  private themeStyleElements = new Map<string, HTMLStyleElement>();
  private activeThemeId: string | null = null;
  private onThemeApplied?: (themeId: string) => void;

  constructor(onThemeApplied?: (themeId: string) => void) {
    this.onThemeApplied = onThemeApplied;
  }

  getExtensions(): InstalledVsixExtension[] {
    return [...this.installed.values()];
  }

  async scanWorkspace(workspacePath: string, host: PluginHost): Promise<void> {
    await this.deactivateAll(host);
    for (const rel of EXTENSION_DIRS) {
      const dir = joinPath(workspacePath, rel);
      if (!(await window.electronAPI.exists(dir))) continue;

      const entries = await window.electronAPI.readDir(dir, { showHidden: true });
      for (const entry of entries) {
        if (!entry.isDirectory && isVsixFile(entry.name)) {
          try {
            await this.installFromPath(entry.path, host);
          } catch (err) {
            console.warn(`[VsixExtensionStore] Skipping "${entry.path}":`, err);
          }
        }
      }
    }
  }

  async installFromPath(vsixPath: string, host: PluginHost): Promise<void> {
    const raw = await window.electronAPI.readFileBinary(vsixPath);
    const manifest = parseVsixManifest(raw, vsixPath);

    if (this.installed.has(manifest.id)) {
      await this.installed.get(manifest.id)!.plugin.deactivate?.();
    }

    const plugin = await this.createPlugin(manifest, raw, vsixPath, host);

    await host.register(plugin);
    this.installed.set(manifest.id, { path: vsixPath, manifest, plugin });
    await this.applyThemeManifest(manifest, raw, vsixPath);
  }

  private async deactivateAll(host: PluginHost): Promise<void> {
    await host.unregisterAll();
    this.installed.clear();
    this.clearThemeStyles();
  }

  private async createPlugin(
    manifest: VsixExtensionManifest,
    raw: Uint8Array,
    sourcePath: string,
    host: PluginHost,
  ): Promise<NexusPlugin> {
    let contextRef: ExtensionContext | null = null;
    const plugin: NexusPlugin = {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      activate: async (h) => {
        const context = h.createExtensionContext(plugin, sourcePath);
        contextRef = context;
        const api = h.createVsCodeApi(context) as ExtensionApi;
        context.subscriptions.push(
          h.on('fileOpened', (path) => {
            if (typeof path === 'string') {
              api.window.setStatusBarMessage(`Opened ${path}`, 1200);
            }
          }),
        );

        manifest.commands?.forEach((cmd) => {
          context.subscriptions.push(
            api.commands.registerCommand(`${manifest.id}.${cmd.id}`, async (...args: unknown[]) => {
              return api.window.showInformationMessage(`${manifest.name}: ${cmd.title}`);
            }),
          );
        });

        if (manifest.main) {
          const moduleCode = await this.loadExtensionModule(manifest.main, raw, sourcePath);
          if (moduleCode) {
            const blobUrl = URL.createObjectURL(new Blob([moduleCode], { type: 'text/javascript' }));
            try {
              const mod = await import(/* @vite-ignore */ blobUrl);
              await this.invokeActivate(mod, api, context);
            } finally {
              URL.revokeObjectURL(blobUrl);
            }
          }
        }
      },
      deactivate: async () => {
        for (const disposable of contextRef?.subscriptions ?? []) {
          try {
            disposable.dispose();
          } catch {
            /* ignore extension cleanup failures */
          }
        }
        contextRef = null;
      },
    };
    return plugin;
  }

  private async loadExtensionModule(main: string, raw: Uint8Array, sourcePath: string): Promise<string | null> {
    if (!main) return null;
    const trimmed = main.replace(/^\.\/+/, '').replace(/\\/g, '/');
    if (raw[0] !== 0x50 || raw[1] !== 0x4b) {
      if (trimmed.endsWith('.js')) {
        const baseDir = sourcePath.replace(/\\/g, '/').replace(/\/[^/]+$/, '');
        const filePath = joinPath(baseDir, trimmed);
        return window.electronAPI.readFile(filePath);
      }
      return null;
    }

    const files = unzipSync(raw);
    const names = [trimmed, `extension/${trimmed}`, `dist/${trimmed}`];
    for (const name of names) {
      const entry = files[name];
      if (entry) return strFromU8(entry);
    }
    return null;
  }

  private async invokeActivate(mod: unknown, api: ExtensionApi, context: ExtensionContext): Promise<void> {
    const candidate = mod as { activate?: (api: ExtensionApi, context: ExtensionContext) => void | Promise<void> };
    if (typeof candidate.activate === 'function') {
      await candidate.activate(api, context);
    }
  }

  private async applyThemeManifest(manifest: VsixExtensionManifest, raw: Uint8Array, sourcePath: string): Promise<void> {
    if (!manifest.theme) return;
    const themeId = manifest.theme.trim();
    if (!themeId) return;

    const css = await this.loadThemeCss(manifest, raw, sourcePath);
    if (css) {
      this.installThemeCss(themeId, css);
    }

    document.documentElement.dataset.theme = themeId;
    this.activeThemeId = themeId;
    this.onThemeApplied?.(themeId);

    if (manifest.error) {
      window.console.warn(`[Theme ${manifest.id}] ${manifest.error}`);
    }

    if (manifest.audio) {
      void this.playThemeAudio(manifest.audio, raw, sourcePath);
    }
  }

  private async loadThemeCss(manifest: VsixExtensionManifest, raw: Uint8Array, sourcePath: string): Promise<string | null> {
    const rel = (manifest.themeCss || manifest.main || '').trim().replace(/^\.\/+/, '').replace(/\\/g, '/');
    if (!rel) return null;

    if (raw[0] === 0x50 && raw[1] === 0x4b) {
      const files = unzipSync(raw);
      const candidates = [rel, `extension/${rel}`, `theme/${rel}`, `dist/${rel}`];
      for (const candidate of candidates) {
        const entry = files[candidate];
        if (entry) return strFromU8(entry);
      }
      return null;
    }

    const baseDir = sourcePath.replace(/\\/g, '/').replace(/\/[^/]+$/, '');
    const cssPath = joinPath(baseDir, rel);
    try {
      return await window.electronAPI.readFile(cssPath);
    } catch {
      return null;
    }
  }

  private installThemeCss(themeId: string, css: string): void {
    this.themeStyleElements.get(themeId)?.remove();
    const style = document.createElement('style');
    style.dataset.themeId = themeId;
    style.textContent = css;
    document.head.appendChild(style);
    this.themeStyleElements.set(themeId, style);
  }

  private async playThemeAudio(audioPath: string, raw: Uint8Array, sourcePath: string): Promise<void> {
    const rel = audioPath.trim().replace(/^\.\/+/, '').replace(/\\/g, '/');
    if (!rel) return;

    let url: string | null = null;
    if (raw[0] === 0x50 && raw[1] === 0x4b) {
      const files = unzipSync(raw);
      for (const candidate of [rel, `extension/${rel}`, `theme/${rel}`, `dist/${rel}`]) {
        const entry = files[candidate];
        if (entry) {
          url = URL.createObjectURL(new Blob([entry], { type: 'audio/ogg' }));
          break;
        }
      }
    } else {
      const baseDir = sourcePath.replace(/\\/g, '/').replace(/\/[^/]+$/, '');
      const filePath = joinPath(baseDir, rel);
      const data = await window.electronAPI.readFileBinary(filePath);
      const copy = Uint8Array.from(data);
      url = URL.createObjectURL(new Blob([copy], { type: 'audio/ogg' }));
    }

    if (!url) return;
    const audio = new Audio(url);
    audio.preload = 'auto';
    audio.play().catch(() => undefined);
    audio.addEventListener('ended', () => URL.revokeObjectURL(url!), { once: true });
  }

  private clearThemeStyles(): void {
    for (const style of this.themeStyleElements.values()) style.remove();
    this.themeStyleElements.clear();
    this.activeThemeId = null;
  }
}

interface ExtensionApi {
  commands: {
    registerCommand: (id: string, callback: (...args: unknown[]) => void | Promise<unknown>) => { dispose: () => void };
    executeCommand: (id: string, ...args: unknown[]) => Promise<unknown>;
    getCommands: () => Promise<string[]>;
  };
  window: {
    activeTextEditor: unknown;
    showInformationMessage: (message: string) => Promise<string>;
    showWarningMessage: (message: string) => Promise<string>;
    showErrorMessage: (message: string) => Promise<string>;
    setStatusBarMessage: (message: string, timeout?: number) => { dispose: () => void };
    onDidChangeActiveTextEditor: (handler: (editor: unknown) => void) => { dispose: () => void };
  };
  workspace: {
    workspaceFolders: Array<{ uri: string; name: string }>;
    getConfiguration: () => { get: <T>(key: string, defaultValue?: T) => T | undefined };
    openTextDocument: (path: string) => Promise<unknown>;
    onDidOpenTextDocument: (handler: (document: unknown) => void) => { dispose: () => void };
    onDidSaveTextDocument: (handler: (document: unknown) => void) => { dispose: () => void };
    fs: {
      readFile: (path: string) => Promise<Uint8Array>;
      writeFile: (path: string, data: Uint8Array | string) => Promise<void>;
    };
  };
}

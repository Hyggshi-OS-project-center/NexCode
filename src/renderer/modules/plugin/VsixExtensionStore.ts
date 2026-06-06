/**
 * Loads .vsix convenience store extensions from the workspace.
 */
import type { VsixExtensionManifest } from '../../../shared/vsix';
import { isVsixFile, parseVsixManifest } from '../../../shared/vsix';
import { joinPath } from '../../utils/pathUtils';
import type { NexusPlugin, PluginHost } from './PluginHost';

export interface InstalledVsixExtension {
  path: string;
  manifest: VsixExtensionManifest;
  plugin: NexusPlugin;
}

const EXTENSION_DIRS = ['.nexcode/extensions', '.nexus/extensions'];

export class VsixExtensionStore {
  private installed = new Map<string, InstalledVsixExtension>();

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
            console.warn(`[VsixExtensionStore] Skipping "${entry.name}":`, err);
          }
        }
      }
    }
  }

  async installFromPath(vsixPath: string, host: PluginHost): Promise<void> {
    // readFileBinary returns Uint8Array — needed for ZIP detection inside parseVsixManifest
    const raw = await window.electronAPI.readFileBinary(vsixPath);
    const manifest = parseVsixManifest(raw);

    if (this.installed.has(manifest.id)) {
      await this.installed.get(manifest.id)!.plugin.deactivate?.();
    }

    const plugin: NexusPlugin = {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      activate: (h) => {
        manifest.commands?.forEach((cmd) => {
          h.registerCommand({
            id: `${manifest.id}.${cmd.id}`,
            title: cmd.title,
            run: () => {
              window.alert(`${manifest.name}: ${cmd.title}`);
            },
          });
        });
      },
      deactivate: async () => {
        manifest.commands?.forEach(() => {
          /* commands cleared on full host reset if needed */
        });
      },
    };

    await host.register(plugin);
    this.installed.set(manifest.id, { path: vsixPath, manifest, plugin });
  }

  private async deactivateAll(host: PluginHost): Promise<void> {
    for (const ext of this.installed.values()) {
      await ext.plugin.deactivate?.();
    }
    this.installed.clear();
    void host;
  }
}
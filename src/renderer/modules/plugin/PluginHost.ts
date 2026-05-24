/**
 * Plugin architecture foundation — register extensions without coupling to core modules.
 *
 * Future plugins can hook into:
 * - onDidOpenFile
 * - onDidSaveFile
 * - registerCommand
 * - registerLanguageSupport
 */

export interface PluginCommand {
  id: string;
  title: string;
  run: () => void | Promise<void>;
}

export interface NexusPlugin {
  id: string;
  name: string;
  version: string;
  activate: (host: PluginHost) => void | Promise<void>;
  deactivate?: () => void | Promise<void>;
}

export class PluginHost {
  private plugins = new Map<string, NexusPlugin>();
  private commands = new Map<string, PluginCommand>();
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  async register(plugin: NexusPlugin): Promise<void> {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Plugin already registered: ${plugin.id}`);
    }
    await plugin.activate(this);
    this.plugins.set(plugin.id, plugin);
  }

  registerCommand(cmd: PluginCommand): void {
    this.commands.set(cmd.id, cmd);
  }

  async executeCommand(id: string): Promise<void> {
    const cmd = this.commands.get(id);
    if (cmd) await cmd.run();
  }

  /** Emit events for plugin hooks */
  emit(event: string, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach((fn) => fn(...args));
  }

  on(event: string, handler: (...args: unknown[]) => void): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
    return () => this.listeners.get(event)?.delete(handler);
  }

  getRegisteredPlugins(): NexusPlugin[] {
    return [...this.plugins.values()];
  }
}

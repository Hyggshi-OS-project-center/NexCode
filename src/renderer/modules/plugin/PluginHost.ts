/**
 * VS Code-like extension host for trusted workspace extensions.
 *
 * This is intentionally a compact compatibility layer, not a full VS Code
 * extension runtime. It supports the common APIs local NexCode extensions need:
 * commands, window messages, active editor/document access, workspace file IO,
 * subscriptions, and file open/save events.
 */
import type { AppSettings } from '../../../shared/types';

export interface Disposable {
  dispose: () => void;
}

export interface PluginCommand {
  id: string;
  title: string;
  run: (...args: unknown[]) => void | Promise<unknown>;
}

export interface NexusPlugin {
  id: string;
  name: string;
  version: string;
  activate: (host: PluginHost) => void | Promise<void>;
  deactivate?: () => void | Promise<void>;
}

export interface ExtensionContext {
  extension: {
    id: string;
    name: string;
    version: string;
  };
  extensionPath: string;
  subscriptions: Disposable[];
  workspaceState: Memento;
  globalState: Memento;
}

export interface Memento {
  get: <T>(key: string, defaultValue?: T) => T | undefined;
  update: (key: string, value: unknown) => Promise<void>;
}

export interface TextDocument {
  uri: string;
  fileName: string;
  languageId: string;
  getText: () => string;
}

export interface TextEditor {
  document: TextDocument;
  edit: (callback: (builder: TextEditorEdit) => void) => Promise<boolean>;
}

export interface TextEditorEdit {
  replaceAll: (text: string) => void;
  insert: (text: string) => void;
}

export interface ExtensionHostServices {
  getWorkspacePath: () => string | null;
  getSettings: () => AppSettings;
  getActiveFilePath: () => string | null;
  getActiveText: () => string;
  getActiveLanguageId: () => string;
  replaceActiveText: (text: string) => void;
  insertIntoActiveEditor: (text: string) => boolean;
  openTextDocument: (path: string) => Promise<TextDocument>;
  showMessage: (message: string, severity: 'info' | 'warning' | 'error') => void;
  setStatus: (message: string) => void;
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
}

interface CommandEntry extends PluginCommand {
  ownerId: string | null;
}

export class PluginHost {
  private plugins = new Map<string, NexusPlugin>();
  private commands = new Map<string, CommandEntry>();
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  private activatingPluginId: string | null = null;
  private services: ExtensionHostServices | null = null;

  configure(services: ExtensionHostServices): void {
    this.services = services;
  }

  async register(plugin: NexusPlugin): Promise<void> {
    if (this.plugins.has(plugin.id)) {
      await this.unregister(plugin.id);
    }

    this.activatingPluginId = plugin.id;
    try {
      await plugin.activate(this);
      this.plugins.set(plugin.id, plugin);
    } finally {
      this.activatingPluginId = null;
    }
  }

  async unregister(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (plugin) {
      await plugin.deactivate?.();
      this.plugins.delete(pluginId);
    }

    for (const [id, command] of this.commands) {
      if (command.ownerId === pluginId) {
        this.commands.delete(id);
      }
    }
  }

  async unregisterAll(): Promise<void> {
    for (const id of [...this.plugins.keys()]) {
      await this.unregister(id);
    }
  }

  registerCommand(cmd: PluginCommand): Disposable {
    const ownerId = this.activatingPluginId;
    this.commands.set(cmd.id, { ...cmd, ownerId });
    return {
      dispose: () => {
        const existing = this.commands.get(cmd.id);
        if (existing?.ownerId === ownerId) {
          this.commands.delete(cmd.id);
        }
      },
    };
  }

  async executeCommand(id: string, ...args: unknown[]): Promise<unknown> {
    const cmd = this.commands.get(id);
    if (!cmd) {
      throw new Error(`Command not found: ${id}`);
    }
    return cmd.run(...args);
  }

  getCommands(): PluginCommand[] {
    return [...this.commands.values()].map(({ id, title, run }) => ({ id, title, run }));
  }

  /** Emit events for plugin hooks */
  emit(event: string, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach((fn) => fn(...args));
    this.listeners.get('*')?.forEach((fn) => fn(event, ...args));
  }

  on(event: string, handler: (...args: unknown[]) => void): Disposable {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
    return {
      dispose: () => this.listeners.get(event)?.delete(handler),
    };
  }

  getRegisteredPlugins(): NexusPlugin[] {
    return [...this.plugins.values()];
  }

  createExtensionContext(extension: NexusPlugin, extensionPath: string): ExtensionContext {
    return {
      extension: {
        id: extension.id,
        name: extension.name,
        version: extension.version,
      },
      extensionPath,
      subscriptions: [],
      workspaceState: this.createMemento(`nexcode.extension.${extension.id}.workspaceState`),
      globalState: this.createMemento(`nexcode.extension.${extension.id}.globalState`),
    };
  }

  createVsCodeApi(context: ExtensionContext): unknown {
    const requireServices = (): ExtensionHostServices => {
      if (!this.services) {
        throw new Error('Extension host services are not configured');
      }
      return this.services;
    };

    const createDocument = (fileName: string, text: string, languageId = 'plaintext'): TextDocument => ({
      uri: fileName,
      fileName,
      languageId,
      getText: () => text,
    });

    const activeTextEditor = (): TextEditor | undefined => {
      const services = requireServices();
      const fileName = services.getActiveFilePath();
      if (!fileName) return undefined;
      return {
        document: createDocument(fileName, services.getActiveText(), services.getActiveLanguageId()),
        edit: async (callback) => {
          let replacement: string | null = null;
          let insertion = '';
          callback({
            replaceAll: (text) => {
              replacement = text;
            },
            insert: (text) => {
              insertion += text;
            },
          });

          if (replacement !== null) {
            services.replaceActiveText(replacement);
            return true;
          }
          if (insertion) {
            return services.insertIntoActiveEditor(insertion);
          }
          return false;
        },
      };
    };

    return {
      version: 'nexcode-vscode-api-0.1',
      ExtensionContext: Object,
      commands: {
        registerCommand: (id: string, callback: (...args: unknown[]) => unknown) => {
          const disposable = this.registerCommand({
            id,
            title: id,
            run: callback,
          });
          context.subscriptions.push(disposable);
          return disposable;
        },
        executeCommand: (id: string, ...args: unknown[]) => this.executeCommand(id, ...args),
        getCommands: () => Promise.resolve(this.getCommands().map((command) => command.id)),
      },
      window: {
        get activeTextEditor() {
          return activeTextEditor();
        },
        showInformationMessage: (message: string) => {
          requireServices().showMessage(message, 'info');
          return Promise.resolve(message);
        },
        showWarningMessage: (message: string) => {
          requireServices().showMessage(message, 'warning');
          return Promise.resolve(message);
        },
        showErrorMessage: (message: string) => {
          requireServices().showMessage(message, 'error');
          return Promise.resolve(message);
        },
        setStatusBarMessage: (message: string, timeout?: number) => {
          const services = requireServices();
          services.setStatus(message);
          let timer: number | null = null;
          if (timeout && timeout > 0) {
            timer = window.setTimeout(() => services.setStatus(''), timeout);
          }
          return {
            dispose: () => {
              if (timer !== null) window.clearTimeout(timer);
            },
          } satisfies Disposable;
        },
        onDidChangeActiveTextEditor: (handler: (editor: TextEditor | undefined) => void) =>
          this.on('fileOpened', () => handler(activeTextEditor())),
      },
      workspace: {
        get workspaceFolders() {
          const path = requireServices().getWorkspacePath();
          return path ? [{ uri: path, name: path.split(/[/\\]/).pop() ?? path }] : [];
        },
        getConfiguration: () => ({
          get: <T>(key: keyof AppSettings, defaultValue?: T) => {
            const value = requireServices().getSettings()[key];
            return (value === undefined ? defaultValue : value) as T;
          },
        }),
        openTextDocument: (path: string) => requireServices().openTextDocument(path),
        onDidOpenTextDocument: (handler: (document: TextDocument) => void) =>
          this.on('fileOpened', async (path) => {
            if (typeof path === 'string') handler(await requireServices().openTextDocument(path));
          }),
        onDidSaveTextDocument: (handler: (document: TextDocument) => void) =>
          this.on('fileSaved', async (path) => {
            if (typeof path === 'string') handler(await requireServices().openTextDocument(path));
          }),
        fs: {
          readFile: async (path: string) => new TextEncoder().encode(await requireServices().readFile(path)),
          writeFile: async (path: string, data: Uint8Array | string) => {
            const content = typeof data === 'string' ? data : new TextDecoder().decode(data);
            await requireServices().writeFile(path, content);
          },
        },
      },
      Uri: {
        file: (path: string) => ({ fsPath: path, path, toString: () => path }),
      },
      Disposable: {
        from: (...items: Disposable[]) => ({
          dispose: () => items.forEach((item) => item.dispose()),
        }),
      },
    };
  }

  private createMemento(storageKey: string): Memento {
    const read = (): Record<string, unknown> => {
      try {
        return JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Record<string, unknown>;
      } catch {
        return {};
      }
    };

    return {
      get: <T>(key: string, defaultValue?: T): T | undefined => {
        const value = read()[key];
        return value === undefined ? defaultValue : (value as T);
      },
      update: async (key: string, value: unknown): Promise<void> => {
        const data = read();
        if (value === undefined) {
          delete data[key];
        } else {
          data[key] = value;
        }
        localStorage.setItem(storageKey, JSON.stringify(data));
      },
    };
  }
}

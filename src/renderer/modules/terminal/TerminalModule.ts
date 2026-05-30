/**
 * Integrated terminal — xterm.js shell, PowerShell-style navigation, command row.
 */
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { ClipboardAddon } from '@xterm/addon-clipboard';
import { WebglAddon } from '@xterm/addon-webgl';
import { LigaturesAddon } from '@xterm/addon-ligatures';
import { SerializeAddon } from '@xterm/addon-serialize';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import '@xterm/xterm/css/xterm.css';
import type { AppSettings } from '../../../shared/types';
import { CmdLineInput } from './cmdLineInput';
import { TerminalCommandInput } from './TerminalCommandInput';
import { formatPromptLabel } from './terminalNavigation';
import {
  getDefaultPromptLabel,
  getTerminalFontFamily,
  getTerminalPanelTitle,
  getTerminalTheme,
} from './terminalThemes';

export type TerminalKeyHandler = (event: KeyboardEvent) => boolean;
export type TerminalCwdHandler = (cwd: string) => void;
export type TerminalOutputHandler = (data: string) => void;
export type TerminalMomentHandler = (moment: 'legacySplash2025') => void;

interface TerminalSession {
  id: number;
  term: Terminal;
  fit: FitAddon;
  cmdInput?: CmdLineInput;
  resizeHandler?: () => void;
}

type TerminalPanelView = 'terminal' | 'problems' | 'output' | 'debug';

export class TerminalModule {
  private panel: HTMLElement;
  private container: HTMLElement;
  private commandInput: HTMLInputElement;
  private commandRowEl: HTMLElement;
  private promptLabel: HTMLElement;
  private placeholder: HTMLElement;
  private viewTabs: HTMLElement[] = [];
  private terminals = new Map<number, TerminalSession>();
  private activeId: number | null = null;
  private cwd: string | null = null;
  private terminalCwd: string | null = null;
  private homePath: string | null = null;
  private unsubscribeData: (() => void) | null = null;
  private unsubscribeCwd: (() => void) | null = null;
  private settings: AppSettings;
  private onShortcut?: TerminalKeyHandler;
  private onCwdChange?: TerminalCwdHandler;
  private onTerminalCwdDisplay?: (cwd: string) => void;
  private onOutput?: TerminalOutputHandler;
  private onMoment?: TerminalMomentHandler;
  private suppressCwdSync = false;
  private activeView: TerminalPanelView = 'terminal';
  private commandController: TerminalCommandInput;
  private lifecycleVersion = 0;
  private recreateQueue: Promise<void> = Promise.resolve();

  constructor(
    panelId: string,
    containerId: string,
    settings: AppSettings,
    onShortcut?: TerminalKeyHandler,
    onCwdChange?: TerminalCwdHandler,
    onTerminalCwdDisplay?: (cwd: string) => void,
    onOutput?: TerminalOutputHandler,
    onMoment?: TerminalMomentHandler,
  ) {
    this.panel = document.getElementById(panelId)!;
    this.container = document.getElementById(containerId)!;
    this.commandInput = document.getElementById('terminal-command-input') as HTMLInputElement;
    this.commandRowEl = document.querySelector('.terminal-command-row') as HTMLElement;
    this.promptLabel = document.querySelector('.terminal-prompt-label')!;
    this.placeholder = document.getElementById('terminal-placeholder') as HTMLElement;
    this.viewTabs = Array.from(this.panel.querySelectorAll('[data-terminal-view]')) as HTMLElement[];
    this.settings = settings;
    this.onShortcut = onShortcut;
    this.onTerminalCwdDisplay = onTerminalCwdDisplay;
    this.onOutput = onOutput;
    this.onMoment = onMoment;

    const handleCwd = (cwd: string) => {
      this.terminalCwd = cwd;
      this.updatePromptLabel(cwd);
      onTerminalCwdDisplay?.(cwd);
      onCwdChange?.(cwd);
    };
    this.onCwdChange = handleCwd;

    void this.loadHomePath();

    this.commandController = new TerminalCommandInput(
      this.commandInput,
      () => ({
        shell: this.settings.terminalShell,
        cwd: this.terminalCwd ?? this.cwd,
        home: this.homePath ?? 'C:\\Users',
      }),
      (command) => void this.sendCommand(command, true),
    );

    this.unsubscribeData = window.electronAPI.onTerminalData(({ id, data }) => {
      const session = this.terminals.get(id);
      session?.term.write(data);
      this.onOutput?.(data);
    });
    this.unsubscribeCwd = window.electronAPI.onTerminalCwd(({ id, cwd }) => {
      if (id !== this.activeId) return;
      if (!this.suppressCwdSync) this.onCwdChange?.(cwd);
    });
    this.bindPanelControls();
    this.switchView('terminal');
    this.applyShellAppearance();
  }

  private async loadHomePath(): Promise<void> {
    try {
      this.homePath = await window.electronAPI.getHomePath();
    } catch {
      this.homePath = null;
    }
  }

  private bindPanelControls(): void {
    document.getElementById('btn-terminal-paste')?.addEventListener('click', () => void this.paste());
    document.getElementById('btn-terminal-copy')?.addEventListener('click', () => void this.copySelection());
    document.getElementById('btn-terminal-clear')?.addEventListener('click', () => this.clear());
    document.getElementById('btn-terminal-run-cmd')?.addEventListener('click', () => {
      this.commandInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    this.viewTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const view = (tab.dataset.terminalView ?? 'terminal') as TerminalPanelView;
        this.switchView(view);
      });
    });
  }

  private switchView(view: TerminalPanelView): void {
    this.activeView = view;
    this.viewTabs.forEach((tab) => {
      const active = tab.dataset.terminalView === view;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    const isTerminal = view === 'terminal';
    const isDebug = view === 'debug';
    this.commandRowEl.classList.toggle('hidden', !isTerminal);
    this.container.classList.toggle('hidden', !isTerminal);

    const debugConsole = document.getElementById('debug-console-container');
    if (debugConsole) {
      debugConsole.classList.toggle('hidden', !isDebug);
      if (isDebug) {
        debugConsole.style.display = 'flex';
      } else {
        debugConsole.style.display = '';
      }
    }

    this.placeholder.classList.toggle('hidden', isTerminal || isDebug);

    const controls = this.panel.querySelectorAll(
      '#btn-terminal-paste, #btn-terminal-copy, #btn-terminal-clear, #btn-new-terminal',
    );
    controls.forEach((btn) => ((btn as HTMLButtonElement).disabled = !isTerminal));

    if (!isTerminal) {
      if (isDebug) return;
      const titles: Record<TerminalPanelView, string> = {
        terminal: '',
        problems: 'Problems view is coming soon.',
        output: 'Output view is coming soon.',
        debug: '',
      };
      this.placeholder.textContent = titles[view];
      return;
    }

    this.placeholder.textContent = '';
    this.getActiveTerminal()?.focus();
  }

  setCwd(path: string | null): void {
    this.cwd = path;
    if (path && !this.terminalCwd) {
      this.terminalCwd = path;
      this.updatePromptLabel(path);
    }
  }

  getTerminalCwd(): string | null {
    return this.terminalCwd ?? this.cwd;
  }

  /** Change shell directory and keep explorer in sync (e.g. after Open Folder). */
  async changeDirectory(dirPath: string, syncExplorer = false): Promise<void> {
    this.cwd = dirPath;
    this.terminalCwd = dirPath;
    this.updatePromptLabel(dirPath);
    if (this.terminals.size === 0) return;
    this.suppressCwdSync = true;
    const shell = this.settings.terminalShell;
    let cmd: string;
    if (shell === 'powershell') {
      const quoted = dirPath.includes(' ') ? `'${dirPath.replace(/'/g, "''")}'` : dirPath;
      cmd = `Set-Location ${quoted}`;
    } else if (shell === 'cmd') {
      const q = dirPath.includes(' ') ? `"${dirPath}"` : dirPath;
      cmd = `cd /d ${q}`;
    } else {
      const q = dirPath.includes(' ') ? `"${dirPath}"` : dirPath;
      cmd = `cd ${q}`;
    }
    await this.sendCommand(cmd, true);
    this.suppressCwdSync = false;
    if (syncExplorer) this.onCwdChange?.(dirPath);
  }

  applySettings(settings: AppSettings): void {
    this.settings = settings;
    this.applyShellAppearance();
    this.updateCommandPlaceholder();
  }

  async recreateForShellChange(): Promise<void> {
    this.recreateQueue = this.recreateQueue
      .catch(() => {
        /* keep later restart requests alive after a failed restart */
      })
      .then(async () => {
        this.lifecycleVersion++;
        this.terminals.forEach((session) => this.destroySession(session, true));
        this.terminals.clear();
        this.activeId = null;
        this.container.replaceChildren();
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        if (this.isVisible()) await this.createTerminal();
      });
    return this.recreateQueue;
  }

  private applyShellAppearance(): void {
    const shell = this.settings.terminalShell;
    const theme = getTerminalTheme(shell, this.settings.theme);
    const fontFamily = this.settings.fontFamily || getTerminalFontFamily(shell);

    this.terminals.forEach(({ term }) => {
      term.options.theme = theme;
      term.options.fontFamily = fontFamily;
      term.options.fontSize = this.settings.terminalFontSize;
      term.options.cursorStyle = shell === 'cmd' ? 'block' : 'bar';
      term.options.cursorBlink = true;
      term.options.letterSpacing = shell === 'cmd' ? 0 : undefined;
      term.refresh(0, Math.max(0, term.rows - 1));
    });

    const header = this.panel.querySelector('#terminal-tab-label');
    if (header) header.textContent = getTerminalPanelTitle(shell);

    this.updatePromptLabel(this.terminalCwd ?? this.cwd);
    this.updateCommandPlaceholder();

    this.panel.classList.toggle('terminal-shell-cmd', shell === 'cmd');
    this.panel.classList.toggle('terminal-shell-powershell', shell === 'powershell');
    this.panel.classList.toggle('terminal-shell-bash', shell === 'bash');
  }

  private updateCommandPlaceholder(): void {
    const shell = this.settings.terminalShell;
    if (shell === 'powershell') {
      this.commandInput.placeholder =
        'Command or path — Tab complete, ↑↓ history (cd, Set-Location, ..)';
    } else if (shell === 'cmd') {
      this.commandInput.placeholder = 'Command or path — Tab complete, ↑↓ history';
    } else {
      this.commandInput.placeholder = 'Command — Enter to run';
    }
  }

  private updatePromptLabel(cwd: string | null): void {
    const shell = this.settings.terminalShell;
    const text = cwd ? formatPromptLabel(shell, cwd) : getDefaultPromptLabel(shell);
    this.promptLabel.textContent = text;
    this.promptLabel.title = cwd ?? '';
  }

  async createTerminal(): Promise<void> {
    const version = this.lifecycleVersion;
    const id = await window.electronAPI.createTerminal(this.cwd ?? undefined);
    if (id < 0) return;
    if (version !== this.lifecycleVersion) {
      window.electronAPI.killTerminal(id);
      return;
    }

    const shell = this.settings.terminalShell;
    const term = new Terminal({
      fontSize: this.settings.terminalFontSize,
      fontFamily: this.settings.fontFamily || getTerminalFontFamily(shell),
      theme: getTerminalTheme(shell, this.settings.theme),
      cursorBlink: true,
      cursorStyle: shell === 'cmd' ? 'block' : 'bar',
      scrollback: 1500,
      convertEol: true,
    });

    const fit = new FitAddon();
    try {
      term.loadAddon(fit);
    } catch (e) {
      console.warn('FitAddon failed to load:', e);
    }

    try {
      term.loadAddon(new WebLinksAddon());
    } catch (e) {
      console.warn('WebLinksAddon failed to load:', e);
    }

    try {
      term.loadAddon(new ClipboardAddon());
    } catch (e) {
      console.warn('ClipboardAddon failed to load:', e);
    }

    try {
      const webgl = new WebglAddon();
      // Graceful fallback — when the GPU context is lost, dispose the addon
      // without throwing so the window 'error' event is never fired.
      webgl.onContextLoss(() => {
        console.warn('WebGL context lost — falling back to Canvas renderer.');
        try { webgl.dispose(); } catch { /* already disposed */ }
      });
      term.loadAddon(webgl);
    } catch (e) {
      console.warn('WebGL addon failed to load, falling back to Canvas renderer:', e);
    }

    try {
      term.loadAddon(new LigaturesAddon());
    } catch (e) {
      console.warn('Ligatures addon failed to load:', e);
    }

    try {
      term.loadAddon(new SerializeAddon());
    } catch (e) {
      console.warn('Serialize addon failed to load:', e);
    }

    try {
      const unicode11 = new Unicode11Addon();
      term.loadAddon(unicode11);
      term.unicode.activeVersion = '11';
    } catch (e) {
      console.warn('Unicode11 addon failed to load:', e);
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'terminal-xterm-wrap';
    wrapper.style.height = '100%';
    wrapper.style.width = '100%';
    this.container.innerHTML = '';
    this.container.appendChild(wrapper);
    term.open(wrapper);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    if (version !== this.lifecycleVersion) {
      window.electronAPI.killTerminal(id);
      term.dispose();
      return;
    }
    fit.fit();

    const cmdInput = new CmdLineInput(term, (payload) => window.electronAPI.writeTerminal(id, payload));
    term.onData((data) => {
      const c2 = data.charCodeAt(1);
      const c3 = data.charCodeAt(2);
      if (
        data.charCodeAt(0) === 0x1b && // ESC
        c2 === 0x5b &&                  // [
        (c3 === 0x4d || c3 === 0x3c)   // M (X10)  or  < (SGR)
      ) {
        return;
      }
      window.electronAPI.writeTerminal(id, data);
    });
    term.attachCustomKeyEventHandler((event) => this.handleTerminalKey(event));

    wrapper.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      void this.paste();
    });

    // For PowerShell / bash: a plain click (no text selection) redirects
    // keyboard focus to the command-input row so typing always goes through
    // the normalised command path instead of raw PSReadLine stdin.
    // CMD keeps direct xterm input because CmdLineInput handles it correctly.
    if (shell !== 'cmd') {
      let dragging = false;
      wrapper.addEventListener('mousedown', () => { dragging = false; });
      wrapper.addEventListener('mousemove', () => { dragging = true; });
      wrapper.addEventListener('mouseup', () => {
        if (!dragging && !term.hasSelection()) {
          requestAnimationFrame(() => this.commandInput.focus());
        }
        dragging = false;
      });
    }

    const resize = () => {
      if (!this.terminals.has(id)) return;
      fit.fit();
      window.electronAPI.resizeTerminal(id, term.cols, term.rows);
    };
    this.terminals.set(id, { id, term, fit, cmdInput, resizeHandler: resize });
    this.activeId = id;

    window.addEventListener('resize', resize);
    term.onResize(() => window.electronAPI.resizeTerminal(id, term.cols, term.rows));
    resize();
    this.applyShellAppearance();
    term.focus();
    requestAnimationFrame(() => fit.fit());
  }

  private destroySession(session: TerminalSession, killProcess: boolean): void {
    if (session.resizeHandler) {
      window.removeEventListener('resize', session.resizeHandler);
    }
    if (killProcess) {
      window.electronAPI.killTerminal(session.id);
    }
    try {
      session.term.dispose();
    } catch {
      /* xterm may already be disposed during renderer teardown */
    }
  }

  async show(): Promise<void> {
    const wasHidden = this.panel.classList.contains('hidden');
    if (wasHidden) {
      this.panel.classList.remove('hidden');
    }

    if (this.terminals.size === 0) {
      await this.createTerminal();
    } else {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      this.terminals.get(this.activeId!)?.fit.fit();
      this.getActiveTerminal()?.focus();
    }

    this.setQuickAccessActive(true);
    this.syncWelcomeLayout();
  }

  private handleTerminalKey(event: KeyboardEvent): boolean {
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === 'v') {
      void this.paste();
      return false;
    }
    if (mod && event.key.toLowerCase() === 'c' && this.getActiveTerminal()?.hasSelection()) {
      void this.copySelection();
      return false;
    }
    if (this.onShortcut?.(event)) return false;
    return true;
  }

  private getActiveTerminal(): Terminal | null {
    if (this.activeId === null) return null;
    return this.terminals.get(this.activeId)?.term ?? null;
  }

  async paste(text?: string): Promise<void> {
    const id = this.activeId;
    if (id === null) return;

    let payload = text;
    if (payload === undefined) {
      try {
        payload = await navigator.clipboard.readText();
      } catch {
        return;
      }
    }
    if (!payload) return;

    const session = this.activeId !== null ? this.terminals.get(this.activeId) : undefined;
    if (session?.cmdInput) {
      session.cmdInput.handleData(payload);
    } else {
      window.electronAPI.writeTerminal(id, payload);
    }
    this.getActiveTerminal()?.focus();
  }

  async sendCommand(command: string, execute = true): Promise<void> {
    if (!this.isVisible()) await this.show();
    if (this.terminals.size === 0) await this.createTerminal();
    const id = this.activeId;
    if (id === null) return;

    const session = this.activeId !== null ? this.terminals.get(this.activeId) : undefined;
    session?.cmdInput?.reset();
    if (this.handleNexCodeCommand(command, session?.term ?? null)) return;
    const suffix = execute ? '\r\n' : '';
    window.electronAPI.writeTerminal(id, command + suffix);
    this.getActiveTerminal()?.focus();
  }

  private handleNexCodeCommand(command: string, term: Terminal | null): boolean {
    const normalized = command.trim().replace(/[\r\n]+$/g, '');
    if (!/^nexcode\s+--legacy$/i.test(normalized)) return false;

    try {
      localStorage.setItem('nexcode.legacySplash2025', '1');
    } catch {
      /* ignore storage failures */
    }

    term?.writeln('');
    term?.writeln('\x1b[36mNexCode legacy splash 2025 enabled.\x1b[0m');
    term?.writeln('\x1b[90mRestart NexCode to see it.\x1b[0m');
    this.onMoment?.('legacySplash2025');
    this.getActiveTerminal()?.focus();
    return true;
  }

  async copySelection(): Promise<void> {
    const term = this.getActiveTerminal();
    if (!term || !term.hasSelection()) return;
    const text = term.getSelection();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard denied */
    }
  }

  clear(): void {
    this.getActiveTerminal()?.clear();
  }

  toggle(): void {
    const hidden = this.panel.classList.contains('hidden');
    if (hidden) void this.show();
    else {
      this.panel.classList.add('hidden');
      this.setQuickAccessActive(false);
    }
    this.syncWelcomeLayout();
  }

  private syncWelcomeLayout(): void {
    const details = document.querySelector('.welcome-shortcuts-panel') as HTMLDetailsElement | null;
    if (details && this.isVisible()) details.removeAttribute('open');
  }

  isVisible(): boolean {
    return !this.panel.classList.contains('hidden');
  }

  focus(): void {
    if (!this.isVisible()) void this.show();
    else this.getActiveTerminal()?.focus();
  }

  private setQuickAccessActive(active: boolean): void {
    document.getElementById('btn-terminal-quick')?.classList.toggle('active', active);
    document.getElementById('status-terminal')?.classList.toggle('active', active);
  }

  dispose(): void {
    this.unsubscribeData?.();
    this.unsubscribeCwd?.();
    this.lifecycleVersion++;
    this.terminals.forEach((session) => this.destroySession(session, true));
    this.terminals.clear();
  }
}

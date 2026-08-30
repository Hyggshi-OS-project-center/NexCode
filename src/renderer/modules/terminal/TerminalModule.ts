/**
 * Integrated Terminal Module — Standard Industrial Quality (Bản Tiêu Chuẩn).
 * Supports multi-terminal tabs, real-time PTY resizing, direct xterm interaction,
 * smooth theme syncing, WebGL/Canvas rendering, and shell switching.
 */
import { Terminal, type ITerminalAddon } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { ClipboardAddon } from '@xterm/addon-clipboard';
import { WebglAddon } from '@xterm/addon-webgl';
import { LigaturesAddon } from '@xterm/addon-ligatures';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { SerializeAddon } from '@xterm/addon-serialize';
import '@xterm/xterm/css/xterm.css';
import type { AppSettings, TerminalCreateOptions, TerminalShell, TerminalShellInfo } from '../../../shared/types';
import { getTerminalFontFamily, getTerminalPanelTitle, getTerminalTheme } from './terminalThemes';

export type TerminalKeyHandler = (event: KeyboardEvent) => boolean;
export type TerminalCwdHandler = (cwd: string) => void;
export type TerminalOutputHandler = (data: string) => void;
export type TerminalMomentHandler = (moment: 'legacySplash2025') => void;

interface TerminalInstance {
  id: number;
  term: Terminal;
  fit: FitAddon;
  wrapper: HTMLElement;
  shell: TerminalShell;
  title: string;
  cwd: string | null;
  isExited: boolean;
}

type TerminalPanelView = 'terminal' | 'problems' | 'output' | 'debug';

export class TerminalModule {
  private panel: HTMLElement;
  private container: HTMLElement;
  private placeholder: HTMLElement;
  private tabsContainer: HTMLElement;
  private viewTabs: HTMLElement[] = [];
  private shellDropdown: HTMLElement | null = null;
  private terminals = new Map<number, TerminalInstance>();
  private activeId: number | null = null;
  private cwd: string | null = null;
  private homePath: string | null = null;
  private settings: AppSettings;
  private availableShells: TerminalShellInfo[] = [];

  private unsubs: (() => void)[] = [];
  private onShortcut?: TerminalKeyHandler;
  private onCwdChange?: TerminalCwdHandler;
  private onTerminalCwdDisplay?: (cwd: string) => void;
  private onOutput?: TerminalOutputHandler;
  private onMoment?: TerminalMomentHandler;
  private activeView: TerminalPanelView = 'terminal';
  private resizeObserver: ResizeObserver | null = null;
  private isMaximized = false;

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
    this.placeholder = document.getElementById('terminal-placeholder') as HTMLElement;
    this.tabsContainer = document.getElementById('terminal-instance-tabs') as HTMLElement;
    this.shellDropdown = document.getElementById('terminal-shell-dropdown');
    this.resizer = document.getElementById('terminal-resizer');
    this.viewTabs = Array.from(this.panel.querySelectorAll('[data-terminal-view]')) as HTMLElement[];
    this.settings = settings;
    this.onShortcut = onShortcut;
    this.onCwdChange = onCwdChange;
    this.onTerminalCwdDisplay = onTerminalCwdDisplay;
    this.onOutput = onOutput;
    this.onMoment = onMoment;

    this.restoreSavedHeight();
    void this.initSystem();
    this.bindEvents();
    this.bindResizer();
    this.switchView('terminal');
    this.syncResizer();
  }

  private resizer: HTMLElement | null = null;

  private restoreSavedHeight(): void {
    try {
      const savedHeight = localStorage.getItem('nexcode.terminalHeight');
      if (savedHeight && !isNaN(Number(savedHeight))) {
        const h = Math.max(100, Math.min(window.innerHeight * 0.85, Number(savedHeight)));
        this.panel.style.height = `${h}px`;
        this.panel.style.maxHeight = 'none';
      }
    } catch {
      /* ignore storage errors */
    }
  }

  private bindResizer(): void {
    if (!this.resizer) return;
    const resizer = this.resizer;

    let dragging = false;
    let lastY = 0;
    let startHeight = 0;

    const stopDragging = (): void => {
      if (!dragging) return;
      dragging = false;
      resizer.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try {
        const currentH = this.panel.getBoundingClientRect().height;
        if (currentH > 0) {
          localStorage.setItem('nexcode.terminalHeight', String(Math.round(currentH)));
        }
      } catch {
        /* ignore */
      }
    };

    resizer.addEventListener('mousedown', (e: MouseEvent) => {
      if (this.panel.classList.contains('hidden') || this.isMaximized) return;
      dragging = true;
      lastY = e.clientY;
      startHeight = this.panel.getBoundingClientRect().height;
      resizer.classList.add('dragging');
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e: MouseEvent) => {
      if (!dragging) return;
      const deltaY = lastY - e.clientY;
      const minHeight = 100;
      const maxHeight = Math.floor(window.innerHeight * 0.85);
      const nextHeight = Math.max(minHeight, Math.min(maxHeight, startHeight + deltaY));
      this.panel.style.height = `${nextHeight}px`;
      this.panel.style.maxHeight = 'none';
      this.fitActiveTerminal();
    });

    document.addEventListener('mouseup', stopDragging);
    window.addEventListener('blur', stopDragging);
  }

  private syncResizer(): void {
    const isVisible = this.isVisible() && !this.isMaximized;
    this.resizer?.classList.toggle('hidden', !isVisible);
  }

  private async initSystem(): Promise<void> {
    try {
      this.homePath = await window.electronAPI.getHomePath();
    } catch {
      this.homePath = null;
    }

    try {
      if (window.electronAPI.listTerminalShells) {
        this.availableShells = await window.electronAPI.listTerminalShells();
      }
    } catch {
      this.availableShells = [];
    }

    // Subscribe to IPC streams
    this.unsubs.push(
      window.electronAPI.onTerminalData(({ id, data }) => {
        const instance = this.terminals.get(id);
        if (instance) {
          instance.term.write(data);
          this.onOutput?.(data);
        }
      }),
    );

    if (window.electronAPI.onTerminalExit) {
      this.unsubs.push(
        window.electronAPI.onTerminalExit(({ id, exitCode }) => {
          const instance = this.terminals.get(id);
          if (instance) {
            instance.isExited = true;
            instance.term.writeln(`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m`);
            this.renderTabs();
          }
        }),
      );
    }

    this.unsubs.push(
      window.electronAPI.onTerminalCwd(({ id, cwd }) => {
        const instance = this.terminals.get(id);
        if (instance) {
          instance.cwd = cwd;
        }
        if (id === this.activeId) {
          this.cwd = cwd;
          this.onTerminalCwdDisplay?.(cwd);
          this.onCwdChange?.(cwd);
        }
      }),
    );

    if (window.electronAPI.onTerminalTitle) {
      this.unsubs.push(
        window.electronAPI.onTerminalTitle(({ id, title }) => {
          const instance = this.terminals.get(id);
          if (instance) {
            instance.title = title;
            this.renderTabs();
          }
        }),
      );
    }

    // Set up reactive ResizeObserver for pixel-perfect PTY fit
    this.resizeObserver = new ResizeObserver(() => {
      this.fitActiveTerminal();
    });
    this.resizeObserver.observe(this.container);
  }

  private bindEvents(): void {
    // Top Panel Action buttons
    document.getElementById('btn-new-terminal')?.addEventListener('click', () => void this.createTerminal());
    document.getElementById('btn-terminal-shell-menu')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleShellDropdown();
    });
    document.getElementById('btn-terminal-clear')?.addEventListener('click', () => this.clear());
    document.getElementById('btn-terminal-kill')?.addEventListener('click', () => this.killActiveTerminal());
    document.getElementById('btn-terminal-maximize')?.addEventListener('click', () => this.toggleMaximize());
    document.getElementById('btn-toggle-terminal')?.addEventListener('click', () => this.toggle());

    // Close shell dropdown on outside click
    window.addEventListener('click', () => {
      if (this.shellDropdown && !this.shellDropdown.classList.contains('hidden')) {
        this.shellDropdown.classList.add('hidden');
      }
    });

    // Sub-view tabs (TERMINAL, PROBLEMS, OUTPUT, DEBUG CONSOLE)
    this.viewTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const view = (tab.dataset.terminalView ?? 'terminal') as TerminalPanelView;
        this.switchView(view);
      });
    });

    // Window resize fallback
    window.addEventListener('resize', () => {
      this.fitActiveTerminal();
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
    this.container.classList.toggle('hidden', !isTerminal);

    const debugConsole = document.getElementById('debug-console-container') || document.getElementById('debug-console');
    if (debugConsole) {
      debugConsole.classList.toggle('hidden', !isDebug);
      if (isDebug) debugConsole.style.display = 'flex';
      else debugConsole.style.display = '';
    }

    const tabsWrapper = document.getElementById('terminal-instance-tabs-wrapper');
    if (tabsWrapper) {
      tabsWrapper.style.display = isTerminal ? 'flex' : 'none';
    }

    this.placeholder.classList.toggle('hidden', isTerminal || isDebug);

    const terminalActions = this.panel.querySelectorAll('#btn-new-terminal, #btn-terminal-shell-menu, #btn-terminal-clear, #btn-terminal-kill');
    terminalActions.forEach((btn) => ((btn as HTMLButtonElement).disabled = !isTerminal));

    if (!isTerminal) {
      if (isDebug) return;
      const titles: Record<TerminalPanelView, string> = {
        terminal: '',
        problems: 'Problems view is active. No errors detected.',
        output: 'Output view is active.',
        debug: '',
      };
      this.placeholder.textContent = titles[view];
      return;
    }

    this.placeholder.textContent = '';
    this.fitActiveTerminal();
    this.getActiveTerminal()?.focus();
  }

  async createTerminal(options?: TerminalShell | TerminalCreateOptions): Promise<number> {
    const opts: TerminalCreateOptions =
      typeof options === 'string'
        ? { shell: options, cwd: this.cwd ?? undefined }
        : options || { cwd: this.cwd ?? undefined };

    if (!opts.shell) {
      opts.shell = this.settings.terminalShell;
    }

    // Estimate initial cols/rows from container dimensions
    const rect = this.container.getBoundingClientRect();
    const cols = Math.max(20, Math.floor((rect.width - 16) / 9));
    const rows = Math.max(5, Math.floor((rect.height - 10) / 18));
    opts.cols = cols;
    opts.rows = rows;

    const id = await window.electronAPI.createTerminal(opts);
    if (id < 0) return -1;

    const shell = opts.shell;
    const term = new Terminal({
      allowProposedApi: true,
      fontSize: this.settings.terminalFontSize || 14,
      fontFamily: this.settings.fontFamily || getTerminalFontFamily(shell),
      theme: getTerminalTheme(shell, this.settings.theme),
      cursorBlink: true,
      cursorStyle: shell === 'cmd' ? 'block' : 'bar',
      scrollback: 5000,
      convertEol: true,
      smoothScrollDuration: 80,
    });

    const fit = new FitAddon();
    this.loadAddon(term, fit, 'FitAddon');

    this.loadAddon(
      term,
      new WebLinksAddon((_event, uri) => {
        void window.electronAPI.openExternal(uri);
      }),
      'WebLinksAddon',
    );

    this.loadAddon(term, new ClipboardAddon(), 'ClipboardAddon');
    this.loadAddon(term, new SerializeAddon(), 'SerializeAddon');

    try {
      const unicode11 = new Unicode11Addon();
      term.loadAddon(unicode11);
      term.unicode.activeVersion = '11';
    } catch {
      /* Unicode11 fallback */
    }

    try {
      term.loadAddon(new LigaturesAddon());
    } catch {
      /* Ligatures optional */
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'terminal-xterm-wrap';
    wrapper.dataset.terminalId = String(id);
    this.container.appendChild(wrapper);

    term.open(wrapper);

    // Modern WebGL renderer with graceful fallback
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => {
        try { webgl.dispose(); } catch { /* ignore */ }
      });
      term.loadAddon(webgl);
    } catch {
      /* Canvas fallback */
    }

    // Direct terminal typing stream
    term.onData((data) => {
      window.electronAPI.writeTerminal(id, data);
    });

    // Handle standard terminal keyboard shortcuts
    term.attachCustomKeyEventHandler((event) => this.handleTerminalKey(event, term, id));

    // Right-click paste support
    wrapper.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      void this.paste();
    });

    const instance: TerminalInstance = {
      id,
      term,
      fit,
      wrapper,
      shell,
      title: getTerminalPanelTitle(shell),
      cwd: opts.cwd ?? null,
      isExited: false,
    };

    this.terminals.set(id, instance);
    this.setActiveSession(id);
    this.renderTabs();

    requestAnimationFrame(() => {
      this.fitActiveTerminal();
      term.focus();
    });

    return id;
  }

  private loadAddon(term: Terminal, addon: ITerminalAddon, label: string): void {
    try {
      term.loadAddon(addon);
    } catch (e) {
      console.warn(`${label} load error:`, e);
    }
  }

  private handleTerminalKey(event: KeyboardEvent, term: Terminal, id: number): boolean {
    const mod = event.ctrlKey || event.metaKey;

    // Ctrl+C: If there is a selection, copy it. Otherwise send SIGINT (\x03)
    if (mod && event.key.toLowerCase() === 'c' && !event.shiftKey) {
      if (term.hasSelection()) {
        void this.copySelection();
        return false;
      }
      // No selection -> let xterm send ^C (SIGINT) to PTY
      return true;
    }

    // Ctrl+Shift+C: Force Copy
    if (mod && event.shiftKey && event.key.toLowerCase() === 'c') {
      void this.copySelection();
      return false;
    }

    // Ctrl+V or Ctrl+Shift+V: Paste from clipboard
    if (mod && event.key.toLowerCase() === 'v') {
      void this.paste();
      return false;
    }

    // Ctrl+K or Ctrl+L: Clear terminal screen
    if (mod && (event.key.toLowerCase() === 'k' || event.key.toLowerCase() === 'l')) {
      term.clear();
      window.electronAPI.writeTerminal(id, '\x0c'); // Form Feed / clear signal
      return false;
    }

    // Ctrl+Shift+A: Select All
    if (mod && event.shiftKey && event.key.toLowerCase() === 'a') {
      term.selectAll();
      return false;
    }

    // Delegate other shortcuts to global handler if registered
    if (this.onShortcut?.(event)) {
      return false;
    }

    return true;
  }

  private setActiveSession(id: number): void {
    this.activeId = id;

    this.terminals.forEach((inst, instId) => {
      const isActive = instId === id;
      inst.wrapper.classList.toggle('hidden', !isActive);
      if (isActive) {
        requestAnimationFrame(() => {
          this.fitInstance(inst);
          inst.term.focus();
        });
        if (inst.cwd) {
          this.onTerminalCwdDisplay?.(inst.cwd);
          this.onCwdChange?.(inst.cwd);
        }
      }
    });

    this.renderTabs();
  }

  private renderTabs(): void {
    if (!this.tabsContainer) return;
    this.tabsContainer.replaceChildren();

    let index = 1;
    this.terminals.forEach((inst) => {
      const rawTitle = inst.title || inst.shell;
      let cleanTitle = rawTitle;
      if (rawTitle.includes('@') && rawTitle.includes(':')) {
        const colon = rawTitle.lastIndexOf(':');
        const p = rawTitle.slice(colon + 1).trim();
        const folder = p.replace(/^~[\\/]?/, '').split(/[\\/]/).filter(Boolean).pop();
        cleanTitle = folder ? `${inst.shell}: ${folder}` : inst.shell;
      }
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = `terminal-instance-tab ${inst.id === this.activeId ? 'active' : ''}`;
      tab.title = `${cleanTitle} (${inst.shell})${inst.cwd ? `\n${inst.cwd}` : ''}`;

      const titleSpan = document.createElement('span');
      titleSpan.className = 'terminal-instance-tab-title';
      titleSpan.textContent = `${index}: ${cleanTitle}`;
      tab.appendChild(titleSpan);

      if (inst.isExited) {
        const exitSpan = document.createElement('span');
        exitSpan.className = 'shell-badge';
        exitSpan.textContent = '[Exited]';
        exitSpan.style.color = 'var(--accent-error, #f44336)';
        tab.appendChild(exitSpan);
      }

      const closeBtn = document.createElement('span');
      closeBtn.className = 'terminal-instance-tab-close';
      closeBtn.innerHTML = '×';
      closeBtn.title = 'Kill Terminal';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.killTerminal(inst.id);
      });
      tab.appendChild(closeBtn);

      tab.addEventListener('click', () => {
        this.setActiveSession(inst.id);
      });

      this.tabsContainer.appendChild(tab);
      index++;
    });

    const activeInst = this.activeId ? this.terminals.get(this.activeId) : null;
    const tabLabel = document.getElementById('terminal-tab-label');
    if (tabLabel && activeInst) {
      tabLabel.textContent = getTerminalPanelTitle(activeInst.shell);
    }
  }

  private toggleShellDropdown(): void {
    if (!this.shellDropdown) return;
    const isHidden = this.shellDropdown.classList.contains('hidden');
    if (!isHidden) {
      this.shellDropdown.classList.add('hidden');
      return;
    }

    this.shellDropdown.replaceChildren();
    const shells = this.availableShells.length > 0
      ? this.availableShells
      : [
          { id: 'bash', name: 'Bash', path: 'bash' },
          { id: 'powershell', name: 'PowerShell', path: 'powershell' },
          { id: 'cmd', name: 'Command Prompt', path: 'cmd' },
        ];

    shells.forEach((shell) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'terminal-shell-item';
      btn.innerHTML = `<span>${shell.name}</span><span class="shell-badge">${shell.id}</span>`;
      btn.addEventListener('click', () => {
        this.shellDropdown?.classList.add('hidden');
        void this.createTerminal({ shell: shell.id as TerminalShell });
      });
      this.shellDropdown?.appendChild(btn);
    });

    this.shellDropdown.classList.remove('hidden');
  }

  private fitInstance(inst: TerminalInstance): boolean {
    if (!this.isVisible() || this.activeView !== 'terminal') return false;
    const rect = this.container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;

    try {
      inst.fit.fit();
      window.electronAPI.resizeTerminal(inst.id, inst.term.cols, inst.term.rows);
      return true;
    } catch {
      return false;
    }
  }

  private fitActiveTerminal(): void {
    if (this.activeId === null) return;
    const inst = this.terminals.get(this.activeId);
    if (inst) {
      this.fitInstance(inst);
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
      this.fitActiveTerminal();
      this.getActiveTerminal()?.focus();
    }

    this.setQuickAccessActive(true);
    this.syncWelcomeLayout();
    this.syncResizer();
  }

  toggle(): void {
    const hidden = this.panel.classList.contains('hidden');
    if (hidden) {
      void this.show();
    } else {
      this.panel.classList.add('hidden');
      this.setQuickAccessActive(false);
      this.syncResizer();
    }
    this.syncWelcomeLayout();
  }

  toggleMaximize(): void {
    this.isMaximized = !this.isMaximized;
    this.panel.classList.toggle('panel-maximized', this.isMaximized);
    const maxIcon = document.getElementById('icon-terminal-max');
    if (maxIcon) {
      maxIcon.innerHTML = this.isMaximized
        ? '<path fill="currentColor" d="M4.5 4.5h7v7h-7v-7zm1.5 1.5v4h4v-4h-4z"/>'
        : '<path fill="currentColor" d="M2.5 2.5h4v1.5h-2.5v2.5h-1.5v-4zm7 0h4v4h-1.5v-2.5h-2.5v-1.5zm-7 7h1.5v2.5h2.5v1.5h-4v-4zm11 0v4h-4v-1.5h2.5v-2.5h1.5z"/>';
    }
    this.syncResizer();
    this.fitActiveTerminal();
  }

  isVisible(): boolean {
    return !this.panel.classList.contains('hidden');
  }

  focus(): void {
    if (!this.isVisible()) {
      void this.show();
    } else {
      this.getActiveTerminal()?.focus();
    }
  }

  killActiveTerminal(): void {
    if (this.activeId !== null) {
      this.killTerminal(this.activeId);
    }
  }

  killTerminal(id: number): void {
    const inst = this.terminals.get(id);
    if (!inst) return;

    window.electronAPI.killTerminal(id);
    try {
      inst.term.dispose();
    } catch {
      /* ignore */
    }
    inst.wrapper.remove();
    this.terminals.delete(id);

    if (this.activeId === id) {
      const remaining = Array.from(this.terminals.keys());
      if (remaining.length > 0) {
        this.setActiveSession(remaining[remaining.length - 1]!);
      } else {
        this.activeId = null;
        this.renderTabs();
      }
    } else {
      this.renderTabs();
    }
  }

  clear(): void {
    const inst = this.getActiveInstance();
    if (inst) {
      inst.term.clear();
      window.electronAPI.writeTerminal(inst.id, '\x0c');
    }
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

    window.electronAPI.writeTerminal(id, payload);
    this.getActiveTerminal()?.focus();
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

  selectAll(): void {
    this.getActiveTerminal()?.selectAll();
  }

  async sendCommand(command: string, execute = true): Promise<void> {
    if (!this.isVisible()) await this.show();
    if (this.terminals.size === 0) await this.createTerminal();

    const id = this.activeId;
    if (id === null) return;

    const suffix = execute ? '\r\n' : '';
    window.electronAPI.writeTerminal(id, command + suffix);
    this.getActiveTerminal()?.focus();
  }

  setCwd(path: string | null): void {
    this.cwd = path;
    if (this.activeId !== null) {
      const inst = this.terminals.get(this.activeId);
      if (inst && path) inst.cwd = path;
    }
  }

  getTerminalCwd(): string | null {
    if (this.activeId !== null) {
      return this.terminals.get(this.activeId)?.cwd ?? this.cwd;
    }
    return this.cwd;
  }

  async changeDirectory(dirPath: string, syncExplorer = false): Promise<void> {
    this.cwd = dirPath;
    if (this.terminals.size === 0) return;

    const inst = this.getActiveInstance();
    if (!inst) return;

    const shell = inst.shell;
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
    if (syncExplorer) this.onCwdChange?.(dirPath);
  }

  applySettings(settings: AppSettings): void {
    this.settings = settings;
    const theme = getTerminalTheme(this.settings.terminalShell, this.settings.theme);
    const fontFamily = this.settings.fontFamily || getTerminalFontFamily(this.settings.terminalShell);

    this.terminals.forEach(({ term, shell }) => {
      term.options.theme = getTerminalTheme(shell, this.settings.theme) || theme;
      term.options.fontFamily = fontFamily;
      term.options.fontSize = this.settings.terminalFontSize || 14;
    });

    this.fitActiveTerminal();
  }

  async recreateForShellChange(): Promise<void> {
    const cwd = this.getTerminalCwd();
    this.disposeSessions();
    if (this.isVisible()) {
      await this.createTerminal({ cwd: cwd ?? undefined, shell: this.settings.terminalShell });
    }
  }

  private getActiveTerminal(): Terminal | null {
    if (this.activeId === null) return null;
    return this.terminals.get(this.activeId)?.term ?? null;
  }

  private getActiveInstance(): TerminalInstance | null {
    if (this.activeId === null) return null;
    return this.terminals.get(this.activeId) ?? null;
  }

  private setQuickAccessActive(active: boolean): void {
    document.getElementById('btn-terminal-quick')?.classList.toggle('active', active);
    document.getElementById('status-terminal')?.classList.toggle('active', active);
  }

  private syncWelcomeLayout(): void {
    const details = document.querySelector('.welcome-shortcuts-panel') as HTMLDetailsElement | null;
    if (details && this.isVisible()) details.removeAttribute('open');
  }

  private disposeSessions(): void {
    this.terminals.forEach((inst) => {
      window.electronAPI.killTerminal(inst.id);
      try { inst.term.dispose(); } catch { /* ignore */ }
      inst.wrapper.remove();
    });
    this.terminals.clear();
    this.activeId = null;
    this.renderTabs();
  }

  dispose(): void {
    this.resizeObserver?.disconnect();
    this.unsubs.forEach((unsub) => unsub());
    this.unsubs = [];
    this.disposeSessions();
  }
}

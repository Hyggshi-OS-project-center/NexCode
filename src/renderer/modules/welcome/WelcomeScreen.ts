/**
 * Welcome screen shown when no folder is open and no editor tabs are active.
 */
export class WelcomeScreen {
  private container: HTMLElement;
  private onOpenFolder: () => void;
  private onOpenFile: () => void;
  private onNewFile: () => void;
  private onAIAgent: () => void;
  private onToggleTerminal: () => void;

  constructor(
    containerId: string,
    handlers: {
      onOpenFolder: () => void;
      onOpenFile: () => void;
      onNewFile: () => void;
      onAIAgent: () => void;
      onToggleTerminal: () => void;
    },
  ) {
    this.container = document.getElementById(containerId)!;
    this.onOpenFolder = handlers.onOpenFolder;
    this.onOpenFile = handlers.onOpenFile;
    this.onNewFile = handlers.onNewFile;
    this.onAIAgent = handlers.onAIAgent;
    this.onToggleTerminal = handlers.onToggleTerminal;
    this.render();
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="welcome-content">
        <div class="welcome-logo" aria-hidden="true">
          <svg viewBox="0 0 48 48" width="48" height="48"><path fill="currentColor" d="M24 4l18 10.5v19L24 44 6 33.5v-19L24 4z"/></svg>
        </div>
        <h1>NexCode IDE</h1>
        <p>A world-class code editor at its core, enhanced with integrated tools and AI-ready workflows.</p>
        <div class="welcome-actions">
          <button class="welcome-btn primary" data-action="folder">Open Folder</button>
          <button class="welcome-btn" data-action="file">Open File</button>
          <button class="welcome-btn" data-action="new">New File</button>
          <button class="welcome-btn" data-action="agent">AI Agent</button>
          <button class="welcome-btn" data-action="terminal">Toggle Terminal</button>
        </div>
        <details class="welcome-shortcuts-panel">
          <summary>Keyboard shortcuts</summary>
          <div class="welcome-shortcuts">
            <span><kbd>Ctrl</kbd>+ <kbd>S</kbd> Save</span>
            <span><kbd>Ctrl</kbd>+ <kbd>F</kbd> Find</span>
            <span><kbd>Ctrl</kbd>+ <kbd>H</kbd> Replace</span>
            <span><kbd>Ctrl</kbd>+ <kbd>\`</kbd> Terminal</span>
            <span><kbd>F5</kbd> Run file</span>
            <span><kbd>Ctrl</kbd>+ Scroll Zoom</span>
          </div>
        </details>
      </div>
    `;

    this.container.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = (btn as HTMLElement).dataset.action;
        if (action === 'folder') this.onOpenFolder();
        if (action === 'file') this.onOpenFile();
        if (action === 'new') this.onNewFile();
        if (action === 'agent') this.onAIAgent();
        if (action === 'terminal') this.onToggleTerminal();
      });
    });
  }

  show(): void {
    this.container.classList.remove('hidden');
  }

  hide(): void {
    this.container.classList.add('hidden');
  }
}

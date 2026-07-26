/**
 * Convenience store panel — lists installed .vsix extensions.
 */
import type { InstalledVsixExtension } from '../plugin/VsixExtensionStore';
import type { PluginHost } from '../plugin/PluginHost';

export class ConvenienceStoreView {
  private listEl: HTMLElement;
  private host: PluginHost | null = null;
  private onInstallRequested?: () => void;

  constructor(listEl: HTMLElement, onInstallRequested?: () => void) {
    this.listEl = listEl;
    this.onInstallRequested = onInstallRequested;
    this.render([]);
  }

  setHost(host: PluginHost): void {
    this.host = host;
  }

  setInstallHandler(handler: () => void): void {
    this.onInstallRequested = handler;
  }

  render(extensions: InstalledVsixExtension[]): void {
    const installButtonHtml = `
      <button type="button" class="store-install-btn" data-action="install-extension">
        + Install Extension...
      </button>
    `;

    if (extensions.length === 0) {
      this.listEl.innerHTML = `
        ${installButtonHtml}
        <p class="sidebar-section-empty">No extensions installed</p>
        <p class="sidebar-section-hint">Install a <code>.hsixet</code> or <code>.hsiext</code> file to get started.</p>
      `;
      this.bindInstallButton();
      return;
    }

    this.listEl.innerHTML = installButtonHtml;
    this.bindInstallButton();
    extensions.forEach((ext) => {
      const row = document.createElement('div');
      row.className = 'store-item';
      row.setAttribute('tabindex', '0');
      
      const isTheme = Boolean(ext.manifest.theme);
      const icon = isTheme ? '🎨' : '📦';
      const typeLabel = isTheme ? 'theme' : 'extension';
      const author = ext.manifest.author ? ` by ${escapeHtml(ext.manifest.author)}` : '';
      const desc = ext.manifest.description ? ` — ${escapeHtml(ext.manifest.description)}` : '';
      
      row.innerHTML = `
        <span class="store-icon">${icon}</span>
        <span class="store-meta">
          <span class="store-name">${escapeHtml(ext.manifest.name)}</span>
          <span class="store-id">${escapeHtml(ext.manifest.id)}${author}</span>
          <span class="store-version">v${escapeHtml(ext.manifest.version)} · ${typeLabel}${desc}</span>
        </span>
      `;
      row.title = ext.path;

      const commands = ext.manifest.commands ?? [];

      row.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showCommandMenu(row, ext, commands);
      });

      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.showCommandMenu(row, ext, commands);
        }
      });

      this.listEl.appendChild(row);
    });
  }

  private bindInstallButton(): void {
    this.listEl
      .querySelector('[data-action="install-extension"]')
      ?.addEventListener('click', () => this.onInstallRequested?.());
  }

  private showCommandMenu(
    anchor: HTMLElement,
    ext: InstalledVsixExtension,
    commands: { id: string; title: string }[],
  ): void {
    document.querySelector('.store-command-menu')?.remove();

    const menu = document.createElement('div');
    menu.className = 'store-command-menu';

    if (commands.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'store-command-empty';
      empty.textContent = 'No commands';
      menu.appendChild(empty);
    } else {
      commands.forEach((cmd) => {
        const item = document.createElement('button');
        item.className = 'store-command-item';
        item.textContent = cmd.title;
        item.title = cmd.id;
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          menu.remove();
          const fullId = `${ext.manifest.id}.${cmd.id}`;
          this.host
            ?.executeCommand(fullId)
            .catch((err: unknown) => console.warn('[ConvenienceStore] Command failed:', err));
        });
        menu.appendChild(item);
      });
    }

    const rect = anchor.getBoundingClientRect();
    menu.style.cssText = `
      position: fixed;
      top: ${rect.bottom + 4}px;
      left: ${rect.left}px;
      min-width: ${rect.width}px;
      z-index: 9999;
    `;

    document.body.appendChild(menu);

    const close = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        menu.remove();
        document.removeEventListener('click', close);
      }
    };
    setTimeout(() => document.addEventListener('click', close), 0);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

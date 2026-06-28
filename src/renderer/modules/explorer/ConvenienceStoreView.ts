/**
 * Convenience store panel — lists installed .vsix extensions.
 */
import type { InstalledVsixExtension } from '../plugin/VsixExtensionStore';
import type { PluginHost } from '../plugin/PluginHost';

export class ConvenienceStoreView {
  private listEl: HTMLElement;
  private host: PluginHost | null = null;

  constructor(listEl: HTMLElement) {
    this.listEl = listEl;
    this.render([]);
  }

  setHost(host: PluginHost): void {
    this.host = host;
  }

  render(extensions: InstalledVsixExtension[]): void {
    if (extensions.length === 0) {
      this.listEl.innerHTML = `
        <p class="sidebar-section-empty">No theme extensions installed</p>
        <p class="sidebar-section-hint">Add manifests to <code>.nexcode/extensions/*.hsixet</code> or <code>*.hsiext</code></p>
      `;
      return;
    }

    this.listEl.innerHTML = '';
    extensions.forEach((ext) => {
      const row = document.createElement('div');
      row.className = 'store-item';
      row.setAttribute('tabindex', '0');
      row.innerHTML = `
        <span class="store-icon">📦</span>
        <span class="store-meta">
          <span class="store-name">${escapeHtml(ext.manifest.name)}</span>
          <span class="store-version">v${escapeHtml(ext.manifest.version)} · theme manifest</span>
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

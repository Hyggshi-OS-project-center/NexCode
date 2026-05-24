/**
 * Convenience store panel — lists installed .vsix extensions.
 */
import type { InstalledVsixExtension } from '../plugin/VsixExtensionStore';

export class ConvenienceStoreView {
  private listEl: HTMLElement;

  constructor(listEl: HTMLElement) {
    this.listEl = listEl;
    this.render([]);
  }

  render(extensions: InstalledVsixExtension[]): void {
    if (extensions.length === 0) {
      this.listEl.innerHTML = `
        <p class="sidebar-section-empty">No .vsix extensions installed</p>
        <p class="sidebar-section-hint">Add manifests to <code>.nexcode/extensions/*.vsix</code></p>
      `;
      return;
    }
    this.listEl.innerHTML = '';
    extensions.forEach((ext) => {
      const row = document.createElement('div');
      row.className = 'store-item';
      row.innerHTML = `
        <span class="store-icon">📦</span>
        <span class="store-meta">
          <span class="store-name">${escapeHtml(ext.manifest.name)}</span>
          <span class="store-version">v${escapeHtml(ext.manifest.version)} · .vsix</span>
        </span>
      `;
      row.title = ext.path;
      this.listEl.appendChild(row);
    });
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

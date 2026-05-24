/**
 * Editor notification bar (e.g. invisible unicode warning), similar to VS Code.
 */
export class EditorBanner {
  private el: HTMLElement;

  constructor(containerId: string) {
    const parent = document.getElementById(containerId)!;
    this.el = document.createElement('div');
    this.el.id = 'editor-banner';
    this.el.className = 'editor-banner hidden';
    parent.insertBefore(this.el, parent.firstChild);
  }

  showInvisibleUnicodeWarning(onDisable: () => void): void {
    this.el.innerHTML = `
      <span class="editor-banner-icon">⚠</span>
      <span class="editor-banner-text">This document contains many invisible unicode characters</span>
      <button type="button" class="editor-banner-action" data-action="dismiss">Disable Invisible Highlight</button>
    `;
    this.el.querySelector('[data-action="dismiss"]')?.addEventListener('click', () => {
      this.hide();
      onDisable();
    });
    this.el.classList.remove('hidden');
  }

  hide(): void {
    this.el.classList.add('hidden');
  }
}

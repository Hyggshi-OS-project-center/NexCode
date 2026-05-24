/**
 * Custom right-click context menu for editor and explorer.
 */
export interface MenuItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  separator?: boolean;
}

export class ContextMenu {
  private menu: HTMLElement;

  constructor(menuId: string) {
    this.menu = document.getElementById(menuId)!;
    document.addEventListener('mousedown', (e) => this.onDocumentPointerDown(e));
  }

  private onDocumentPointerDown(e: MouseEvent): void {
    if (this.menu.classList.contains('hidden')) return;
    const target = e.target as HTMLElement;
    if (target.closest('.context-menu')) return;
    this.hide();
  }

  show(x: number, y: number, items: MenuItem[]): void {
    this.menu.innerHTML = '';
    items.forEach((item) => {
      if (item.separator) {
        const sep = document.createElement('li');
        sep.className = 'separator';
        this.menu.appendChild(sep);
        return;
      }
      const li = document.createElement('li');
      li.innerHTML = `<span>${item.label}</span>${item.shortcut ? `<span class="shortcut">${item.shortcut}</span>` : ''}`;
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      li.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hide();
        item.action?.();
      });
      this.menu.appendChild(li);
    });

    this.menu.classList.remove('hidden');
    const rect = this.menu.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - 8;
    const maxY = window.innerHeight - rect.height - 8;
    this.menu.style.left = `${Math.min(x, maxX)}px`;
    this.menu.style.top = `${Math.min(y, maxY)}px`;
  }

  hide(): void {
    this.menu.classList.add('hidden');
  }
}

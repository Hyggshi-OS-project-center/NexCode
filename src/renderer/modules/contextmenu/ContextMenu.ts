/**
 * Custom right-click context menu and title-bar dropdown for editor and explorer.
 * Supports separators, disabled section headers, toggleable checkmarks, and
 * one-level hover flyout submenus (e.g. "Open Recent ›").
 */
export interface MenuItem {
  label?: string;
  shortcut?: string;
  action?: () => void;
  separator?: boolean;
  /** Render the item as a non-clickable section header (e.g. "Open Recent"). */
  disabled?: boolean;
  /** Show a checkmark to indicate a toggled-on state (e.g. "Auto Save"). */
  checked?: boolean;
  /** Submenu items — when present, the item renders a chevron and the menu flies out on hover. */
  submenu?: MenuItem[];
}

interface MenuNode {
  el: HTMLElement;
  items: MenuItem[];
}

export class ContextMenu {
  private menu: HTMLElement;
  private openSubmenus: MenuNode[] = [];
  private hideTimer: number | null = null;
  private rootItems: MenuItem[] = [];

  constructor(menuId: string) {
    this.menu = document.getElementById(menuId)!;
    document.addEventListener('mousedown', (e) => this.onDocumentPointerDown(e));
  }

  private onDocumentPointerDown(e: MouseEvent): void {
    if (this.menu.classList.contains('hidden')) return;
    if (e.button === 2) return;
    const target = e.target as HTMLElement;
    if (target.closest('.context-menu')) return;
    this.hide();
  }

  show(x: number, y: number, items: MenuItem[]): void {
    this.rootItems = items;
    this.renderMenu(this.menu, items, { isSubmenu: false });
    this.menu.classList.remove('hidden');
    this.positionMenu(this.menu, x, y, false);
  }

  hide(): void {
    this.menu.classList.add('hidden');
    this.closeAllSubmenus();
  }

  /** Re-render the root menu in place (e.g. after a toggle flip). */
  refresh(): void {
    if (this.menu.classList.contains('hidden')) return;
    const rect = this.menu.getBoundingClientRect();
    this.renderMenu(this.menu, this.rootItems, { isSubmenu: false });
    this.positionMenu(this.menu, rect.left, rect.top, false);
  }

  private renderMenu(container: HTMLElement, items: MenuItem[], opts: { isSubmenu: boolean }): void {
    container.innerHTML = '';
    items.forEach((item) => {
      if (item.separator) {
        const sep = document.createElement('li');
        sep.className = 'separator';
        container.appendChild(sep);
        return;
      }
      const li = document.createElement('li');
      if (item.disabled) li.classList.add('is-disabled');
      if (item.checked) li.classList.add('is-checked');
      if (item.submenu && item.submenu.length > 0) li.classList.add('has-submenu');
      const checkmark = item.checked ? '<span class="context-check">✓</span>' : '';
      const chevron = item.submenu && item.submenu.length > 0 ? '<span class="context-chevron">›</span>' : '';
      const labelSpan = document.createElement('span');
      labelSpan.className = 'context-label';
      labelSpan.textContent = item.label ?? '';
      const shortcutSpan = item.shortcut
        ? `<span class="shortcut">${item.shortcut}</span>`
        : '';
      li.innerHTML = `${checkmark}<span class="context-label">${item.label ?? ''}</span>${shortcutSpan}${chevron}`;
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      li.addEventListener('click', (e) => {
        e.stopPropagation();
        if (item.disabled) return;
        if (item.submenu && item.submenu.length > 0) return; // flyout handles it
        this.hide();
        item.action?.();
      });
      if (item.submenu && item.submenu.length > 0) {
        const flyout = this.createFlyoutMenu(item.submenu);
        li.appendChild(flyout);
        li.addEventListener('mouseenter', () => this.openFlyout(li, flyout, item.submenu!));
        li.addEventListener('mouseleave', () => this.scheduleCloseFlyout(flyout));
      }
      container.appendChild(li);
    });
  }

  private createFlyoutMenu(items: MenuItem[]): HTMLElement {
    const flyout = document.createElement('ul');
    flyout.className = 'context-menu submenu';
    flyout.style.display = 'none';
    flyout.addEventListener('mouseenter', () => this.cancelCloseFlyout());
    flyout.addEventListener('mouseleave', () => this.scheduleCloseFlyout(flyout));
    this.renderMenu(flyout, items, { isSubmenu: true });
    document.body.appendChild(flyout);
    return flyout;
  }

  private openFlyout(parentLi: HTMLElement, flyout: HTMLElement, items: MenuItem[]): void {
    this.cancelCloseFlyout();
    // Close any other open submenus first
    for (const node of this.openSubmenus) {
      if (node.el !== flyout) node.el.style.display = 'none';
    }
    this.openSubmenus = this.openSubmenus.filter((node) => node.el === flyout);
    if (this.openSubmenus.length === 0) {
      this.openSubmenus.push({ el: flyout, items });
    }
    flyout.style.display = 'block';
    const rect = parentLi.getBoundingClientRect();
    const flyoutRect = flyout.getBoundingClientRect();
    const maxX = window.innerWidth - flyoutRect.width - 8;
    const maxY = window.innerHeight - flyoutRect.height - 8;
    const left = Math.min(rect.right, maxX);
    const top = Math.min(rect.top, maxY);
    flyout.style.left = `${left}px`;
    flyout.style.top = `${top}px`;
  }

  private scheduleCloseFlyout(flyout: HTMLElement): void {
    this.cancelCloseFlyout();
    this.hideTimer = window.setTimeout(() => {
      flyout.style.display = 'none';
      this.openSubmenus = this.openSubmenus.filter((n) => n.el !== flyout);
    }, 180);
  }

  private cancelCloseFlyout(): void {
    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  private closeAllSubmenus(): void {
    this.cancelCloseFlyout();
    for (const node of this.openSubmenus) {
      node.el.remove();
    }
    this.openSubmenus = [];
    // Also remove any orphan flyouts the DOM might still hold
    document.querySelectorAll('.context-menu.submenu').forEach((el) => el.remove());
  }

  private positionMenu(menu: HTMLElement, x: number, y: number, isSubmenu: boolean): void {
    const rect = menu.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - 8;
    const maxY = window.innerHeight - rect.height - 8;
    menu.style.left = `${Math.min(x, maxX)}px`;
    menu.style.top = `${Math.min(y, maxY)}px`;
  }
}

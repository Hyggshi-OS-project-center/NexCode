/**
 * Tab bar — manages open file tabs and coordinates with the editor.
 */
export interface OpenTab {
  path: string;
  name: string;
  dirty: boolean;
}

type TabEvent = 'select' | 'close';

export class TabManager {
  private bar: HTMLElement;
  private tabs: OpenTab[] = [];
  private activePath: string | null = null;
  private listeners = new Map<TabEvent, Set<(path: string) => void>>();

  constructor(barId: string) {
    this.bar = document.getElementById(barId)!;
  }

  on(event: TabEvent, handler: (path: string) => void): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
  }

  private emit(event: TabEvent, path: string): void {
    this.listeners.get(event)?.forEach((fn) => fn(path));
  }

  openTab(path: string): void {
    const name = path.split(/[/\\]/).pop() ?? path;
    const existing = this.tabs.find((t) => t.path === path);
    if (!existing) {
      this.tabs.push({ path, name, dirty: false });
    }
    this.activePath = path;
    this.render();
  }

  closeTab(path: string): void {
    this.tabs = this.tabs.filter((t) => t.path !== path);
    if (this.activePath === path) {
      this.activePath = this.tabs.length ? this.tabs[this.tabs.length - 1].path : null;
    }
    this.render();
    this.emit('close', path);
    if (this.activePath) this.emit('select', this.activePath);
  }

  setActive(path: string): void {
    this.activePath = path;
    this.render();
    this.emit('select', path);
  }

  setDirty(path: string, dirty: boolean): void {
    const tab = this.tabs.find((t) => t.path === path);
    if (tab) {
      tab.dirty = dirty;
      this.render();
    }
  }

  getActivePath(): string | null {
    return this.activePath;
  }

  hasTabs(): boolean {
    return this.tabs.length > 0;
  }

  getTabs(): OpenTab[] {
    return [...this.tabs];
  }

  private render(): void {
    this.bar.innerHTML = '';
    this.tabs.forEach((tab) => {
      const el = document.createElement('div');
      el.className = `editor-tab${tab.path === this.activePath ? ' active' : ''}${tab.dirty ? ' dirty' : ''}`;
      el.innerHTML = `
        <span class="tab-name">${tab.name}</span>
        <button class="tab-close" title="Close">×</button>
      `;
      el.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).classList.contains('tab-close')) {
          e.stopPropagation();
          this.closeTab(tab.path);
        } else {
          this.setActive(tab.path);
        }
      });
      this.bar.appendChild(el);
    });
  }
}

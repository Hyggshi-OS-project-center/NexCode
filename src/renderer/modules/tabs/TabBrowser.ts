/**
 * Tab Browser — quick tab switcher overlay (Ctrl+Tab) with back/forward
 * navigation history for editor tabs.
 *
 * Features:
 * - Ctrl+Tab overlay to quickly switch between open tabs
 * - Back/Forward history navigation through recently visited tabs
 * - Keyboard-driven selection with arrow keys and Enter
 */
import type { OpenTab } from './TabManager';

interface HistoryEntry {
  path: string;
  timestamp: number;
}

export class TabBrowser {
  private overlay: HTMLElement | null = null;
  private tabs: OpenTab[] = [];
  private activePath: string | null = null;
  private history: HistoryEntry[] = [];
  private historyIndex = -1;
  private selectedIndex = 0;
  private visible = false;

  /** Maximum history entries to keep */
  private static readonly MAX_HISTORY = 50;

  get canGoBack(): boolean {
    return this.historyIndex > 0;
  }

  get canGoForward(): boolean {
    return this.historyIndex < this.history.length - 1;
  }

  /**
   * Navigate back in history. Returns the path to switch to, or null if
   * there's no previous entry.
   */
  navigateBack(): string | null {
    if (!this.canGoBack) return null;
    this.historyIndex--;
    return this.history[this.historyIndex]?.path ?? null;
  }

  /**
   * Navigate forward in history. Returns the path to switch to, or null if
   * there's no next entry.
   */
  navigateForward(): string | null {
    if (!this.canGoForward) return null;
    this.historyIndex++;
    return this.history[this.historyIndex]?.path ?? null;
  }

  /**
   * Push a navigation entry to the history stack. Call this when the user
   * switches to a tab so we can track back/forward navigation.
   */
  pushNavigation(path: string): void {
    // If we're not at the end of the history, truncate forward entries
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }

    // Don't duplicate consecutive entries
    const last = this.history[this.history.length - 1];
    if (last && last.path === path) {
      last.timestamp = Date.now();
      return;
    }

    this.history.push({ path, timestamp: Date.now() });

    // Trim to max size
    if (this.history.length > TabBrowser.MAX_HISTORY) {
      this.history.shift();
    }

    this.historyIndex = this.history.length - 1;
  }

  /**
   * Update the tab list shown in the overlay.
   */
  updateTabs(tabs: OpenTab[], activePath: string | null): void {
    this.tabs = tabs;
    this.activePath = activePath;
  }

  /**
   * Show the Tab Browser overlay.
   */
  show(): void {
    this.ensureOverlay();
    if (this.overlay) {
      this.overlay.classList.remove('hidden');
      this.overlay.classList.add('tab-browser--visible');
      this.visible = true;
    }
    this.selectedIndex = this.getActiveTabIndex();
    this.renderOverlay();
    this.focusOverlay();
  }

  /**
   * Hide the Tab Browser overlay.
   */
  hide(): void {
    if (this.overlay) {
      this.overlay.classList.add('hidden');
      this.overlay.classList.remove('tab-browser--visible');
      this.visible = false;
    }
  }

  /**
   * Toggle the Tab Browser overlay visibility.
   */
  toggle(): void {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  isVisible(): boolean {
    return this.visible;
  }

  private getActiveTabIndex(): number {
    if (!this.activePath) return 0;
    const idx = this.tabs.findIndex((t) => t.path === this.activePath);
    return idx >= 0 ? idx : 0;
  }

  private ensureOverlay(): void {
    if (this.overlay) return;

    this.overlay = document.createElement('div');
    this.overlay.className = 'tab-browser-overlay hidden';
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-label', 'Quick tab switcher');

    // Create the list container
    const list = document.createElement('div');
    list.className = 'tab-browser-list';
    list.id = 'tab-browser-list';
    this.overlay.appendChild(list);

    // Click outside to close
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.hide();
      }
    });

    document.body.appendChild(this.overlay);
  }

  private renderOverlay(): void {
    if (!this.overlay) return;
    const list = this.overlay.querySelector('#tab-browser-list') as HTMLElement;
    if (!list) return;

    list.innerHTML = '';

    if (this.tabs.length === 0) {
      list.textContent = '(No open tabs)';
      return;
    }

    this.tabs.forEach((tab, idx) => {
      const item = document.createElement('div');
      item.className = 'tab-browser-item';
      if (idx === this.selectedIndex) {
        item.classList.add('selected');
      }
      if (tab.path === this.activePath) {
        item.classList.add('active');
      }

      // File icon
      const icon = document.createElement('span');
      icon.className = 'tab-browser-icon';
      const ext = tab.name.split('.').pop()?.toLowerCase() ?? '';
      icon.textContent = ext ? `[${ext}]` : '[?]';
      item.appendChild(icon);

      // Tab name
      const name = document.createElement('span');
      name.className = 'tab-browser-name';
      name.textContent = tab.name;
      item.appendChild(name);

      // Dirty indicator
      if (tab.dirty) {
        const dirty = document.createElement('span');
        dirty.className = 'tab-browser-dirty';
        dirty.textContent = '●';
        item.appendChild(dirty);
      }

      // Path hint
      const pathHint = document.createElement('span');
      pathHint.className = 'tab-browser-path';
      const parts = tab.path.split(/[/\\]/);
      const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
      pathHint.textContent = dir ? `— ${dir}` : '';
      item.appendChild(pathHint);

      // Click to select
      item.addEventListener('click', () => {
        this.selectedIndex = idx;
        this.confirmSelection();
      });

      // Hover to preview
      item.addEventListener('mouseenter', () => {
        this.selectedIndex = idx;
        this.highlightSelection();
      });

      list.appendChild(item);
    });

    // Scroll selected item into view
    const selected = list.querySelector('.selected') as HTMLElement | null;
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }

  private highlightSelection(): void {
    const list = this.overlay?.querySelector('#tab-browser-list');
    if (!list) return;
    list.querySelectorAll('.tab-browser-item').forEach((item, idx) => {
      item.classList.toggle('selected', idx === this.selectedIndex);
    });
  }

  private confirmSelection(): void {
    const tab = this.tabs[this.selectedIndex];
    if (tab && tab.path !== this.activePath) {
      // Navigate back to the current tab's position in the actual tab manager
      // The caller (NexusApp) handles switching tabs via the back/forward or setActive
      this.pushNavigation(tab.path);
    }
    this.hide();
  }

  private focusOverlay(): void {
    // Set up keyboard navigation
    const handler = (e: KeyboardEvent) => {
      if (!this.visible) {
        document.removeEventListener('keydown', handler);
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
        case 'Tab': {
          e.preventDefault();
          if (e.shiftKey) {
            this.selectedIndex = this.selectedIndex <= 0
              ? this.tabs.length - 1
              : this.selectedIndex - 1;
          } else {
            this.selectedIndex = this.selectedIndex >= this.tabs.length - 1
              ? 0
              : this.selectedIndex + 1;
          }
          this.highlightSelection();
          const list = this.overlay?.querySelector('#tab-browser-list');
          const selected = list?.querySelector('.selected') as HTMLElement | null;
          selected?.scrollIntoView({ block: 'nearest' });
          break;
        }
        case 'ArrowUp':
          e.preventDefault();
          this.selectedIndex = this.selectedIndex <= 0
            ? this.tabs.length - 1
            : this.selectedIndex - 1;
          this.highlightSelection();
          const list2 = this.overlay?.querySelector('#tab-browser-list');
          const selected2 = list2?.querySelector('.selected') as HTMLElement | null;
          selected2?.scrollIntoView({ block: 'nearest' });
          break;
        case 'Enter':
          e.preventDefault();
          this.confirmSelection();
          break;
        case 'Escape':
          e.preventDefault();
          this.hide();
          break;
      }
    };

    // Remove any old listeners by adding the new one after a microtask
    // (handlers are anonymous, so we rely on the document listener being
    // active for the duration of the overlay being visible)
    document.addEventListener('keydown', handler);
    // Clean up when hidden
    const observer = new MutationObserver(() => {
      if (!this.visible) {
        document.removeEventListener('keydown', handler);
        observer.disconnect();
      }
    });
    if (this.overlay) {
      observer.observe(this.overlay, {
        attributes: true,
        attributeFilter: ['class'],
      });
    }
  }
}
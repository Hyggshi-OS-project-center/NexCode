/**
 * Tab bar — manages open file tabs, with drag-and-drop reordering (free towing).
 */
import { renderFileIconHtml } from '../../utils/fileIcons';
import { RELEASE_NOTES_TAB_PATH } from '../releaseNotes/ReleaseNotesView';
import { WELCOME_TAB_PATH } from '../welcome/WelcomeScreen';

export interface OpenTab {
  path: string;
  name: string;
  dirty: boolean;
}

type TabEvent = 'select' | 'close';

export class TabManager {
  private bar: HTMLElement;
  private scrollFrame: HTMLElement | null;
  private scrollThumb: HTMLElement | null;
  private tabs: OpenTab[] = [];
  private activePath: string | null = null;
  private listeners = new Map<TabEvent, Set<(path: string) => void>>();
  private onTabContextMenu: ((path: string, x: number, y: number) => void) | null;
  private onTabRename: ((path: string, newName: string) => void) | null;
  private onBeforeTabClose: ((path: string) => boolean | Promise<boolean>) | null;
  private scrollbarTimer: number | null = null;
  private draggingScrollbar = false;
  private scrollbarDragStartX = 0;
  private scrollbarDragStartLeft = 0;
  private resizeObserver: ResizeObserver | null = null;

  constructor(
    barId: string,
    onTabContextMenu?: (path: string, x: number, y: number) => void,
    onTabRename?: (path: string, newName: string) => void,
    onBeforeTabClose?: (path: string) => boolean | Promise<boolean>,
  ) {
    this.bar = document.getElementById(barId)!;
    this.scrollFrame = this.bar.closest('.tab-scroll-frame') as HTMLElement | null;
    this.scrollThumb = this.scrollFrame?.querySelector('.tab-scroll-thumb') as HTMLElement | null;
    this.onTabContextMenu = onTabContextMenu ?? null;
    this.onTabRename = onTabRename ?? null;
    this.onBeforeTabClose = onBeforeTabClose ?? null;
    this.initTabScrollbar();
  }

  on(event: TabEvent, handler: (path: string) => void): void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
  }

  private emit(event: TabEvent, path: string): void {
    this.listeners.get(event)?.forEach((fn) => fn(path));
  }

  openTab(path: string): void {
    const name =
      path === RELEASE_NOTES_TAB_PATH
        ? "What's New"
        : path === WELCOME_TAB_PATH
          ? 'Welcome'
          : path.split(/[/\\]/).pop() ?? path;
    const existing = this.tabs.find((t) => t.path === path);
    if (!existing) {
      this.tabs.push({ path, name, dirty: false });
    }
    this.activePath = path;
    this.render();
  }

  async closeTab(path: string): Promise<void> {
    // Consult the before-close hook — allows showing a "save changes?" dialog
    if (this.onBeforeTabClose) {
      const canClose = await this.onBeforeTabClose(path);
      if (!canClose) return;
    }
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

  renameTab(oldPath: string, newPath: string): void {
    const tab = this.tabs.find((t) => t.path === oldPath);
    if (!tab) return;
    tab.path = newPath;
    tab.name = newPath.split(/[/\\]/).pop() ?? newPath;
    if (this.activePath === oldPath) this.activePath = newPath;
    this.render();
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

  private initTabScrollbar(): void {
    this.bar.addEventListener('scroll', () => {
      this.updateTabScrollbar();
      this.showTabScrollbar();
    });

    this.bar.addEventListener(
      'wheel',
      (e) => {
        if (this.bar.scrollWidth <= this.bar.clientWidth) return;
        e.preventDefault();
        this.bar.scrollLeft += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        this.updateTabScrollbar();
        this.showTabScrollbar();
      },
      { passive: false },
    );

    this.scrollFrame?.addEventListener('mouseenter', () => {
      this.showTabScrollbar(false);
    });

    this.scrollFrame?.addEventListener('mouseleave', () => {
      if (this.draggingScrollbar) return;
      this.hideTabScrollbarSoon(600);
    });

    this.scrollThumb?.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.draggingScrollbar = true;
      this.scrollThumb?.classList.add('dragging');
      this.scrollbarDragStartX = e.clientX;
      this.scrollbarDragStartLeft = this.scrollThumb?.offsetLeft ?? 0;
      document.body.style.userSelect = 'none';
      this.showTabScrollbar(false);
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.draggingScrollbar || !this.scrollThumb) return;

      const maxMove = this.getTabScrollbarMaxMove();
      if (maxMove <= 0) return;

      const delta = e.clientX - this.scrollbarDragStartX;
      const nextLeft = Math.min(Math.max(this.scrollbarDragStartLeft + delta, 0), maxMove);
      this.scrollThumb.style.left = `${nextLeft}px`;
      this.bar.scrollLeft = (nextLeft / maxMove) * (this.bar.scrollWidth - this.bar.clientWidth);
      this.showTabScrollbar(false);
    });

    document.addEventListener('mouseup', () => {
      if (!this.draggingScrollbar) return;
      this.draggingScrollbar = false;
      this.scrollThumb?.classList.remove('dragging');
      document.body.style.userSelect = '';
      this.hideTabScrollbarSoon(700);
    });

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.updateTabScrollbar());
      this.resizeObserver.observe(this.bar);
    } else {
      window.addEventListener('resize', () => this.updateTabScrollbar());
    }
  }

  private updateTabScrollbar(): void {
    if (!this.scrollFrame || !this.scrollThumb) return;

    const hasOverflow = this.bar.scrollWidth > this.bar.clientWidth + 1;
    this.scrollFrame.classList.toggle('has-overflow', hasOverflow);
    this.scrollThumb.hidden = !hasOverflow;

    if (!hasOverflow) {
      this.scrollFrame.classList.remove('show-scrollbar');
      return;
    }

    const trackWidth = this.getTabScrollbarTrackWidth();
    const ratio = this.bar.clientWidth / this.bar.scrollWidth;
    const thumbWidth = Math.max(ratio * trackWidth, 30);
    const maxScroll = this.bar.scrollWidth - this.bar.clientWidth;
    const maxMove = Math.max(trackWidth - thumbWidth, 0);
    const position = maxScroll > 0 ? this.bar.scrollLeft / maxScroll : 0;

    this.scrollThumb.style.width = `${thumbWidth}px`;
    this.scrollThumb.style.left = `${position * maxMove}px`;
  }

  private showTabScrollbar(autoHide = true): void {
    if (!this.scrollFrame || this.bar.scrollWidth <= this.bar.clientWidth + 1) return;

    this.scrollFrame.classList.add('show-scrollbar');
    if (this.scrollbarTimer !== null) window.clearTimeout(this.scrollbarTimer);
    if (autoHide) this.hideTabScrollbarSoon(900);
  }

  private hideTabScrollbarSoon(delay: number): void {
    if (!this.scrollFrame) return;
    if (this.scrollbarTimer !== null) window.clearTimeout(this.scrollbarTimer);
    this.scrollbarTimer = window.setTimeout(() => {
      if (!this.draggingScrollbar) this.scrollFrame?.classList.remove('show-scrollbar');
    }, delay);
  }

  private getTabScrollbarTrackWidth(): number {
    const track = this.scrollFrame?.querySelector('.tab-scrollbar') as HTMLElement | null;
    return track?.clientWidth ?? this.bar.clientWidth;
  }

  private getTabScrollbarMaxMove(): number {
    if (!this.scrollThumb) return 0;
    return Math.max(this.getTabScrollbarTrackWidth() - this.scrollThumb.offsetWidth, 0);
  }

    /** Start inline rename on a specific tab by path. Replaces the name span with an input field. */
    startInlineRename(path: string): void {
      const tab = this.tabs.find((t) => t.path === path);
      if (!tab) return;

      const el = this.bar.querySelector(`.editor-tab[data-path="${CSS.escape(path)}"]`) as HTMLElement | null;
      if (!el) return;

      const nameSpan = el.querySelector('.tab-name') as HTMLElement | null;
      if (!nameSpan) return;

      const oldName = tab.name;
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'tab-rename-input';
      input.value = oldName;
      input.spellcheck = false;

      // Replace span with input
      nameSpan.replaceWith(input);
      input.focus();
      input.select();

      const finishRename = (confirmed: boolean) => {
        // Restore span
        input.replaceWith(nameSpan);

        if (!confirmed) {
          nameSpan.textContent = tab.name;
          return;
        }

        const newName = input.value.trim();
        if (!newName || newName === oldName) return;

        // Update preview with new name while waiting for async rename
        nameSpan.textContent = newName;

        // Notify the app to perform the actual rename on disk
        this.onTabRename?.(path, newName);
      };

      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          finishRename(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finishRename(false);
        }
      });

      // Prevent premature blur when the input first gains focus
      let ignoreBlur = false;
      const onBlur = () => {
        if (ignoreBlur) return;
        ignoreBlur = false;
        finishRename(true);
      };
      input.addEventListener('blur', onBlur);
      ignoreBlur = true;
      setTimeout(() => {
        ignoreBlur = false;
      }, 50);
    }

  private render(): void {
    this.bar.innerHTML = '';
    let dragSourceIdx: number | null = null;

    // Persistent drop-position indicator line
    const indicator = document.createElement('div');
    indicator.className = 'tab-drop-indicator';

    this.tabs.forEach((tab, idx) => {
      const el = document.createElement('div');
      el.className = `editor-tab${tab.path === this.activePath ? ' active' : ''}${tab.dirty ? ' dirty' : ''}`;
      el.draggable = true;
      el.dataset.tabIdx = String(idx);
      el.dataset.path = tab.path;
      el.innerHTML = `
        ${renderFileIconHtml(tab.name, false)}
        <span class="tab-name">${tab.name}</span>
        <button class="tab-close" title="Close">×</button>
      `;

       // Right-click context menu
       el.addEventListener('contextmenu', (e) => {
         e.preventDefault();
         e.stopPropagation();
         this.onTabContextMenu?.(tab.path, e.clientX, e.clientY);
       });

      // Click to select / close
      el.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).classList.contains('tab-close')) {
          e.stopPropagation();
          void this.closeTab(tab.path);
        } else {
          this.setActive(tab.path);
        }
      });

      // Middle-click to close
      el.addEventListener('auxclick', (e) => {
        if ((e as MouseEvent).button === 1) {
          e.preventDefault();
          void this.closeTab(tab.path);
        }
      });

      // ── Drag-and-drop free towing ─────────────────────────────────
      el.addEventListener('dragstart', (e) => {
        dragSourceIdx = idx;
        el.classList.add('tab-dragging');
        e.dataTransfer!.effectAllowed = 'move';
        e.dataTransfer!.setData('text/plain', String(idx));
      });

      el.addEventListener('dragend', () => {
        el.classList.remove('tab-dragging');
        dragSourceIdx = null;
        indicator.remove();
        this.bar.querySelectorAll('.editor-tab').forEach((t) => t.classList.remove('tab-drag-over'));
      });

      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer!.dropEffect = 'move';
        if (dragSourceIdx === idx) return;
        this.bar.querySelectorAll('.editor-tab').forEach((t) => t.classList.remove('tab-drag-over'));
        el.classList.add('tab-drag-over');
        const rect = el.getBoundingClientRect();
        const barRect = this.bar.getBoundingClientRect();
        const insertBefore = (e as DragEvent).clientX < rect.left + rect.width / 2;
        indicator.style.left = `${(insertBefore ? rect.left : rect.right) - barRect.left}px`;
        if (!indicator.parentElement) this.bar.appendChild(indicator);
      });

      el.addEventListener('dragleave', () => {
        el.classList.remove('tab-drag-over');
      });

      el.addEventListener('drop', (e) => {
        e.preventDefault();
        if (dragSourceIdx === null || dragSourceIdx === idx) return;
        const [moved] = this.tabs.splice(dragSourceIdx, 1);
        // Recalculate target index after splice
        const targetIdx = dragSourceIdx < idx ? idx - 1 : idx;
        this.tabs.splice(targetIdx, 0, moved);
        dragSourceIdx = null;
        this.render();
      });

      this.bar.appendChild(el);
    });

    this.keepActiveTabVisible();
    requestAnimationFrame(() => this.updateTabScrollbar());
  }

  private keepActiveTabVisible(): void {
    if (!this.activePath) return;

    const activeTab = this.bar.querySelector(`.editor-tab[data-path="${CSS.escape(this.activePath)}"]`) as HTMLElement | null;
    activeTab?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

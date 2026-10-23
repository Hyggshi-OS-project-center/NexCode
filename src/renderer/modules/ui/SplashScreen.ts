/**
 * Full-screen loading splash — PyQt-style gradient, centered logo, minimum display time.
 */
export interface SplashScreenOptions {
  /** Minimum time the splash stays visible (ms). Matches PyQt default ~1999. */
  minDisplayMs?: number;
  imageSrc?: string;
  imageWidth?: number;
  imageHeight?: number;
}

export class SplashScreen {
  private el: HTMLElement;
  private statusEl: HTMLElement;
  private imageEl: HTMLImageElement | null;
  private readonly minDisplayMs: number;
  private shownAt = Date.now();
  private ready = false;
  private hidden = false;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private maxHideTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: SplashScreenOptions = {}) {
    this.minDisplayMs = options.minDisplayMs ?? 1999;
    this.el = document.getElementById('app-splash')!;
    this.statusEl = this.el.querySelector('.app-splash-status')!;
    this.imageEl = this.el.querySelector('.app-splash-image');

    const width = options.imageWidth ?? 80;
    const height = options.imageHeight ?? 80;
    if (this.imageEl) {
      this.imageEl.width = width;
      this.imageEl.height = height;
      if (options.imageSrc) {
        this.imageEl.src = options.imageSrc;
      }
      this.imageEl.addEventListener('error', () => {
        this.imageEl!.style.display = 'none';
      });
    }

    document.body.classList.add('app-is-loading');

    // The desktop BrowserWindow is created with show:false, so this code can run well before the
    // user sees anything. Start the minimum-display clock only when the main process reports the
    // window is actually on screen (it dispatches 'nexcode:window-shown'); otherwise on slower
    // machines the splash expires before it was ever visible.
    //
    // IMPORTANT: Use the LATER of (window-shown, constructor-time) as the baseline. When the
    // internal Vite dev server takes several seconds to start, __nexcodeWindowShown is set very
    // early but the splash UI doesn't render until the JS modules load. Using the early timestamp
    // causes elapsed > minDisplayMs → splash hides instantly before the user ever sees it.
    const now = Date.now();
    const w = window as unknown as { __nexcodeWindowShown?: number; electronAPI?: { isDesktop?: boolean; isWeb?: boolean } };
    const isDesktop = Boolean(w.electronAPI?.isDesktop && !w.electronAPI?.isWeb);
    if (isDesktop && w.__nexcodeWindowShown) {
      // Window was already shown: use the later of the two timestamps so the splash
      // is guaranteed to stay visible for minDisplayMs from *this* moment.
      this.shownAt = Math.max(w.__nexcodeWindowShown, now);
    } else if (isDesktop) {
      const onShown = (): void => {
        window.removeEventListener('nexcode:window-shown', onShown);
        this.shownAt = Date.now();
        this.scheduleHide();
      };
      window.addEventListener('nexcode:window-shown', onShown);
    }

    // Safety net: never let the splash overlay block the UI forever. If hide() is never called
    // (e.g. init() hangs on an IPC call), auto-hide after 15 seconds so clicks are not blocked.
    this.maxHideTimer = window.setTimeout(() => {
      if (!this.hidden) {
        console.warn('[SplashScreen] Force-hiding splash after max timeout (15s).');
        this.doHide();
      }
    }, 15000);
  }

  setStatus(message: string): void {
    this.statusEl.textContent = message;
  }

  /** Call when the application has finished initializing (waits for minDisplayMs). */
  hide(): void {
    if (this.hidden) return;
    this.ready = true;
    this.scheduleHide();
  }

  private scheduleHide(): void {
    if (!this.ready || this.hidden) return;

    const elapsed = Date.now() - this.shownAt;
    const delay = Math.max(0, this.minDisplayMs - elapsed);

    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => this.doHide(), delay);
  }

  private doHide(): void {
    if (this.hidden) return;
    this.hidden = true;
    if (this.maxHideTimer) { clearTimeout(this.maxHideTimer); this.maxHideTimer = null; }

    this.el.classList.add('app-splash--hide');
    document.body.classList.remove('app-is-loading');

    window.setTimeout(() => {
      this.el.classList.add('hidden');
      this.el.remove();
    }, 380);
  }
}

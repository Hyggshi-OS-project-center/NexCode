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
  private readonly shownAt = Date.now();
  private ready = false;
  private hidden = false;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

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

    this.el.classList.add('app-splash--hide');
    document.body.classList.remove('app-is-loading');

    window.setTimeout(() => {
      this.el.classList.add('hidden');
      this.el.remove();
    }, 380);
  }
}

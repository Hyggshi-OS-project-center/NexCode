const IDLE_DELAY_MS = 30000;
const POINTER_MOVE_THROTTLE_MS = 1200;

export class EditorIdleEasterEgg {
  private readonly container: HTMLElement;
  private idleTimer: ReturnType<typeof window.setTimeout> | null = null;
  private lastPointerMoveAt = 0;
  private visible = false;

  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) throw new Error(`Missing idle easter egg container: ${containerId}`);

    this.container = container;
    this.bindActivity();
    this.scheduleIdle();
  }

  dispose(): void {
    const activityEvents: Array<keyof WindowEventMap> = [
      'keydown',
      'pointerdown',
      'wheel',
      'touchstart',
      'input',
      'resize',
      'focus',
    ];

    for (const eventName of activityEvents) {
      window.removeEventListener(eventName, this.handleActivity);
    }
    window.removeEventListener('pointermove', this.handlePointerMove);
    document.removeEventListener('visibilitychange', this.handleActivity);
    this.clearTimers();
    this.closeWindow();
  }

  private bindActivity(): void {
    const activityEvents: Array<keyof WindowEventMap> = [
      'keydown',
      'pointerdown',
      'wheel',
      'touchstart',
      'input',
      'resize',
      'focus',
    ];

    for (const eventName of activityEvents) {
      window.addEventListener(eventName, this.handleActivity, { passive: true });
    }

    window.addEventListener('pointermove', this.handlePointerMove, { passive: true });
    document.addEventListener('visibilitychange', this.handleActivity);
  }

  private readonly handlePointerMove = (): void => {
    const now = Date.now();
    if (now - this.lastPointerMoveAt < POINTER_MOVE_THROTTLE_MS) return;
    this.lastPointerMoveAt = now;
    this.handleActivity();
  };

  private readonly handleActivity = (): void => {
    this.hide();
    this.scheduleIdle();
  };

  private scheduleIdle(): void {
    if (this.idleTimer !== null) window.clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => this.show(), IDLE_DELAY_MS);
  }

  private show(): void {
    this.idleTimer = null;
    if (!this.canShow()) {
      this.scheduleIdle();
      return;
    }

    this.visible = true;
    window.electronAPI.showEasterEggWindow();
  }

  private hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.closeWindow();
  }

  private closeWindow(): void {
    window.electronAPI.closeEasterEggWindow();
  }

  private canShow(): boolean {
    if (document.hidden || !document.hasFocus()) return false;
    const splitRoot = document.getElementById('editor-split-root');
    if (!splitRoot || splitRoot.classList.contains('hidden')) return false;
    const bounds = this.container.getBoundingClientRect();
    return bounds.width > 360 && bounds.height > 260;
  }

  private clearTimers(): void {
    if (this.idleTimer !== null) window.clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }
}

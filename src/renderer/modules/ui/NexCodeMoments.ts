type MomentKind = 'info' | 'success' | 'warning' | 'achievement' | 'cat' | 'crash';

interface MomentOptions {
  kind?: MomentKind;
  title: string;
  body?: string;
  ttlMs?: number;
}

export class NexCodeMoments {
  private host: HTMLElement;
  private hideTimer: ReturnType<typeof window.setTimeout> | null = null;
  private lastShown = new Map<string, number>();

  constructor() {
    this.host = document.createElement('div');
    this.host.className = 'nexcode-moment-host hidden';
    this.host.setAttribute('aria-live', 'polite');
    document.body.append(this.host);
  }

  show(options: MomentOptions): void {
    const kind = options.kind ?? 'info';
    this.host.className = `nexcode-moment-host nexcode-moment-${kind}`;
    this.host.innerHTML = `
      <div class="nexcode-moment-card">
        <div class="nexcode-moment-title">${this.escape(options.title)}</div>
        ${options.body ? `<div class="nexcode-moment-body">${this.escape(options.body)}</div>` : ''}
      </div>
    `;

    if (this.hideTimer) window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => {
      this.host.classList.add('hidden');
    }, options.ttlMs ?? 4200);
  }

  showOnce(key: string, cooldownMs: number, options: MomentOptions): void {
    const now = Date.now();
    const last = this.lastShown.get(key) ?? 0;
    if (now - last < cooldownMs) return;
    this.lastShown.set(key, now);
    this.show(options);
  }

  showLegacySplashEnabled(): void {
    this.show({
      kind: 'success',
      title: 'NexCode legacy splash 2025 enabled',
      body: 'Restart NexCode to see it.',
    });
  }

  showNexCatMode(): void {
    this.show({
      kind: 'cat',
      title: 'NexCat mode',
      body: 'Meow. Ctrl+Shift+Alt+N found the secret door.',
    });
  }

  showTooManyErrors(): void {
    this.showOnce('too-many-errors', 30000, {
      kind: 'warning',
      title: '(¬_¬)',
      body: 'Are you sure this is TypeScript?',
      ttlMs: 5600,
    });
  }

  showCrash(): void {
    this.showOnce('renderer-crash', 30000, {
      kind: 'crash',
      title: '(╥﹏╥)',
      body: "I don't know what the error is either...",
      ttlMs: 7000,
    });
  }

  showBugHunter(): void {
    this.showOnce('bug-hunter', 30000, {
      kind: 'achievement',
      title: 'Achievement Unlocked:',
      body: 'Bug Hunter',
      ttlMs: 5200,
    });
  }

  showBuildSuccess(): void {
    this.showOnce('build-success', 12000, {
      kind: 'success',
      title: '( •ᴗ• )',
      body: 'Build Success',
    });
  }

  private escape(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

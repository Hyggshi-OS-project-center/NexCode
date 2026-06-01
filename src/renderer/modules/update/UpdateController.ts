import type { UpdateChannel } from '../../../shared/types';
import type { UpdateInfo, UpdateProgress } from '../../../shared/types';

const STAGES: UpdateProgress['stage'][] = [
  'checking',
  'downloading',
  'verifying',
  'preparing',
  'restarting',
  'installing',
  'completed',
];

export class UpdateController {
  private button: HTMLButtonElement | null = null;
  private popup: HTMLElement | null = null;
  private dialog: HTMLElement | null = null;
  private toast: HTMLElement | null = null;
  private info: UpdateInfo | null = null;
  private currentChannel: UpdateChannel = 'stable';
  private disposers: Array<() => void> = [];

  init(): void {
    this.button = document.getElementById('btn-update') as HTMLButtonElement | null;
    if (!this.button) return;

    this.button.addEventListener('mouseenter', () => this.showPopup());
    this.button.addEventListener('mouseleave', () => this.hidePopup());
    this.button.addEventListener('click', () => void this.startUpdate());

    this.disposers.push(
      window.electronAPI.onUpdateAvailable((info) => this.setUpdateAvailable(info)),
      window.electronAPI.onUpdateProgress((progress) => this.updateProgress(progress)),
    );

    void window.electronAPI.checkForUpdates().then((result) => {
      if (result.available && result.info) this.setUpdateAvailable(result.info);
      else if (result.error) this.showToast('Update check failed', result.error, 'error');
    });
  }

  dispose(): void {
    this.disposers.forEach((dispose) => dispose());
  }

  private setUpdateAvailable(info: UpdateInfo): void {
    this.info = info;
    this.button?.classList.remove('hidden');
    this.showToast(
      'Update Available',
      `NexCode IDE ${info.latestVersion} is ready to download.`,
      'info',
    );
  }

  private showPopup(): void {
    if (!this.info || !this.button) return;
    this.hidePopup();
    const popup = document.createElement('div');
    popup.className = 'update-popup';
    popup.innerHTML = `
      <div class="update-popup-title">Update Available</div>
      <div class="update-popup-body">
        <p>A newer version of NexCode IDE is available.</p>
        <p><span>Current Version:</span> ${escapeHtml(this.info.currentVersion)}</p>
        <p><span>Latest Version:</span> ${escapeHtml(this.info.latestVersion)}</p>
        <p>Click Update to download and install.</p>
      </div>
    `;
    document.body.appendChild(popup);

    popup.querySelectorAll<HTMLInputElement>('input[name="update-channel"]').forEach((radio) => {
      radio.addEventListener('change', (e) => {
        const channel = (e.target as HTMLInputElement).value as UpdateChannel;
        this.currentChannel = channel;
        void window.electronAPI.setUpdateChannel(channel).then(() => {
          // Re-check updates với channel mới
          void window.electronAPI.checkForUpdates().then((result) => {
            if (result.available && result.info) this.setUpdateAvailable(result.info);
          });
        });
      });
    });

    const rect = this.button.getBoundingClientRect();
    popup.style.top = `${rect.bottom + 8}px`;
    popup.style.right = `${Math.max(12, window.innerWidth - rect.right)}px`;
    this.popup = popup;
  }

  private hidePopup(): void {
    this.popup?.remove();
    this.popup = null;
  }

  private async startUpdate(): Promise<void> {
    if (!this.info) return;
    this.hidePopup();
    this.openDialog();
    this.updateProgress({ stage: 'checking', message: 'Checking release...', percent: 0 });
    try {
      await window.electronAPI.startUpdate();
    } catch (error) {
      this.updateProgress({
        stage: 'error',
        message: friendlyRendererError(error),
        percent: 100,
      });
    }
  }

  private openDialog(): void {
    this.dialog?.remove();
    const channelBadge = this.currentChannel === 'insider'
      ? '<span class="update-channel-badge insider">Insider</span>'
      : '<span class="update-channel-badge stable">Stable</span>';
    const dialog = document.createElement('div');
    dialog.className = 'update-dialog-backdrop';
    dialog.innerHTML = `
      <section class="update-dialog" role="dialog" aria-modal="true" aria-labelledby="update-dialog-title">
        <header class="update-dialog-header">
          <div>
            <h2 id="update-dialog-title">Updating NexCode IDE ${channelBadge}</h2>
            <p id="update-dialog-subtitle">Preparing update...</p>
          </div>
          <button type="button" class="update-dialog-close" aria-label="Close update dialog">×</button>
        </header>
        <div class="update-progress-track"><div id="update-progress-bar" class="update-progress-bar"></div></div>
        <ol class="update-stage-list">
          ${STAGES.map((stage) => `<li id="update-stage-${stage}" data-stage="${stage}">${stageLabel(stage)}</li>`).join('')}
        </ol>
      </section>
    `;
    document.body.appendChild(dialog);
    dialog.querySelector('.update-dialog-close')?.addEventListener('click', () => dialog.remove());
    this.dialog = dialog;
  }

  private updateProgress(progress: UpdateProgress): void {
    if (!this.dialog && progress.stage !== 'error') return;
    const subtitle = document.getElementById('update-dialog-subtitle');
    if (subtitle) subtitle.textContent = progress.message;
    const bar = document.getElementById('update-progress-bar') as HTMLElement | null;
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, progress.percent ?? 8))}%`;

    STAGES.forEach((stage) => {
      const item = document.getElementById(`update-stage-${stage}`);
      if (!item) return;
      const currentIndex = STAGES.indexOf(progress.stage);
      const itemIndex = STAGES.indexOf(stage);
      item.classList.toggle('active', itemIndex === currentIndex);
      item.classList.toggle('done', itemIndex < currentIndex);
    });

    if (progress.stage === 'error') {
      this.showToast('Update failed', progress.message, 'error');
      this.dialog?.classList.add('update-dialog-error');
    }
  }

  private showToast(title: string, body: string, kind: 'info' | 'error'): void {
    this.toast?.remove();
    const toast = document.createElement('div');
    toast.className = `update-toast update-toast-${kind}`;
    toast.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(body)}</span>`;
    document.body.appendChild(toast);
    this.toast = toast;
    window.setTimeout(() => {
      if (this.toast === toast) {
        toast.remove();
        this.toast = null;
      }
    }, 6000);
  }
}

function stageLabel(stage: UpdateProgress['stage']): string {
  switch (stage) {
    case 'checking': return 'Checking release...';
    case 'downloading': return 'Downloading update...';
    case 'verifying': return 'Verifying package...';
    case 'preparing': return 'Preparing installation...';
    case 'restarting': return 'Restarting NexCode...';
    case 'installing': return 'Installing update...';
    case 'completed': return 'Launch completed.';
    case 'error': return 'Update failed.';
  }
}

function friendlyRendererError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/internet|network|ENOTFOUND|ETIMEDOUT/i.test(message))
    return 'No internet connection. Check your network and try again.';
  if (/rate limit|403|429/i.test(message))
    return 'GitHub API rate limit reached. Please try again later.';
  if (/corrupt|empty/i.test(message))
    return 'The downloaded update package appears to be corrupted.';
  if (/asset|installer/i.test(message))
    return 'No compatible update package was found in the release.';
  if (/permission|EACCES|EPERM/i.test(message))
    return 'Permission denied while installing the update.';
  return message || 'Installation failed. Please try again.';
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}
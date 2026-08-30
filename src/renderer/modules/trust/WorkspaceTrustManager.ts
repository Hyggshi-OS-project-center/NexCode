/**
 * Workspace Trust Manager — VS Code Standard Security Feature
 * Displays a security warning when opening untrusted folders and manages
 * trusted vs restricted workspace state.
 */
import { escapeHtml } from '../../utils/textAnalysis';

export class WorkspaceTrustManager {
  private static readonly STORAGE_KEY = 'nexcode:trusted_workspaces';
  private static readonly TRUSTED_SVG = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" style="vertical-align:text-bottom;margin-right:4px;"><path d="M13.4 3C11.563 3 9.91401 2.667 8.42601 1.176C8.30901 1.059 8.15501 1 8.00101 1C7.84801 1 7.69501 1.059 7.57801 1.176C6.08601 2.667 4.43601 3 2.60101 3C2.27001 3 2.00101 3.269 2.00101 3.6V7.202C2.00101 11.064 3.97101 13.689 7.81101 14.97C7.87301 14.991 7.93701 15.001 8.00101 15.001C8.06501 15.001 8.12901 14.991 8.19101 14.97C12.032 13.69 14.001 11.064 14.001 7.202V3.6C14.001 3.269 13.731 3 13.4 3ZM13 7.201C13 10.597 11.364 12.815 8.00001 13.977C4.63601 12.815 3.00001 10.597 3.00001 7.201V3.995C4.57901 3.956 6.35201 3.646 8.00101 2.152C9.64701 3.645 11.421 3.955 13 3.995V7.201ZM7.49901 8.793L10.145 6.147C10.243 6.049 10.371 6.001 10.499 6.001C10.775 6.001 10.999 6.225 10.999 6.501C10.999 6.629 10.95 6.757 10.853 6.855L7.85301 9.855C7.75501 9.953 7.62701 10.001 7.49901 10.001C7.37101 10.001 7.24301 9.952 7.14501 9.855L5.64501 8.355C5.54701 8.257 5.49901 8.129 5.49901 8.001C5.49901 7.725 5.72301 7.501 5.99901 7.501C6.12701 7.501 6.25501 7.55 6.35301 7.647L7.49901 8.793Z" fill="currentColor"/></svg>`;
  private static readonly UNTRUSTED_SVG = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" style="vertical-align:text-bottom;margin-right:4px;"><path d="M6.855 6.146L8.001 7.292L9.148 6.145C9.322 5.971 9.591 5.952 9.786 6.087L9.855 6.145C10.029 6.319 10.048 6.588 9.913 6.783L9.855 6.852L8.707 7.997L9.854 9.145C10.028 9.319 10.047 9.588 9.912 9.783L9.854 9.852C9.68 10.026 9.411 10.045 9.216 9.91L9.147 9.852L8.001 8.706L6.854 9.853C6.68 10.027 6.411 10.046 6.216 9.911L6.147 9.853C5.973 9.679 5.954 9.41 6.089 9.215L6.147 9.146L7.293 8L6.148 6.853C5.974 6.679 5.955 6.41 6.09 6.215L6.148 6.146C6.322 5.972 6.591 5.953 6.786 6.088L6.855 6.146ZM14 3.6V7.202C14 11.064 12.03 13.689 8.19 14.97C8.128 14.991 8.064 15.001 8 15.001C7.936 15.001 7.872 14.991 7.81 14.97C3.969 13.69 2 11.064 2 7.202V3.6C2 3.269 2.269 3 2.6 3C4.435 3 6.085 2.667 7.577 1.176C7.694 1.059 7.847 1.001 8 1C8.154 1 8.307 1.059 8.425 1.176C9.913 2.667 11.562 3 13.399 3C13.73 3 14 3.269 14 3.6ZM13 3.995C11.42 3.955 9.646 3.646 8.001 2.152C6.353 3.645 4.579 3.955 3 3.995V7.201C3 10.597 4.636 12.815 8 13.977C11.364 12.815 13 10.597 13 7.201V3.995Z" fill="currentColor"/></svg>`;

  private currentWorkspace: string | null = null;
  private isCurrentTrusted = false;
  private modalEl: HTMLElement | null = null;
  private statusBtn: HTMLElement | null = null;
  private onTrustChange?: (trusted: boolean) => void;

  constructor(statusBtnId = 'status-trust', onTrustChange?: (trusted: boolean) => void) {
    this.statusBtn = document.getElementById(statusBtnId);
    this.onTrustChange = onTrustChange;
    this.initStatusBtn();
  }

  private initStatusBtn(): void {
    if (!this.statusBtn) return;
    this.statusBtn.addEventListener('click', () => {
      if (this.currentWorkspace) {
        void this.promptTrust(this.currentWorkspace, true);
      }
    });
  }

  isTrusted(folderPath: string): boolean {
    const list = this.getTrustedList();
    const normalized = folderPath.replace(/\\/g, '/').toLowerCase();
    return list.some((item) => {
      const itemNorm = item.replace(/\\/g, '/').toLowerCase();
      return normalized === itemNorm || normalized.startsWith(`${itemNorm}/`);
    });
  }

  getTrustedList(): string[] {
    try {
      const raw = localStorage.getItem(WorkspaceTrustManager.STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  setTrusted(folderPath: string, trusted: boolean): void {
    const list = this.getTrustedList().filter((p) => p.replace(/\\/g, '/').toLowerCase() !== folderPath.replace(/\\/g, '/').toLowerCase());
    if (trusted) {
      list.push(folderPath);
    }
    localStorage.setItem(WorkspaceTrustManager.STORAGE_KEY, JSON.stringify(list));
  }

  async checkTrustOnOpen(folderPath: string): Promise<boolean> {
    this.currentWorkspace = folderPath;
    if (this.isTrusted(folderPath)) {
      this.isCurrentTrusted = true;
      this.updateStatus();
      return true;
    }

    // Prompt user with VS Code-style modal
    const trusted = await this.promptTrust(folderPath, false);
    this.isCurrentTrusted = trusted;
    this.updateStatus();
    return trusted;
  }

  updateWorkspace(folderPath: string | null): void {
    this.currentWorkspace = folderPath;
    if (!folderPath) {
      this.isCurrentTrusted = false;
      if (this.statusBtn) {
        this.statusBtn.style.display = 'none';
      }
      return;
    }
    this.isCurrentTrusted = this.isTrusted(folderPath);
    this.updateStatus();
  }

  private updateStatus(): void {
    if (!this.statusBtn) return;
    this.statusBtn.style.display = 'inline-flex';
    if (this.isCurrentTrusted) {
      this.statusBtn.innerHTML = `${WorkspaceTrustManager.TRUSTED_SVG}<span>Trusted</span>`;
      this.statusBtn.className = 'statusbar-btn statusbar-trust-trusted';
      this.statusBtn.title = 'Workspace is trusted. All features are enabled (Click to manage).';
    } else {
      this.statusBtn.innerHTML = `${WorkspaceTrustManager.UNTRUSTED_SVG}<span>Restricted Mode</span>`;
      this.statusBtn.className = 'statusbar-btn statusbar-trust-untrusted';
      this.statusBtn.title = 'Workspace is in Restricted Mode. Automated code execution is disabled (Click to trust).';
    }
  }

  promptTrust(folderPath: string, isReopen = false): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.closeModal();

      const split = folderPath.replace(/\\/g, '/').split('/');
      const folderName = split[split.length - 1] || folderPath;
      const parentDir = split.slice(0, -1).join('/') || '/';

      const overlay = document.createElement('div');
      overlay.className = 'workspace-trust-overlay';
      overlay.id = 'workspace-trust-modal';

      overlay.innerHTML = `
        <div class="workspace-trust-dialog" role="dialog" aria-modal="true" aria-labelledby="trust-title">
          <div class="workspace-trust-header">
            <div class="workspace-trust-shield-icon">
              <svg width="36" height="36" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8.75 10.75C8.75 11.164 8.414 11.5 8 11.5C7.586 11.5 7.25 11.164 7.25 10.75C7.25 10.336 7.586 10 8 10C8.414 10 8.75 10.336 8.75 10.75ZM6.25 6.75C6.25 7.026 6.474 7.25 6.75 7.25C7.026 7.25 7.25 7.026 7.25 6.75C7.25 6.336 7.586 6 8 6C8.414 6 8.75 6.336 8.75 6.75C8.75 7.015 8.606 7.187 8.272 7.52L8.241 7.551C7.947 7.843 7.5 8.288 7.5 9C7.5 9.276 7.724 9.5 8 9.5C8.276 9.5 8.5 9.276 8.5 9C8.5 8.734 8.645 8.56 8.978 8.228L9.01 8.196C9.303 7.904 9.75 7.46 9.75 6.75C9.75 5.783 8.966 5 8 5C7.034 5 6.25 5.783 6.25 6.75ZM14 3.6V7.202C14 11.064 12.03 13.689 8.19 14.97C8.128 14.991 8.064 15.001 8 15.001C7.936 15.001 7.872 14.991 7.81 14.97C3.969 13.69 2 11.064 2 7.202V3.6C2 3.269 2.269 3 2.6 3C4.435 3 6.085 2.667 7.577 1.176C7.694 1.059 7.847 1.001 8 1C8.154 1 8.307 1.059 8.425 1.176C9.913 2.667 11.562 3 13.399 3C13.73 3 14 3.269 14 3.6ZM13 3.995C11.42 3.955 9.646 3.646 8.001 2.152C6.353 3.645 4.579 3.955 3 3.995V7.201C3 10.597 4.636 12.815 8 13.977C11.364 12.815 13 10.597 13 7.201V3.995Z" fill="#e2c08d"/>
              </svg>
            </div>
            <h2 id="trust-title" class="workspace-trust-title">Do you trust the authors of the files in this folder?</h2>
          </div>

          <div class="workspace-trust-body">
            <div class="workspace-trust-folder-pill" title="${escapeHtml(folderPath)}">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M14.5 3H7.71l-.85-.85L6.51 2h-5a.5.5 0 0 0-.5.5v11a.5.5 0 0 0 .5.5h13a.5.5 0 0 0 .5-.5v-9a.5.5 0 0 0-.5-.5z"/></svg>
              <span>${escapeHtml(folderName)}</span>
              <span class="workspace-trust-folder-path">${escapeHtml(folderPath)}</span>
            </div>

            <p class="workspace-trust-text">
              NexCode gives you powerful developer tools. Workspace features such as <strong>Tasks</strong>, <strong>Debugging</strong>, <strong>Extensions</strong>, and <strong>Terminal scripts</strong> can execute code from this workspace.
            </p>

            <p class="workspace-trust-subtext">
              If you do not trust the authors, you should browse in <strong>Restricted Mode</strong> to inspect the code safely without automatic script execution.
            </p>

            <label class="workspace-trust-checkbox-row">
              <input type="checkbox" id="trust-parent-checkbox" />
              <span>Trust the authors of all files in parent folder <code>${escapeHtml(parentDir)}</code></span>
            </label>
          </div>

          <div class="workspace-trust-actions">
            <button type="button" class="welcome-btn" id="btn-trust-no">
              No, I do not trust the authors
            </button>
            <button type="button" class="welcome-btn primary" id="btn-trust-yes">
              Yes, I trust the authors
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);
      this.modalEl = overlay;

      const trustYesBtn = overlay.querySelector<HTMLButtonElement>('#btn-trust-yes');
      const trustNoBtn = overlay.querySelector<HTMLButtonElement>('#btn-trust-no');
      const parentCheckbox = overlay.querySelector<HTMLInputElement>('#trust-parent-checkbox');

      trustYesBtn?.addEventListener('click', () => {
        const trustTarget = (parentCheckbox?.checked && parentDir) ? parentDir : folderPath;
        this.setTrusted(trustTarget, true);
        this.isCurrentTrusted = true;
        this.updateStatus();
        this.closeModal();
        this.onTrustChange?.(true);
        resolve(true);
      });

      trustNoBtn?.addEventListener('click', () => {
        this.setTrusted(folderPath, false);
        this.isCurrentTrusted = false;
        this.updateStatus();
        this.closeModal();
        this.onTrustChange?.(false);
        resolve(false);
      });

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay && isReopen) {
          this.closeModal();
          resolve(this.isCurrentTrusted);
        }
      });
    });
  }

  private closeModal(): void {
    if (this.modalEl && this.modalEl.parentNode) {
      this.modalEl.parentNode.removeChild(this.modalEl);
      this.modalEl = null;
    }
  }
}

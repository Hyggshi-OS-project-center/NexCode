import { app, BrowserWindow, shell } from 'electron';
import fs from 'fs';
import fsp from 'fs/promises';
import https from 'https';
import os from 'os';
import path from 'path';
import type {
  GitHubRelease,
  GitHubReleaseAsset,
  UpdateCheckResult,
  UpdateInfo,
  UpdateInstallMode,
  UpdateProgress,
} from '../../shared/types';

const RELEASE_URL =
  'https://api.github.com/repos/Hyggshi-OS-project-center/NexCode/releases/latest';
const USER_AGENT = 'NexCode-IDE-Updater';

export class UpdateService {
  private latestInfo: UpdateInfo | null = null;
  private checking: Promise<UpdateCheckResult> | null = null;

  constructor(private readonly getWindow: () => BrowserWindow | null) {}

  async checkForUpdates(notify = false): Promise<UpdateCheckResult> {
    // Portable builds do not support automatic updates
    if (process.env.PORTABLE_EXECUTABLE_DIR !== undefined) {
      return { available: false };
    }

    if (this.checking) return this.checking;
    this.checking = this.doCheckForUpdates(notify).finally(() => {
      this.checking = null;
    });
    return this.checking;
  }

  async downloadAndInstall(): Promise<void> {
    if (process.env.PORTABLE_EXECUTABLE_DIR !== undefined) {
      throw new Error('Automatic updates are not supported for portable installations.');
    }

    const info = this.latestInfo ?? (await this.checkForUpdates(false)).info;
    if (!info) throw new Error('No newer NexCode IDE version is available.');

    const updateDir = this.getUpdateDirectory();
    await fsp.mkdir(updateDir, { recursive: true });
    const downloadPath = path.join(updateDir, info.assetName);

    this.emitProgress('checking', 'Checking release...');
    this.emitProgress('downloading', 'Downloading update...', 0);
    await this.downloadFile(info.assetUrl, downloadPath);

    this.emitProgress('verifying', 'Verifying package...', 100);
    await this.verifyPackage(downloadPath);

    this.emitProgress('preparing', 'Preparing installation...', 100);
    await this.launchUpdater(downloadPath, info.installMode);

    this.emitProgress('restarting', 'Restarting NexCode...', 100);
    app.quit();
  }

  private async doCheckForUpdates(notify: boolean): Promise<UpdateCheckResult> {
    this.emitProgress('checking', 'Checking release...');
    try {
      const release = await this.fetchJson<GitHubRelease>(RELEASE_URL);
      const currentVersion = app.getVersion();
      const latestVersion = normalizeVersion(release.tag_name);
      if (!latestVersion || !isVersionGreater(latestVersion, currentVersion)) {
        return { available: false };
      }

      const currentArch = detectCurrentArch();
      const asset = selectUpdateAsset(release.assets, detectInstallMode(), currentArch);
      if (!asset) {
        return {
          available: false,
          error: 'A newer version is available, but no compatible installer asset was found.',
        };
      }

      const info: UpdateInfo = {
        currentVersion,
        latestVersion,
        releaseName: release.name ?? release.tag_name,
        releaseUrl: release.html_url ?? null,
        assetName: asset.name,
        assetUrl: asset.browser_download_url,
        installMode: getAssetInstallMode(asset),
        arch: currentArch,
      };
      this.latestInfo = info;
      if (notify) this.getWindow()?.webContents.send('update:available', info);
      return { available: true, info };
    } catch (error) {
      return { available: false, error: friendlyUpdateError(error) };
    }
  }

  private getUpdateDirectory(): string {
    if (process.platform === 'win32') return path.join(os.tmpdir(), 'NexCodeUpdater');
    return path.join(os.homedir(), '.cache', 'NexCodeUpdater');
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const body = await requestText(url);
    return JSON.parse(body) as T;
  }

  private async downloadFile(url: string, targetPath: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const file = fs.createWriteStream(targetPath);
      const request = https.get(
        url,
        { headers: { 'User-Agent': USER_AGENT, Accept: 'application/octet-stream' } },
        (response) => {
          if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            file.close();
            void this.downloadFile(response.headers.location, targetPath).then(resolve, reject);
            return;
          }
          if (response.statusCode !== 200) {
            file.close();
            reject(new Error(`Download failed with HTTP ${response.statusCode ?? 'unknown'}.`));
            return;
          }

          const total = Number(response.headers['content-length'] ?? 0);
          let received = 0;
          response.on('data', (chunk: Buffer) => {
            received += chunk.length;
            if (total > 0) {
              this.emitProgress('downloading', 'Downloading update...', Math.round((received / total) * 100));
            }
          });
          response.pipe(file);
          file.on('finish', () => file.close(() => resolve()));
        },
      );
      request.on('error', (error) => {
        file.close();
        reject(error);
      });
      file.on('error', reject);
    });
  }

  private async verifyPackage(downloadPath: string): Promise<void> {
    const stat = await fsp.stat(downloadPath);
    if (stat.size <= 0) throw new Error('The downloaded update package is empty or corrupted.');
  }

  private async launchUpdater(downloadPath: string, mode: UpdateInstallMode): Promise<void> {
    if (mode === 'zip') {
      await shell.openPath(path.dirname(downloadPath));
      throw new Error('Downloaded update.zip. Please extract it and replace the current NexCode IDE files.');
    }

    if (process.platform === 'win32') {
      const error = await shell.openPath(downloadPath);
      if (error) throw new Error(`Installation failed: ${error}`);
      this.emitProgress('installing', 'Installing update...', 100);
      return;
    }

    await fsp.chmod(downloadPath, 0o755);
    const { spawn } = await import('child_process');
    const child = spawn(downloadPath, [], { detached: true, stdio: 'ignore' });
    child.unref();
    this.emitProgress('installing', 'Installing update...', 100);
  }

  private emitProgress(stage: UpdateProgress['stage'], message: string, percent?: number): void {
    this.getWindow()?.webContents.send('update:progress', { stage, message, percent } satisfies UpdateProgress);
  }
}

function requestText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/vnd.github+json' } }, (response) => {
        if (response.statusCode === 403 || response.statusCode === 429) {
          reject(new Error('GitHub API rate limit reached. Please try again later.'));
          response.resume();
          return;
        }
        if (response.statusCode !== 200) {
          reject(new Error(`GitHub update check failed with HTTP ${response.statusCode ?? 'unknown'}.`));
          response.resume();
          return;
        }
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => resolve(body));
      })
      .on('error', reject);
  });
}

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, '');
}

function isVersionGreater(latest: string, current: string): boolean {
  const latestParts = normalizeVersion(latest).split('.').map((part) => Number.parseInt(part, 10) || 0);
  const currentParts = normalizeVersion(current).split('.').map((part) => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
    const a = latestParts[i] ?? 0;
    const b = currentParts[i] ?? 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return false;
}

function detectInstallMode(): UpdateInstallMode {
  const exe = path.basename(process.execPath).toLowerCase();
  if (exe.includes('portable') || process.env.PORTABLE_EXECUTABLE_DIR) return 'portable';
  return 'installed';
}

function detectCurrentArch(): string {
  const arch = process.arch;
  if (arch === 'x64') return 'x64';
  if (arch === 'arm64') return 'arm64';
  if (arch === 'ia32') return 'ia32';
  return arch;
}

function selectUpdateAsset(
  assets: GitHubReleaseAsset[],
  preferred: UpdateInstallMode,
  currentArch: string,
): GitHubReleaseAsset | null {
  const lower = (asset: GitHubReleaseAsset) => asset.name.toLowerCase();

  if (preferred === 'portable') {
    // Try arch-specific portable first, then any portable, then setup, then zip
    const archPortable = assets.find(
      (a) => lower(a).endsWith('.exe') && lower(a).includes('portable') && lower(a).includes(currentArch),
    );
    const portable = assets.find((a) => lower(a).endsWith('.exe') && lower(a).includes('portable'));
    const archSetup = assets.find(
      (a) => lower(a).endsWith('.exe') && lower(a).includes('setup') && lower(a).includes(currentArch),
    );
    const setup = assets.find((a) => lower(a).endsWith('.exe') && lower(a).includes('setup'));
    const zip = assets.find((a) => lower(a) === 'update.zip' || lower(a).endsWith('update.zip'));
    return archPortable ?? portable ?? archSetup ?? setup ?? zip ?? null;
  }

  // Installed mode: prefer arch-specific setup, then any setup, then arch portable, then any portable, then zip
  const archSetup = assets.find(
    (a) => lower(a).endsWith('.exe') && lower(a).includes('setup') && lower(a).includes(currentArch),
  );
  const setup = assets.find((a) => lower(a).endsWith('.exe') && lower(a).includes('setup'));
  const archPortable = assets.find(
    (a) => lower(a).endsWith('.exe') && lower(a).includes('portable') && lower(a).includes(currentArch),
  );
  const portable = assets.find((a) => lower(a).endsWith('.exe') && lower(a).includes('portable'));
  const zip = assets.find((a) => lower(a) === 'update.zip' || lower(a).endsWith('update.zip'));
  return archSetup ?? setup ?? archPortable ?? portable ?? zip ?? null;
}

function getAssetInstallMode(asset: GitHubReleaseAsset): UpdateInstallMode {
  const name = asset.name.toLowerCase();
  if (name.endsWith('.zip')) return 'zip';
  if (name.includes('portable')) return 'portable';
  return 'installed';
}

function friendlyUpdateError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/rate limit|403|429/i.test(message)) return 'GitHub API rate limit reached. Please try again later.';
  if (/ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN|network/i.test(message)) {
    return 'No internet connection. Check your network and try again.';
  }
  if (/EACCES|EPERM|permission/i.test(message)) return 'Permission denied while preparing the update.';
  if (/empty|corrupt/i.test(message)) return 'The downloaded update package appears to be corrupted.';
  if (/compatible installer asset/i.test(message)) return 'No compatible update package was found in the release.';
  return message || 'NexCode could not check for updates.';
}

import { renderMarkdown } from '../editor/MarkdownPreview';

export const RELEASE_NOTES_TAB_PATH = 'nexcode://release-notes';
export const RELEASE_NOTES_STORAGE_KEY = 'nexcode.releaseNotes.lastShownVersion';

interface ReleaseNotesData {
  version: string;
  title: string;
  body: string;
  changelogUrl: string;
}

export class ReleaseNotesView {
  private container: HTMLElement;
  private panel: HTMLElement;
  private titleEl: HTMLElement;
  private bodyEl: HTMLElement;
  private currentVersion = '';
  private currentChangelogUrl = '';

  constructor(containerId: string) {
    this.container = document.getElementById(containerId)!;
    const panel = document.createElement('section');
    panel.id = 'release-notes-panel';
    panel.className = 'release-notes-panel hidden';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', "What's New");
    panel.innerHTML = `
      <header class="release-notes-header">
        <div>
          <p class="release-notes-kicker">Release Notes</p>
          <h1 id="release-notes-title">What's New</h1>
        </div>
        <button type="button" class="release-notes-changelog-btn" id="btn-release-notes-changelog">
          Full Changelog
        </button>
      </header>
      <div class="release-notes-body" id="release-notes-body"></div>
    `;
    this.container.appendChild(panel);
    this.panel = panel;
    this.titleEl = panel.querySelector('#release-notes-title') as HTMLElement;
    this.bodyEl = panel.querySelector('#release-notes-body') as HTMLElement;
    panel.querySelector('#btn-release-notes-changelog')?.addEventListener('click', () => {
      void window.electronAPI.openExternal(this.currentChangelogUrl || this.getChangelogUrl());
    });
  }

  async show(version?: string): Promise<void> {
    this.panel.classList.remove('hidden');
    this.bodyEl.innerHTML = '<p class="release-notes-loading">Loading release notes...</p>';
    const data = await this.buildData(version);
    this.currentVersion = data.version;
    this.currentChangelogUrl = data.changelogUrl;
    this.titleEl.textContent = data.title || `What's New in version ${data.version}`;
    this.bodyEl.innerHTML = renderMarkdown(data.body);
  }

  hide(): void {
    this.panel.classList.add('hidden');
  }

  isReleaseNotesPath(path: string | null): boolean {
    return path === RELEASE_NOTES_TAB_PATH;
  }

  async getCurrentVersion(): Promise<string> {
    if (this.currentVersion) return this.currentVersion;
    const info = await window.electronAPI.getAboutInfo();
    this.currentVersion = info.version;
    return info.version;
  }

  private async buildData(version?: string): Promise<ReleaseNotesData> {
    const resolvedVersion = version ?? (await this.getCurrentVersion());
    try {
      const latest = await window.electronAPI.getLatestReleaseNotes();
      return {
        version: latest.version || resolvedVersion,
        title: latest.title || `What's New in version ${latest.version || resolvedVersion}`,
        body: latest.body || fallbackReleaseMarkdown(resolvedVersion, this.getChangelogUrl(resolvedVersion)),
        changelogUrl: latest.url ?? this.getChangelogUrl(latest.version || resolvedVersion),
      };
    } catch {
      return {
        version: resolvedVersion,
        title: `What's New in version ${resolvedVersion}`,
        body: fallbackReleaseMarkdown(resolvedVersion, this.getChangelogUrl(resolvedVersion)),
        changelogUrl: this.getChangelogUrl(resolvedVersion),
      };
    }
  }

  private getChangelogUrl(version = this.currentVersion): string {
    const tag = version ? `v${version}` : '';
    return tag
      ? `https://github.com/Hyggshi-OS-project-center/NexCode/releases/tag/${encodeURIComponent(tag)}`
      : 'https://github.com/Hyggshi-OS-project-center/NexCode/releases';
  }
}

function fallbackReleaseMarkdown(version: string, changelogUrl: string): string {
  return [
    `# NexCode IDE v${version}`,
    '',
    '> Could not load release notes from GitHub. Check your connection and open the full changelog for the latest notes.',
    '',
    '## Highlights',
    '',
    '![Release notes preview](data:image/svg+xml;utf8,' + encodeURIComponent(buildReleaseHeroSvg(version)) + ')',
    '',
    '- Automatic What\'s New tab after updating NexCode IDE.',
    '- Version-specific release notes with screenshots or GIF-ready image sections.',
    '- Direct access to the full GitHub changelog from the editor toolbar.',
    '',
    '## New Features',
    '',
    '- Update flow now surfaces a VS Code-style Release Notes tab on first launch for each installed version.',
    '- Help menu includes a permanent What\'s New entry so the notes are always reachable.',
    '- External changelog links open securely in the system browser.',
    '',
    '## Bug Fixes',
    '',
    '- Release-note tabs are treated as read-only internal pages, so they do not trigger file watching or autosave.',
    '- Closing the final What\'s New tab returns to the welcome screen like other editor tabs.',
    '- Markdown preview controls stay hidden while viewing release notes.',
    '',
    `## Full Changelog`,
    '',
    `[View the full changelog on GitHub](${changelogUrl})`,
  ].join('\n');
}

function buildReleaseHeroSvg(version: string): string {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="960" height="360" viewBox="0 0 960 360">
  <rect width="960" height="360" rx="12" fill="#1e1e1e"/>
  <rect x="44" y="44" width="872" height="272" rx="8" fill="#252526" stroke="#3c3c3c"/>
  <rect x="44" y="44" width="872" height="42" rx="8" fill="#2d2d2d"/>
  <circle cx="70" cy="65" r="6" fill="#f05d5d"/>
  <circle cx="92" cy="65" r="6" fill="#d6a85f"/>
  <circle cx="114" cy="65" r="6" fill="#57c878"/>
  <text x="72" y="145" fill="#d4d4d4" font-family="Segoe UI, Arial, sans-serif" font-size="34" font-weight="600">What's New in NexCode ${escapeXml(version)}</text>
  <text x="72" y="190" fill="#9cdcfe" font-family="Consolas, monospace" font-size="20">releaseNotes.openOnUpdate = true</text>
  <rect x="72" y="226" width="250" height="16" rx="8" fill="#4ec9b0"/>
  <rect x="72" y="256" width="390" height="16" rx="8" fill="#3794ff"/>
  <rect x="72" y="286" width="310" height="16" rx="8" fill="#ffc457"/>
  <path d="M680 132h112l-56 96z" fill="#3794ff" opacity=".9"/>
  <path d="M760 170h96l-48 82z" fill="#4ec9b0" opacity=".82"/>
  <path d="M636 206h88l-44 76z" fill="#ffc457" opacity=".9"/>
</svg>`.trim();
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&apos;';
    }
  });
}

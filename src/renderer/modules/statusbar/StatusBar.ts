/**
 * Bottom status bar — cursor position, language, theme, and active file info.
 */
import type { AppSettings } from '../../../shared/types';
import { getDisplayLanguage } from '../../utils/language';

export class StatusBar {
  private elFile = document.getElementById('status-file')!;
  private elCwd = document.getElementById('status-cwd')!;
  private elBranch = document.getElementById('status-branch')!;
  private elPosition = document.getElementById('status-position')!;
  private elLanguage = document.getElementById('status-language')!;
  private elIndent = document.getElementById('status-indent')!;
  private elTheme = document.getElementById('status-theme')!;

  setBranch(branch: string | null, isRepo = false): void {
    if (!isRepo || !branch) {
      this.elBranch.textContent = '—';
      this.elBranch.title = 'Open Source Control';
      return;
    }
    this.elBranch.textContent = `⎇ ${branch}`;
    this.elBranch.title = `Git branch: ${branch}`;
  }

  setTerminalCwd(cwd: string | null): void {
    if (!cwd) {
      this.elCwd.textContent = '';
      this.elCwd.title = '';
      return;
    }
    this.elCwd.textContent = cwd;
    this.elCwd.title = `Terminal: ${cwd}`;
  }

  setFile(filePath: string | null): void {
    if (!filePath) {
      this.elFile.textContent = '';
      return;
    }
    const name = filePath.split(/[/\\]/).pop() ?? filePath;
    this.elFile.textContent = name;
  }

  setPosition(line: number, column: number): void {
    this.elPosition.textContent = `Ln ${line}, Col ${column}`;
  }

  setLanguage(langId: string): void {
    this.elLanguage.textContent = getDisplayLanguage(langId);
    this.elLanguage.title = '';
  }

  /** Status bar when a non-text (binary / media) file is active. */
  setBinaryPreview(kindLabel: string): void {
    this.elPosition.textContent = '—';
    this.elIndent.textContent = '—';
    this.elPosition.title = 'Not available for binary files';
    this.elIndent.title = 'Not available for binary files';
    this.elLanguage.textContent = kindLabel;
    this.elLanguage.title = kindLabel;
  }

  setInternalPage(label: string): void {
    this.elPosition.textContent = 'â€”';
    this.elIndent.textContent = 'â€”';
    this.elPosition.title = 'Not available for internal pages';
    this.elIndent.title = 'Not available for internal pages';
    this.elLanguage.textContent = label;
    this.elLanguage.title = label;
  }

  restoreTextEditor(settings: AppSettings): void {
    this.elPosition.title = '';
    this.elIndent.title = '';
    this.applySettings(settings);
  }

  applySettings(settings: AppSettings): void {
    this.elIndent.textContent = `Spaces: ${settings.tabSize}`;
    this.elTheme.textContent = settings.theme === 'dark' ? 'Dark' : 'Light';
  }
}

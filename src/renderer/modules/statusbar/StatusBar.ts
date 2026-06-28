/**
 * Bottom status bar - cursor position, language, theme, and active file info.
 */
import type { AppSettings, AppTheme } from '../../../shared/types';
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
      this.elBranch.textContent = '-';
      this.elBranch.title = 'Open Source Control';
      return;
    }
    this.elBranch.textContent = `Git: ${branch}`;
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
    this.elPosition.textContent = '-';
    this.elIndent.textContent = '-';
    this.elPosition.title = 'Not available for binary files';
    this.elIndent.title = 'Not available for binary files';
    this.elLanguage.textContent = kindLabel;
    this.elLanguage.title = kindLabel;
  }

  setInternalPage(label: string): void {
    this.elPosition.textContent = '-';
    this.elIndent.textContent = '-';
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
    this.elTheme.textContent = this.themeLabel(settings.theme);
  }

  private themeLabel(theme: AppTheme): string {
    switch (theme) {
      case 'dark':
        return 'Dark';
      case 'light':
        return 'Light';
      case 'cute':
        return 'Cute';
      case 'midnight':
        return 'Midnight';
      case 'forest':
        return 'Forest';
      case 'rose':
        return 'Rose';
      case 'high-contrast-dark':
        return 'High Contrast Dark';
      case 'Cyber Lime':
        return 'Cyber Lime';
      case 'Electric Cobalt':
        return 'Electric Cobalt';
      case 'Absolute Obsidian':
        return 'Absolute Obsidian';
      case 'Crimson Matrix':
        return 'Crimson Matrix';
      case 'Ultraviolet Horizon':
        return 'Ultraviolet Horizon';
      case 'Toxic Amber':
        return 'Toxic Amber';
      case 'Glitch Teal':
        return 'Glitch Teal';
      case 'Deep Void Magenta':
        return 'Deep Void Magenta';
      case 'Neo Gold':
        return 'Neo Gold';
      case 'Radioactive Poison':
        return 'Radioactive Poison';
      case 'Polar Blizzard':
        return 'Polar Blizzard';
      case 'Laser Orange':
        return 'Laser Orange';
      case 'Deep Ocean Cyan':
        return 'Deep Ocean Cyan';
      case 'Synthwave Pink':
        return 'Synthwave Pink';
      case 'Industrial Steel':
        return 'Industrial Steel';
      default:
        return theme;
    }
  }
}

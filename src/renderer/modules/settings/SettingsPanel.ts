/**
 * Settings panel in the sidebar: theme, editor, AI, terminal, and autosave options.
 */
import type { AppSettings, AppTheme, UpdateChannel } from '../../../shared/types';
import { bindReliableTextFocus } from '../../utils/textInputFocus';

export type SettingsChangeHandler = (settings: Partial<AppSettings>) => void;

const GEMINI_MODEL_OPTIONS = [
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' },
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash-Lite' },
] as const;

const THEME_OPTIONS: { value: AppTheme; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'cute', label: 'Cute Sakura' },
  { value: 'midnight', label: 'Midnight Neon' },
  { value: 'forest', label: 'Forest Mint' },
  { value: 'rose', label: 'Rose Latte' },
  { value: 'high-contrast-dark', label: 'High Contrast Dark' },
];

const FONT_FAMILY_OPTIONS = [
  { value: '"Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif', label: 'Segoe UI' },
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial' },
  { value: '"Helvetica Neue", Arial, sans-serif', label: 'Helvetica Neue' },
  { value: 'Verdana, Geneva, sans-serif', label: 'Verdana' },
  { value: 'Tahoma, Geneva, sans-serif', label: 'Tahoma' },
  { value: '"Trebuchet MS", Helvetica, sans-serif', label: 'Trebuchet MS' },
  { value: 'Georgia, "Times New Roman", serif', label: 'Georgia' },
  { value: '"Times New Roman", Times, serif', label: 'Times New Roman' },
  { value: 'Garamond, Georgia, serif', label: 'Garamond' },
  { value: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif', label: 'Impact' },
  { value: '"Comic Sans MS", "Comic Sans", cursive', label: 'Comic Sans MS' },
  { value: 'Inter, "Segoe UI", Arial, sans-serif', label: 'Inter' },
  { value: 'Roboto, Arial, sans-serif', label: 'Roboto' },
  { value: '"Open Sans", Arial, sans-serif', label: 'Open Sans' },
  { value: 'Montserrat, Arial, sans-serif', label: 'Montserrat' },
  { value: 'Poppins, Arial, sans-serif', label: 'Poppins' },
  { value: 'Lato, Arial, sans-serif', label: 'Lato' },
  { value: 'Merriweather, Georgia, serif', label: 'Merriweather' },
  { value: '"Playfair Display", Georgia, serif', label: 'Playfair Display' },
  { value: 'Consolas, "Cascadia Code", "Courier New", monospace', label: 'Consolas' },
  { value: '"Cascadia Code", "Cascadia Mono", Consolas, monospace', label: 'Cascadia Code' },
  { value: '"Fira Code", Consolas, monospace', label: 'Fira Code' },
  { value: '"JetBrains Mono", Consolas, monospace', label: 'JetBrains Mono' },
  { value: '"Courier New", Courier, monospace', label: 'Courier New' },
] as const;

export class SettingsPanel {
  private container: HTMLElement;
  private onChange: SettingsChangeHandler;
  private current: AppSettings;

  constructor(containerId: string, initial: AppSettings, onChange: SettingsChangeHandler) {
    this.container = document.getElementById(containerId)!;
    this.onChange = onChange;
    this.current = initial;
  }

  update(settings: AppSettings): void {
    this.current = settings;
    this.render();
  }

  private render(): void {
    const s = this.current;
    this.container.innerHTML = `
      <div class="settings-panel">
        <div class="settings-group">
          <h3>Appearance</h3>
          <div class="setting-row">
            <label>Theme</label>
            <select id="set-theme">
              ${this.renderThemeOptions(s.theme)}
            </select>
          </div>
          <div class="setting-row">
            <label>Font</label>
            <select id="set-fontFamily">
              ${this.renderFontFamilyOptions(s.fontFamily, s.customFontFamilies)}
            </select>
          </div>
          <div class="setting-row">
            <label>Inserted Font</label>
            <select id="set-insertFontFamily">
              ${this.renderFontFamilyOptions(s.insertFontFamily, s.customFontFamilies)}
            </select>
          </div>
          <div class="setting-row setting-row-field">
            <label>Add Custom Font</label>
            <div class="settings-key-row">
              <input type="text" id="set-customFontFamily" placeholder="Font name or CSS stack" autocomplete="off" />
              <button type="button" class="welcome-btn" id="btn-add-custom-font">Add</button>
            </div>
          </div>
        </div>
        <div class="settings-group">
          <h3>Editor</h3>
          <div class="setting-row">
            <label>Font Size</label>
            <input type="number" id="set-fontSize" min="10" max="32" value="${s.fontSize}" />
          </div>
          <div class="setting-row">
            <label>Tab Size</label>
            <input type="number" id="set-tabSize" min="2" max="8" value="${s.tabSize}" />
          </div>
          <div class="setting-row">
            <label>Word Wrap</label>
            <input type="checkbox" id="set-wordWrap" ${s.wordWrap ? 'checked' : ''} />
          </div>
          <div class="setting-row">
            <label>Minimap</label>
            <input type="checkbox" id="set-minimap" ${s.minimap ? 'checked' : ''} />
          </div>
        </div>
        <div class="settings-group">
          <h3>Files</h3>
          <div class="setting-row">
            <label>Auto Save</label>
            <input type="checkbox" id="set-autoSave" ${s.autoSave ? 'checked' : ''} />
          </div>
          <div class="setting-row">
            <label>Auto Save Delay (ms)</label>
            <input type="number" id="set-autoSaveDelay" min="300" max="10000" step="100" value="${s.autoSaveDelayMs}" />
          </div>
        </div>
        <div class="settings-group">
          <h3>AI</h3>
          <p class="settings-hint">Powers the autonomous agent in Chat AI.</p>
          <div class="setting-row">
            <label>Provider</label>
            <select id="set-aiProvider" class="settings-provider-select">
              <option value="gemini" ${s.aiProvider === 'gemini' ? 'selected' : ''}>Google Gemini</option>
              <option value="openrouter" ${s.aiProvider === 'openrouter' ? 'selected' : ''}>OpenRouter</option>
            </select>
          </div>
          <div class="setting-row setting-row-field ${s.aiProvider === 'gemini' ? '' : 'hidden'}">
            <label>Gemini API Key</label>
            <div class="settings-key-row">
              <input type="password" id="set-geminiKey" placeholder="AIzaSy..." value="${this.escapeAttr(s.geminiApiKey || '')}" autocomplete="off" />
              <button type="button" class="welcome-btn" id="btn-toggle-gemini-key">Show</button>
            </div>
          </div>
          <div class="setting-row setting-row-field ${s.aiProvider === 'gemini' ? '' : 'hidden'}">
            <label>Gemini Model</label>
            <select id="set-geminiModel">
              ${this.renderGeminiModelOptions(s.geminiModel)}
            </select>
          </div>
          <p class="settings-hint ${s.aiProvider === 'gemini' ? '' : 'hidden'}">Get a Gemini key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio</a>.</p>
          <div class="setting-row setting-row-field ${s.aiProvider === 'openrouter' ? '' : 'hidden'}">
            <label>OpenRouter API Key</label>
            <div class="settings-key-row">
              <input type="password" id="set-openRouterKey" placeholder="sk-or-..." value="${this.escapeAttr(s.openRouterApiKey || '')}" autocomplete="off" />
              <button type="button" class="welcome-btn" id="btn-toggle-openrouter-key">Show</button>
            </div>
          </div>
          <div class="setting-row setting-row-field ${s.aiProvider === 'openrouter' ? '' : 'hidden'}">
            <label>OpenRouter Model</label>
            <input type="text" id="set-openRouterModel" placeholder="openai/gpt-4o-mini" value="${this.escapeAttr(s.openRouterModel || '')}" autocomplete="off" />
          </div>
          <p class="settings-hint ${s.aiProvider === 'openrouter' ? '' : 'hidden'}">Use an OpenRouter model id such as <code>openai/gpt-4o-mini</code>. Tool-capable models work best for file and terminal actions.</p>
        </div>
        <div class="settings-group">
          <h3>Terminal</h3>
          <div class="setting-row">
            <label>Shell</label>
            <select id="set-terminalShell">
              <option value="cmd" ${s.terminalShell === 'cmd' ? 'selected' : ''}>Command Prompt (CMD)</option>
              <option value="powershell" ${s.terminalShell === 'powershell' ? 'selected' : ''}>PowerShell</option>
              <option value="bash" ${s.terminalShell === 'bash' ? 'selected' : ''}>Bash</option>
            </select>
          </div>
          <p class="settings-hint">Changing shell restarts the open terminal.</p>
          <div class="setting-row">
            <label>Font Size</label>
            <input type="number" id="set-terminalFont" min="10" max="24" value="${s.terminalFontSize}" />
          </div>
        </div>
        <div class="settings-group">
          <h3>Security</h3>
          <div class="setting-row">
            <label>Sandbox</label>
            <input type="checkbox" id="set-sandbox" ${s.sandbox ? 'checked' : ''} />
          </div>
          <p class="settings-hint">When ON: stronger security isolation (each renderer runs in a restricted sandbox). When OFF (default): preload scripts have full Node.js access enabling file ops, terminal, and native features. Requires restart.</p>
        </div>
        <div class="settings-group">
          <h3>Updates</h3>
          <p class="settings-hint">Choose which update channel to receive releases from.</p>
          <div class="setting-row">
            <label>Update Channel</label>
            <select id="set-updateChannel">
              <option value="stable" ${s.updateChannel === 'stable' ? 'selected' : ''}>Stable</option>
              <option value="insider" ${s.updateChannel === 'insider' ? 'selected' : ''}>Insider</option>
            </select>
          </div>
          <p class="settings-hint">Stable: well-tested releases for daily use. Insider: preview builds with the latest features (may be less stable).</p>
        </div>
        <div class="settings-group">
          <h3>About</h3>
          <p class="settings-hint">Product information is shown in the About window (Help -> About NexCode IDE).</p>
          <button type="button" class="welcome-btn" id="btn-settings-about">About NexCode IDE...</button>
        </div>
      </div>
    `;

    this.bind('set-theme', 'change', (el) => this.patch({ theme: (el as HTMLSelectElement).value as AppTheme }));
    this.bind('set-fontFamily', 'change', (el) => this.patch({ fontFamily: (el as HTMLSelectElement).value }));
    this.bind('set-insertFontFamily', 'change', (el) => this.patch({ insertFontFamily: (el as HTMLSelectElement).value }));
    this.bind('set-fontSize', 'change', (el) => this.patch({ fontSize: Number((el as HTMLInputElement).value) }));
    this.bind('set-tabSize', 'change', (el) => this.patch({ tabSize: Number((el as HTMLInputElement).value) }));
    this.bind('set-wordWrap', 'change', (el) => this.patch({ wordWrap: (el as HTMLInputElement).checked }));
    this.bind('set-minimap', 'change', (el) => this.patch({ minimap: (el as HTMLInputElement).checked }));
    this.bind('set-sandbox', 'change', (el) => this.patch({ sandbox: (el as HTMLInputElement).checked }));
    this.bind('set-autoSave', 'change', (el) => this.patch({ autoSave: (el as HTMLInputElement).checked }));
    this.bind('set-autoSaveDelay', 'change', (el) => this.patch({ autoSaveDelayMs: Number((el as HTMLInputElement).value) }));
    this.bind('set-terminalFont', 'change', (el) => this.patch({ terminalFontSize: Number((el as HTMLInputElement).value) }));
    this.bind('set-terminalShell', 'change', (el) =>
      this.patch({ terminalShell: (el as HTMLSelectElement).value as AppSettings['terminalShell'] }),
    );
    this.bind('set-updateChannel', 'change', (el) => {
      const channel = (el as HTMLSelectElement).value as UpdateChannel;
      this.patch({ updateChannel: channel });
      void window.electronAPI.setUpdateChannel(channel);
    });
    this.bind('set-aiProvider', 'change', (el) => {
      this.patch({ aiProvider: (el as HTMLSelectElement).value as AppSettings['aiProvider'] });
      this.render();
    });

    const customFont = this.container.querySelector('#set-customFontFamily') as HTMLInputElement | null;
    this.container.querySelector('#btn-add-custom-font')?.addEventListener('click', () => {
      const font = this.normalizeCustomFont(customFont?.value ?? '');
      if (!font) return;
      const customFontFamilies = [...new Set([...(this.current.customFontFamilies ?? []), font])];
      this.patch({ customFontFamilies, insertFontFamily: font });
      this.render();
    });

    const geminiKey = this.container.querySelector('#set-geminiKey') as HTMLInputElement | null;
    geminiKey?.addEventListener('change', () => this.patch({ geminiApiKey: geminiKey.value.trim() }));
    this.bindKeyVisibility('set-geminiKey', 'btn-toggle-gemini-key');

    const geminiModel = this.container.querySelector('#set-geminiModel') as HTMLSelectElement | null;
    geminiModel?.addEventListener('change', () => this.patch({ geminiModel: geminiModel.value.trim() }));

    const openRouterKey = this.container.querySelector('#set-openRouterKey') as HTMLInputElement | null;
    openRouterKey?.addEventListener('change', () => this.patch({ openRouterApiKey: openRouterKey.value.trim() }));
    this.bindKeyVisibility('set-openRouterKey', 'btn-toggle-openrouter-key');

    const openRouterModel = this.container.querySelector('#set-openRouterModel') as HTMLInputElement | null;
    openRouterModel?.addEventListener('change', () => this.patch({ openRouterModel: openRouterModel.value.trim() }));

    this.container.querySelector('#btn-settings-about')?.addEventListener('click', () => {
      window.electronAPI.showAboutWindow();
    });

    this.container.querySelectorAll<HTMLElement>('input:not([type="checkbox"]), textarea').forEach((el) => {
      bindReliableTextFocus(el);
    });
  }

  private bind(id: string, event: string, handler: (el: HTMLElement) => void): void {
    const el = this.container.querySelector(`#${id}`);
    el?.addEventListener(event, () => handler(el as HTMLElement));
  }

  private bindKeyVisibility(inputId: string, buttonId: string): void {
    const input = this.container.querySelector(`#${inputId}`) as HTMLInputElement | null;
    const btn = this.container.querySelector(`#${buttonId}`);
    btn?.addEventListener('click', () => {
      if (!input || !btn) return;
      if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = 'Hide';
      } else {
        input.type = 'password';
        btn.textContent = 'Show';
      }
    });
  }

  private patch(partial: Partial<AppSettings>): void {
    this.current = { ...this.current, ...partial };
    this.onChange(partial);
  }

  private renderGeminiModelOptions(selectedModel: string): string {
    const selected = selectedModel || 'gemini-2.5-flash';
    const hasSelected = GEMINI_MODEL_OPTIONS.some((option) => option.value === selected);
    const custom = hasSelected
      ? ''
      : `<option value="${this.escapeAttr(selected)}" selected>${this.escapeAttr(selected)}</option>`;

    return (
      custom +
      GEMINI_MODEL_OPTIONS.map(
        (option) =>
          `<option value="${this.escapeAttr(option.value)}" ${option.value === selected ? 'selected' : ''}>${option.label}</option>`,
      ).join('')
    );
  }

  private renderThemeOptions(selectedTheme: AppTheme): string {
    return THEME_OPTIONS.map(
      (option) =>
        `<option value="${option.value}" ${option.value === selectedTheme ? 'selected' : ''}>${this.escapeAttr(option.label)}</option>`,
    ).join('');
  }

  private renderFontFamilyOptions(selectedFont: string, customFontFamilies: string[] = []): string {
    const selected = selectedFont || FONT_FAMILY_OPTIONS[0].value;
    const options = [
      ...FONT_FAMILY_OPTIONS,
      ...customFontFamilies.map((font) => ({ value: font, label: this.fontLabel(font) })),
    ];
    const hasSelected = options.some((option) => option.value === selected);
    const custom = hasSelected
      ? ''
      : `<option value="${this.escapeAttr(selected)}" selected>${this.escapeAttr(this.fontLabel(selected))}</option>`;

    return (
      custom +
      options.map(
        (option) =>
          `<option value="${this.escapeAttr(option.value)}" ${option.value === selected ? 'selected' : ''}>${this.escapeAttr(option.label)}</option>`,
      ).join('')
    );
  }

  private normalizeCustomFont(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
  }

  private fontLabel(font: string): string {
    return font.split(',')[0].trim().replace(/^"|"$/g, '') || font;
  }

  private escapeAttr(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}

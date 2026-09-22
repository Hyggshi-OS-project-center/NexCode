/**
 * Settings panel — opens as a full-page tab inside the editor area.
 * Layout: left category nav + right scrollable content pane (VS Code style).
 */
import type { AppSettings, AppTheme, UpdateChannel } from '../../../shared/types';
import { bindReliableTextFocus } from '../../utils/textInputFocus';

export type SettingsChangeHandler = (settings: Partial<AppSettings>) => void;

const GEMINI_MODEL_FALLBACK = [
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
  { value: 'Cyber Lime', label: 'Cyber Lime' },
  { value: 'Electric Cobalt', label: 'Electric Cobalt' },
  { value: 'Absolute Obsidian', label: 'Absolute Obsidian' },
  { value: 'Crimson Matrix', label: 'Crimson Matrix' },
  { value: 'Ultraviolet Horizon', label: 'Ultraviolet Horizon' },
  { value: 'Toxic Amber', label: 'Toxic Amber' },
  { value: 'Glitch Teal', label: 'Glitch Teal' },
  { value: 'Deep Void Magenta', label: 'Deep Void Magenta' },
  { value: 'Neo Gold', label: 'Neo Gold' },
  { value: 'Radioactive Poison', label: 'Radioactive Poison' },
  { value: 'Polar Blizzard', label: 'Polar Blizzard' },
  { value: 'Laser Orange', label: 'Laser Orange' },
  { value: 'Deep Ocean Cyan', label: 'Deep Ocean Cyan' },
  { value: 'Synthwave Pink', label: 'Synthwave Pink' },
  { value: 'Industrial Steel', label: 'Industrial Steel' },
  { value: '2017 Dark (Visual Studio - C/C++)', label: 'C/C++ HC Dark' },
  { value: '2017 Light (Visual Studio - C/C++)', label: 'C/C++ HC Light' },
];

/** Proportional/sans-serif fonts — for UI */
const UI_FONT_OPTIONS = [
  { value: '"Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif', label: 'Segoe UI (default)' },
  { value: 'Inter, "Segoe UI", Arial, sans-serif', label: 'Inter' },
  { value: 'Roboto, Arial, sans-serif', label: 'Roboto' },
  { value: '"Open Sans", Arial, sans-serif', label: 'Open Sans' },
  { value: 'Montserrat, Arial, sans-serif', label: 'Montserrat' },
  { value: 'Poppins, Arial, sans-serif', label: 'Poppins' },
  { value: 'Lato, Arial, sans-serif', label: 'Lato' },
  { value: 'Verdana, Geneva, sans-serif', label: 'Verdana' },
  { value: 'Tahoma, Geneva, sans-serif', label: 'Tahoma' },
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial' },
  { value: '"Helvetica Neue", Arial, sans-serif', label: 'Helvetica Neue' },
  { value: '"Trebuchet MS", Helvetica, sans-serif', label: 'Trebuchet MS' },
  { value: 'Georgia, "Times New Roman", serif', label: 'Georgia' },
] as const;

/** Monospace fonts — for code editor */
const EDITOR_FONT_OPTIONS = [
  { value: '"JetBrains Mono", "Cascadia Code", Consolas, "Courier New", monospace', label: 'JetBrains Mono (default)' },
  { value: '"Cascadia Code", "Cascadia Mono", Consolas, monospace', label: 'Cascadia Code' },
  { value: '"Fira Code", Consolas, monospace', label: 'Fira Code' },
  { value: 'Consolas, "Cascadia Code", "Courier New", monospace', label: 'Consolas' },
  { value: '"Source Code Pro", Consolas, monospace', label: 'Source Code Pro' },
  { value: '"Hack", Consolas, monospace', label: 'Hack' },
  { value: '"Inconsolata", Consolas, monospace', label: 'Inconsolata' },
  { value: '"Courier New", Courier, monospace', label: 'Courier New' },
] as const;

type SettingsCategory = 'appearance' | 'editor' | 'cursor-scroll' | 'ai' | 'terminal' | 'advanced';

const CATEGORIES: { id: SettingsCategory; label: string }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'editor', label: 'Editor' },
  { id: 'cursor-scroll', label: 'Cursor & Scroll' },
  { id: 'ai', label: 'AI' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'advanced', label: 'Advanced' },
];

export class SettingsPanel {
  private container: HTMLElement;
  private onChange: SettingsChangeHandler;
  private current: AppSettings;
  private activeCategory: SettingsCategory = 'appearance';
  private geminiModelsCache: { value: string; label: string; supportsImages: boolean }[] | null = null;
  private localModelsCache: { value: string; label: string; supportsImages: boolean }[] = [];

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
      <div class="stab-layout">
        <nav class="stab-nav" role="navigation" aria-label="Settings categories">
          <div class="stab-nav-title">Settings</div>
          ${CATEGORIES.map(cat => `
            <button
              class="stab-nav-item ${this.activeCategory === cat.id ? 'active' : ''}"
              data-cat="${cat.id}"
              type="button"
              aria-pressed="${this.activeCategory === cat.id}"
            >${cat.label}</button>
          `).join('')}
        </nav>
        <div class="stab-content" role="region" aria-label="${CATEGORIES.find(c => c.id === this.activeCategory)?.label}">
          <div class="stab-content-inner">
            ${this.renderCategory(s)}
          </div>
        </div>
      </div>
    `;

    // Nav clicks
    this.container.querySelectorAll<HTMLButtonElement>('.stab-nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeCategory = btn.dataset.cat as SettingsCategory;
        this.render();
      });
    });

    this.bindControls(s);

    this.container.querySelectorAll<HTMLElement>('input:not([type="checkbox"]), textarea').forEach(el => {
      bindReliableTextFocus(el);
    });

    void this.refreshGeminiModels();
    if (this.activeCategory === 'ai' && s.aiProvider === 'local') void this.refreshLocalModels();
  }

  private renderCategory(s: AppSettings): string {
    switch (this.activeCategory) {
      case 'appearance': return this.renderAppearance(s);
      case 'editor':     return this.renderEditor(s);
      case 'cursor-scroll': return this.renderCursorScroll(s);
      case 'ai':         return this.renderAI(s);
      case 'terminal':   return this.renderTerminal(s);
      case 'advanced':   return this.renderAdvanced(s);
      default:           return '';
    }
  }

  // ── Appearance ─────────────────────────────────────────────────────────────
  private renderAppearance(s: AppSettings): string {
    return `
      <h2 class="stab-section-title">Appearance</h2>
      ${this.row('Theme', `
        <select id="set-theme">${this.renderThemeOptions(s.theme)}</select>
      `)}
      <div class="stab-divider"></div>
      <h3 class="stab-subsection-title">Font</h3>
      ${this.row('Editor Font', `
        <select id="set-editorFontFamily">${this.renderEditorFontOptions(s.editorFontFamily)}</select>
      `, 'Font used inside the code editor (monospace recommended).')}
      ${this.row('UI Font', `
        <select id="set-fontFamily">${this.renderUiFontOptions(s.fontFamily)}</select>
      `, 'Font used in the interface outside the editor.')}
      ${this.row('Add Custom Editor Font', `
        <div class="stab-input-row">
          <input type="text" id="set-customFontFamily" placeholder="Font name or CSS stack" autocomplete="off" />
          <button type="button" class="stab-btn" id="btn-add-custom-font">Add</button>
        </div>
      `, 'Add a font by name or CSS font stack (e.g. "Fira Code", monospace).')}
    `;
  }

  // ── Editor ─────────────────────────────────────────────────────────────────
  private renderEditor(s: AppSettings): string {
    return `
      <h2 class="stab-section-title">Editor</h2>
      ${this.row('Font Size', `
        <input type="number" id="set-fontSize" min="10" max="32" value="${s.fontSize}" />
        <span class="stab-unit">px</span>
      `)}
      ${this.row('Tab Size', `
        <input type="number" id="set-tabSize" min="2" max="8" value="${s.tabSize}" />
        <span class="stab-unit">spaces</span>
      `)}
      ${this.toggle('Word Wrap', 'set-wordWrap', s.wordWrap, 'Wrap long lines at the editor boundary.')}
      ${this.toggle('Minimap', 'set-minimap', s.minimap, 'Show the code overview minimap on the right.')}
      <div class="stab-divider"></div>
      <h3 class="stab-subsection-title">Bracket Pairs</h3>
      ${this.toggle('Bracket Pair Colorization', 'set-bracketColor', s.bracketPairColorization ?? true, 'Color-code matching bracket pairs for readability.')}
      ${this.row('Bracket Pair Guides', `
        <select id="set-bracketGuides">
          <option value="none" ${(s.bracketPairGuides ?? 'active') === 'none' ? 'selected' : ''}>None</option>
          <option value="active" ${(s.bracketPairGuides ?? 'active') === 'active' ? 'selected' : ''}>Active (highlight nearest pair)</option>
          <option value="always" ${(s.bracketPairGuides ?? 'active') === 'always' ? 'selected' : ''}>Always (show all guides)</option>
        </select>
      `, 'Draw vertical guide lines inside matched brackets.')}
      <div class="stab-divider"></div>
      <h3 class="stab-subsection-title">IntelliSense</h3>
      ${this.row('Word-based Suggestions', `
        <select id="set-wordSuggestions">
          <option value="off" ${s.wordBasedSuggestions === 'off' ? 'selected' : ''}>Off</option>
          <option value="currentDocument" ${s.wordBasedSuggestions === 'currentDocument' ? 'selected' : ''}>Current document</option>
          <option value="matchingDocuments" ${s.wordBasedSuggestions === 'matchingDocuments' ? 'selected' : ''}>Matching documents</option>
          <option value="allDocuments" ${s.wordBasedSuggestions === 'allDocuments' ? 'selected' : ''}>All documents</option>
        </select>
      `, 'Suggest words from open documents in addition to language service completions.')}
      <div class="stab-divider"></div>
      <h3 class="stab-subsection-title">Files</h3>
      ${this.toggle('Auto Save', 'set-autoSave', s.autoSave, 'Automatically save files after each change.')}
      ${this.row('Auto Save Delay', `
        <input type="number" id="set-autoSaveDelay" min="300" max="10000" step="100" value="${s.autoSaveDelayMs}" />
        <span class="stab-unit">ms</span>
      `, 'Delay after the last keystroke before auto-saving.')}
    `;
  }

  // ── Cursor & Scroll ────────────────────────────────────────────────────────
  private renderCursorScroll(s: AppSettings): string {
    return `
      <h2 class="stab-section-title">Cursor &amp; Scroll</h2>
      <h3 class="stab-subsection-title">Cursor</h3>
      ${this.row('Cursor Blinking', `
        <select id="set-cursorBlinking">
          <option value="blink"  ${(s.cursorBlinking ?? 'smooth') === 'blink'  ? 'selected' : ''}>Blink (default)</option>
          <option value="smooth" ${(s.cursorBlinking ?? 'smooth') === 'smooth' ? 'selected' : ''}>Smooth</option>
          <option value="phase"  ${(s.cursorBlinking ?? 'smooth') === 'phase'  ? 'selected' : ''}>Phase (fade in/out)</option>
          <option value="expand" ${(s.cursorBlinking ?? 'smooth') === 'expand' ? 'selected' : ''}>Expand (pulse)</option>
          <option value="solid"  ${(s.cursorBlinking ?? 'smooth') === 'solid'  ? 'selected' : ''}>Solid (no blink)</option>
        </select>
      `, 'Animation style for the text cursor.')}
      ${this.row('Smooth Caret Animation', `
        <select id="set-cursorSmoothAnim">
          <option value="off"      ${(s.cursorSmoothCaretAnimation ?? 'on') === 'off'      ? 'selected' : ''}>Off</option>
          <option value="explicit" ${(s.cursorSmoothCaretAnimation ?? 'on') === 'explicit' ? 'selected' : ''}>Explicit (on arrow keys only)</option>
          <option value="on"       ${(s.cursorSmoothCaretAnimation ?? 'on') === 'on'       ? 'selected' : ''}>On (always animate)</option>
        </select>
      `, 'Animate cursor movement instead of jumping instantly.')}
      <div class="stab-divider"></div>
      <h3 class="stab-subsection-title">Scrolling</h3>
      ${this.toggle('Smooth Scrolling', 'set-smoothScrolling', s.smoothScrolling ?? true, 'Animate editor scrolling with an easing curve.')}
      <div class="stab-divider"></div>
      <h3 class="stab-subsection-title">Hover Tooltip</h3>
      ${this.row('Hover Delay', `
        <input type="number" id="set-hoverDelay" min="0" max="2000" step="50" value="${s.hoverDelay ?? 300}" />
        <span class="stab-unit">ms</span>
      `, 'How long to wait before showing the hover information tooltip.')}
    `;
  }

  // ── AI ────────────────────────────────────────────────────────────────────
  private renderAI(s: AppSettings): string {
    return `
      <h2 class="stab-section-title">AI</h2>
      <p class="stab-hint">Powers the autonomous agent in Chat AI.</p>
      ${this.row('Provider', `
        <select id="set-aiProvider" class="stab-select-wide">
          <option value="gemini"      ${s.aiProvider === 'gemini'      ? 'selected' : ''}>Google Gemini</option>
          <option value="openrouter"  ${s.aiProvider === 'openrouter'  ? 'selected' : ''}>OpenRouter</option>
          <option value="claude"      ${s.aiProvider === 'claude'      ? 'selected' : ''}>Anthropic Claude</option>
          <option value="local"       ${s.aiProvider === 'local'       ? 'selected' : ''}>Local (Ollama / LM Studio)</option>
        </select>
      `)}

      ${s.aiProvider === 'gemini' ? `
        ${this.row('Gemini API Key', `
          <div class="stab-input-row">
            <input type="password" id="set-geminiKey" placeholder="AIzaSy…" value="${this.escapeAttr(s.geminiApiKey || '')}" autocomplete="off" />
            <button type="button" class="stab-btn" id="btn-toggle-gemini-key">Show</button>
          </div>
        `, '<a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Get a key at Google AI Studio</a>.')}
        ${this.row('Gemini Model', `<select id="set-geminiModel">${this.renderGeminiModelOptions(s.geminiModel)}</select>`)}
      ` : ''}
      ${s.aiProvider === 'openrouter' ? `
        ${this.row('OpenRouter API Key', `
          <div class="stab-input-row">
            <input type="password" id="set-openRouterKey" placeholder="sk-or-…" value="${this.escapeAttr(s.openRouterApiKey || '')}" autocomplete="off" />
            <button type="button" class="stab-btn" id="btn-toggle-openrouter-key">Show</button>
          </div>
        `)}
        ${this.row('OpenRouter Model', `
          <input type="text" id="set-openRouterModel" class="stab-input-wide" placeholder="openai/gpt-4o-mini" value="${this.escapeAttr(s.openRouterModel || '')}" autocomplete="off" />
        `, 'Use tool-capable models for best results.')}
      ` : ''}
      ${s.aiProvider === 'claude' ? `
        ${this.row('Claude API Key', `
          <div class="stab-input-row">
            <input type="password" id="set-claudeKey" placeholder="sk-ant-…" value="${this.escapeAttr(s.claudeApiKey || '')}" autocomplete="off" />
            <button type="button" class="stab-btn" id="btn-toggle-claude-key">Show</button>
          </div>
        `, '<a href="https://console.anthropic.com/" target="_blank" rel="noopener">Get a key at Anthropic Console</a>.')}
        ${this.row('Claude Model', `
          <input type="text" id="set-claudeModel" class="stab-input-wide" placeholder="claude-sonnet-4-20250514" value="${this.escapeAttr(s.claudeModel || '')}" autocomplete="off" />
        `)}
      ` : ''}
      ${s.aiProvider === 'local' ? `
        ${this.row('Local Server URL', `
          <input type="text" id="set-localAiBaseUrl" class="stab-input-wide" placeholder="http://localhost:11434/v1" value="${this.escapeAttr(s.localAiBaseUrl || '')}" autocomplete="off" />
        `, 'Any OpenAI-compatible server. Ollama: <code>http://localhost:11434/v1</code> · LM Studio: <code>http://localhost:1234/v1</code> · llama.cpp: <code>http://localhost:8080/v1</code>. Runs offline; code never leaves this machine.')}
        ${this.row('Local Model', `
          <div class="stab-input-row">
            <input type="text" id="set-localAiModel" class="stab-input-wide" list="set-localModelList" placeholder="(auto: prefers a coder model)" value="${this.escapeAttr(s.localAiModel || '')}" autocomplete="off" />
            <button type="button" class="stab-btn" id="btn-detect-local-models">Detect</button>
          </div>
          <datalist id="set-localModelList">${this.renderLocalModelDatalist()}</datalist>
        `, '<span id="local-ai-status">Click Detect to list the models installed on the server.</span> Pick a model that supports tool calling to let the agent edit files; other models still work as plain chat. Small models (1–4B, quantized) suit 8 GB RAM machines.')}
      ` : ''}
      <div class="stab-divider"></div>
      <h3 class="stab-subsection-title">MCP Servers (Local AI)</h3>
      ${this.row('MCP Configuration', `
        <textarea id="set-mcpServersJson" class="stab-input-wide" rows="7" spellcheck="false" placeholder='{"mcpServers":{"filesystem":{"command":"npx","args":["-y","@modelcontextprotocol/server-filesystem","."]}}}' >${this.escapeAttr(s.mcpServersJson ?? '{\n  "mcpServers": {}\n}')}</textarea>
      `, 'Local stdio MCP servers. Uses the standard <code>mcpServers</code> configuration shape (the legacy <code>servers</code> array also works). Restart the current AI request after changing this.')}
    `;
  }

  // ── Terminal ───────────────────────────────────────────────────────────────
  private renderTerminal(s: AppSettings): string {
    return `
      <h2 class="stab-section-title">Terminal</h2>
      ${this.row('Shell', `
        <select id="set-terminalShell">
          <option value="cmd"        ${s.terminalShell === 'cmd'        ? 'selected' : ''}>Command Prompt (CMD)</option>
          <option value="powershell" ${s.terminalShell === 'powershell' ? 'selected' : ''}>PowerShell</option>
          <option value="bash"       ${s.terminalShell === 'bash'       ? 'selected' : ''}>Bash</option>
          <option value="zsh"        ${s.terminalShell === 'zsh'        ? 'selected' : ''}>Zsh</option>
          <option value="sh"         ${s.terminalShell === 'sh'         ? 'selected' : ''}>sh</option>
        </select>
      `, 'Changing shell restarts the open terminal.')}
      ${this.row('Font Size', `
        <input type="number" id="set-terminalFont" min="10" max="24" value="${s.terminalFontSize}" />
        <span class="stab-unit">px</span>
      `)}
    `;
  }

  // ── Advanced ───────────────────────────────────────────────────────────────
  private renderAdvanced(s: AppSettings): string {
    return `
      <h2 class="stab-section-title">Advanced</h2>
      <h3 class="stab-subsection-title">Updates</h3>
      ${this.row('Update Channel', `
        <select id="set-updateChannel">
          <option value="stable"  ${s.updateChannel === 'stable'  ? 'selected' : ''}>Stable</option>
          <option value="insider" ${s.updateChannel === 'insider' ? 'selected' : ''}>Insider</option>
        </select>
      `, 'Stable: well-tested releases. Insider: preview builds with latest features.')}
      <div class="stab-divider"></div>
      <h3 class="stab-subsection-title">Security</h3>
      ${this.toggle('Sandbox', 'set-sandbox', s.sandbox, 'Enable Chromium sandbox for stronger security isolation. Requires restart.')}
      <div class="stab-divider"></div>
      <h3 class="stab-subsection-title">Performance (Large Files)</h3>
      ${this.toggle('Large File Optimizations', 'set-largeFileOpt', s.largeFileOptimizations, 'Enable virtual scrolling and reduced tokenization for large files.')}
      ${this.row('Max Tokenization Line Length', `
        <input type="number" id="set-maxTokenLen" min="1000" max="100000" step="1000" value="${s.maxTokenizationLineLength}" />
        <span class="stab-unit">chars</span>
      `, 'Lines longer than this skip syntax highlighting.')}
      ${this.row('Stop Rendering After', `
        <input type="number" id="set-stopRender" min="10000" max="500000" step="10000" value="${s.stopRenderingLineAfter}" />
        <span class="stab-unit">chars</span>
      `, 'Stop rendering line content after this column to avoid DOM blowup.')}
      <div class="stab-divider"></div>
      <h3 class="stab-subsection-title">Experience</h3>
      ${this.toggle('Enable Easter Egg', 'set-easterEggEnabled', s.easterEggEnabled ?? true, 'Show the NexCode Easter egg after the editor has been idle for a while.')}
      ${this.toggle('Reduced Motion', 'set-reducedMotion', s.reducedMotion ?? false, 'Reduce non-essential interface animation and transitions.')}
      ${this.toggle('Show Hidden Files', 'set-showHiddenFiles', s.showHiddenFiles ?? false, 'Show dot-prefixed files and folders in Explorer by default.')}
      <div class="stab-divider"></div>
      <h3 class="stab-subsection-title">About</h3>
      <button type="button" class="stab-btn stab-btn-about" id="btn-settings-about">About NexCode IDE…</button>
    `;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  private row(label: string, control: string, hint?: string): string {
    return `
      <div class="stab-row">
        <div class="stab-row-label">${label}</div>
        <div class="stab-row-control">
          ${control}
          ${hint ? `<p class="stab-hint">${hint}</p>` : ''}
        </div>
      </div>
    `;
  }

  private toggle(label: string, id: string, checked: boolean, hint?: string): string {
    return `
      <div class="stab-row">
        <div class="stab-row-label">${label}</div>
        <div class="stab-row-control">
          <label class="stab-toggle">
            <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} />
            <span class="stab-toggle-track"></span>
          </label>
          ${hint ? `<p class="stab-hint">${hint}</p>` : ''}
        </div>
      </div>
    `;
  }

  // ── Bind controls ──────────────────────────────────────────────────────────
  private bindControls(s: AppSettings): void {
    // Appearance
    this.bind('set-theme', 'change', el => this.patch({ theme: (el as HTMLSelectElement).value as AppTheme }));
    this.bind('set-fontFamily', 'change', el => this.patch({ fontFamily: (el as HTMLSelectElement).value }));
    this.bind('set-editorFontFamily', 'change', el => this.patch({ editorFontFamily: (el as HTMLSelectElement).value }));
    const customFont = this.container.querySelector<HTMLInputElement>('#set-customFontFamily');
    this.container.querySelector('#btn-add-custom-font')?.addEventListener('click', () => {
      const font = customFont?.value.trim().replace(/\s+/g, ' ') ?? '';
      if (!font) return;
      const customFontFamilies = [...new Set([...(this.current.customFontFamilies ?? []), font])];
      this.patch({ customFontFamilies, editorFontFamily: font });
      this.render();
    });

    // Editor
    this.bind('set-fontSize', 'change', el => this.patch({ fontSize: Number((el as HTMLInputElement).value) }));
    this.bind('set-tabSize', 'change', el => this.patch({ tabSize: Number((el as HTMLInputElement).value) }));
    this.bind('set-wordWrap', 'change', el => this.patch({ wordWrap: (el as HTMLInputElement).checked }));
    this.bind('set-minimap', 'change', el => this.patch({ minimap: (el as HTMLInputElement).checked }));
    this.bind('set-bracketColor', 'change', el => this.patch({ bracketPairColorization: (el as HTMLInputElement).checked }));
    this.bind('set-bracketGuides', 'change', el => this.patch({ bracketPairGuides: (el as HTMLSelectElement).value as AppSettings['bracketPairGuides'] }));
    this.bind('set-wordSuggestions', 'change', el => this.patch({ wordBasedSuggestions: (el as HTMLSelectElement).value as AppSettings['wordBasedSuggestions'] }));
    this.bind('set-autoSave', 'change', el => this.patch({ autoSave: (el as HTMLInputElement).checked }));
    this.bind('set-autoSaveDelay', 'change', el => this.patch({ autoSaveDelayMs: Number((el as HTMLInputElement).value) }));

    // Cursor & Scroll
    this.bind('set-cursorBlinking', 'change', el => this.patch({ cursorBlinking: (el as HTMLSelectElement).value as AppSettings['cursorBlinking'] }));
    this.bind('set-cursorSmoothAnim', 'change', el => this.patch({ cursorSmoothCaretAnimation: (el as HTMLSelectElement).value as AppSettings['cursorSmoothCaretAnimation'] }));
    this.bind('set-smoothScrolling', 'change', el => this.patch({ smoothScrolling: (el as HTMLInputElement).checked }));
    this.bind('set-hoverDelay', 'change', el => this.patch({ hoverDelay: Number((el as HTMLInputElement).value) }));

    // AI
    this.bind('set-aiProvider', 'change', el => { this.patch({ aiProvider: (el as HTMLSelectElement).value as AppSettings['aiProvider'] }); this.render(); });
    const geminiKey = this.container.querySelector<HTMLInputElement>('#set-geminiKey');
    geminiKey?.addEventListener('change', () => this.patch({ geminiApiKey: geminiKey.value.trim() }));
    this.bindKeyVisibility('set-geminiKey', 'btn-toggle-gemini-key');
    const geminiModel = this.container.querySelector<HTMLSelectElement>('#set-geminiModel');
    geminiModel?.addEventListener('change', () => this.patch({ geminiModel: geminiModel.value.trim() }));
    const orKey = this.container.querySelector<HTMLInputElement>('#set-openRouterKey');
    orKey?.addEventListener('change', () => this.patch({ openRouterApiKey: orKey.value.trim() }));
    this.bindKeyVisibility('set-openRouterKey', 'btn-toggle-openrouter-key');
    const orModel = this.container.querySelector<HTMLInputElement>('#set-openRouterModel');
    orModel?.addEventListener('change', () => this.patch({ openRouterModel: orModel.value.trim() }));
    const claudeKey = this.container.querySelector<HTMLInputElement>('#set-claudeKey');
    claudeKey?.addEventListener('change', () => this.patch({ claudeApiKey: claudeKey.value.trim() }));
    this.bindKeyVisibility('set-claudeKey', 'btn-toggle-claude-key');
    const claudeModel = this.container.querySelector<HTMLInputElement>('#set-claudeModel');
    claudeModel?.addEventListener('change', () => this.patch({ claudeModel: claudeModel.value.trim() }));
    const localUrl = this.container.querySelector<HTMLInputElement>('#set-localAiBaseUrl');
    localUrl?.addEventListener('change', () => {
      this.patch({ localAiBaseUrl: localUrl.value.trim() });
      void this.refreshLocalModels();
    });
    const localModel = this.container.querySelector<HTMLInputElement>('#set-localAiModel');
    localModel?.addEventListener('change', () => this.patch({ localAiModel: localModel.value.trim() }));
    this.container.querySelector('#btn-detect-local-models')?.addEventListener('click', () => void this.refreshLocalModels());
    const mcpServers = this.container.querySelector<HTMLTextAreaElement>('#set-mcpServersJson');
    mcpServers?.addEventListener('change', () => this.patch({ mcpServersJson: mcpServers.value.trim() || '{\n  "mcpServers": {}\n}' }));

    // Terminal
    this.bind('set-terminalShell', 'change', el => this.patch({ terminalShell: (el as HTMLSelectElement).value as AppSettings['terminalShell'] }));
    this.bind('set-terminalFont', 'change', el => this.patch({ terminalFontSize: Number((el as HTMLInputElement).value) }));

    // Advanced
    this.bind('set-updateChannel', 'change', el => {
      const ch = (el as HTMLSelectElement).value as UpdateChannel;
      this.patch({ updateChannel: ch });
      void window.electronAPI.setUpdateChannel(ch);
    });
    this.bind('set-sandbox', 'change', el => this.patch({ sandbox: (el as HTMLInputElement).checked }));
    this.bind('set-largeFileOpt', 'change', el => this.patch({ largeFileOptimizations: (el as HTMLInputElement).checked }));
    this.bind('set-maxTokenLen', 'change', el => this.patch({ maxTokenizationLineLength: Number((el as HTMLInputElement).value) }));
    this.bind('set-stopRender', 'change', el => this.patch({ stopRenderingLineAfter: Number((el as HTMLInputElement).value) }));
    this.bind('set-easterEggEnabled', 'change', el => this.patch({ easterEggEnabled: (el as HTMLInputElement).checked }));
    this.bind('set-reducedMotion', 'change', el => this.patch({ reducedMotion: (el as HTMLInputElement).checked }));
    this.bind('set-showHiddenFiles', 'change', el => this.patch({ showHiddenFiles: (el as HTMLInputElement).checked }));
    this.container.querySelector('#btn-settings-about')?.addEventListener('click', () => window.electronAPI.showAboutWindow());
  }

  private bind(id: string, event: string, handler: (el: HTMLElement) => void): void {
    const el = this.container.querySelector(`#${id}`);
    el?.addEventListener(event, () => handler(el as HTMLElement));
  }

  private bindKeyVisibility(inputId: string, buttonId: string): void {
    const input = this.container.querySelector<HTMLInputElement>(`#${inputId}`);
    const btn = this.container.querySelector(`#${buttonId}`);
    btn?.addEventListener('click', () => {
      if (!input || !btn) return;
      if (input.type === 'password') { input.type = 'text'; btn.textContent = 'Hide'; }
      else { input.type = 'password'; btn.textContent = 'Show'; }
    });
  }

  private patch(partial: Partial<AppSettings>): void {
    this.current = { ...this.current, ...partial };
    this.onChange(partial);
  }

  async refreshGeminiModels(): Promise<void> {
    try {
      const models = await window.electronAPI.listGeminiModels();
      if (models.length > 0) this.geminiModelsCache = models;
    } catch { /* keep fallback */ }
  }

  /** Re-query the local server and update the datalist/status in place (no full re-render). */
  async refreshLocalModels(): Promise<void> {
    const status = this.container.querySelector<HTMLElement>('#local-ai-status');
    if (status) status.textContent = 'Checking local server…';
    try {
      this.localModelsCache = await window.electronAPI.listLocalModels();
    } catch {
      this.localModelsCache = [];
    }
    const list = this.container.querySelector<HTMLElement>('#set-localModelList');
    if (list) list.innerHTML = this.renderLocalModelDatalist();
    const el = this.container.querySelector<HTMLElement>('#local-ai-status');
    if (el) {
      el.textContent = this.localModelsCache.length > 0
        ? `Found ${this.localModelsCache.length} model(s) on the server.`
        : 'No models found — is the server running (e.g. "ollama serve") and a model pulled?';
    }
  }

  private renderLocalModelDatalist(): string {
    return this.localModelsCache.map(m => `<option value="${this.escapeAttr(m.value)}"></option>`).join('');
  }

  private renderGeminiModelOptions(selectedModel: string): string {
    const selected = selectedModel || 'gemini-2.5-flash';
    const models = this.geminiModelsCache ?? GEMINI_MODEL_FALLBACK;
    const hasSelected = models.some(m => m.value === selected);
    const custom = hasSelected ? '' : `<option value="${this.escapeAttr(selected)}" selected>${this.escapeAttr(selected)}</option>`;
    return custom + models.map(m => `<option value="${this.escapeAttr(m.value)}" ${m.value === selected ? 'selected' : ''}>${m.label}</option>`).join('');
  }

  private renderThemeOptions(selected: AppTheme): string {
    return THEME_OPTIONS.map(o => `<option value="${o.value}" ${o.value === selected ? 'selected' : ''}>${this.escapeAttr(o.label)}</option>`).join('');
  }

  private renderEditorFontOptions(selected: string): string {
    const safeSelected = selected ?? EDITOR_FONT_OPTIONS[0].value;
    const custom = (this.current.customFontFamilies ?? []).map(f => ({ value: f, label: this.fontLabel(f) }));
    const options = [...EDITOR_FONT_OPTIONS, ...custom];
    const hasSelected = options.some(o => o.value === safeSelected);
    const extra = hasSelected ? '' : `<option value="${this.escapeAttr(safeSelected)}" selected>${this.escapeAttr(this.fontLabel(safeSelected))}</option>`;
    return extra + options.map(o => `<option value="${this.escapeAttr(o.value)}" ${o.value === safeSelected ? 'selected' : ''}>${this.escapeAttr(o.label)}</option>`).join('');
  }

  private renderUiFontOptions(selected: string): string {
    const safeSelected = selected ?? UI_FONT_OPTIONS[0].value;
    const options = [...UI_FONT_OPTIONS];
    const hasSelected = options.some(o => o.value === safeSelected);
    const extra = hasSelected ? '' : `<option value="${this.escapeAttr(safeSelected)}" selected>${this.escapeAttr(this.fontLabel(safeSelected))}</option>`;
    return extra + options.map(o => `<option value="${this.escapeAttr(o.value)}" ${o.value === safeSelected ? 'selected' : ''}>${this.escapeAttr(o.label)}</option>`).join('');
  }

  private fontLabel(font: string): string {
    return font.split(',')[0].trim().replace(/^"|"$/g, '') || font;
  }

  private escapeAttr(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

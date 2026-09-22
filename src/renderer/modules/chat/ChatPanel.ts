/**
 * ChatPanel — fully automated AI agent UI in the sidebar.
 *
 * Streaming:
 * - Text is rendered as the model produces it. Fragments arrive over the
 *   `ai:chat-delta` IPC channel and are appended in place, so nothing waits
 *   for the request to finish.
 * - An animation-frame painter batches each arrival burst into a single DOM
 *   update. This keeps scrolling and markdown rendering smooth without
 *   simulating a slow character-by-character typewriter effect.
 * - A "Thinking…" state covers the gap before the first fragment, and the
 *   Send button becomes a Stop button that aborts the request for real.
 */
import type {
  AiAgentAction,
  AiChatAttachment,
  AiChatMessage,
  AiChatResult,
  AiEditorContext,
  AiStreamStatus,
  AppSettings,
} from '../../../shared/types';
import { bindReliableTextFocus } from '../../utils/textInputFocus';

interface ChatDisplayMessage {
  id: number;
  role: 'user' | 'model';
  text: string;
  attachments?: AiChatAttachment[];
  error?: boolean;
  actions?: AiAgentAction[];
}

interface ChatProcessItem {
  label: string;
  type: AiAgentAction['type'] | 'thinking';
  status: 'running' | 'done' | 'failed';
}

export type AgentActionsHandler = (actions: AiAgentAction[]) => void | Promise<void>;

/** Fallback Gemini model list used when the API key is missing or the API call fails. */
const GEMINI_MODEL_FALLBACK = [
  { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
  { value: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite' },
  { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview' },
  { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
  { value: 'gemma-4-26b-a4b-it', label: 'Gemma 4 26B A4B IT' },
  { value: 'gemma-4-31b-it', label: 'Gemma 4 31B IT' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' },
] as const;

/** Fallback OpenRouter model list used when the API key is missing or the API call fails. */
const OPENROUTER_MODEL_FALLBACK = [
  { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini (vision)', supportsImages: true },
  { value: 'openai/gpt-4.1-mini', label: 'GPT-4.1 Mini (vision)', supportsImages: true },
  { value: 'openai/gpt-4.1', label: 'GPT-4.1 (vision)', supportsImages: true },
  { value: 'openai/gpt-5.5-pro', label: 'GPT-5.5 Pro (vision)', supportsImages: true },
  { value: 'openai/gpt-5.5', label: 'GPT-5.5 (vision)', supportsImages: true },
  { value: 'openai/gpt-5.4-mini', label: 'GPT-5.4 Mini (vision)', supportsImages: true },
  { value: 'openai/gpt-5.4-pro', label: 'GPT-5.4 Pro (vision)', supportsImages: true },
  { value: 'openai/gpt-5.4', label: 'GPT-5.4 (vision)', supportsImages: true },
  { value: 'openai/gpt-5.3-codex', label: 'GPT-5.3 Codex (vision)', supportsImages: true },
  { value: 'openai/gpt-oss-120b:free', label: 'GPT-OSS 120B (free)' },
  { value: 'anthropic/claude-fable-5', label: 'Claude Fable 5 (vision)', supportsImages: true },
  { value: 'anthropic/claude-opus-4.8-fast', label: 'Claude Opus 4.8 Fast (vision)', supportsImages: true },
  { value: 'anthropic/claude-opus-4.8', label: 'Claude Opus 4.8 (vision)', supportsImages: true },
  { value: 'anthropic/claude-opus-4.7', label: 'Claude Opus 4.7 (vision)', supportsImages: true },
  { value: 'anthropic/claude-opus-4.7-fast', label: 'Claude Opus 4.7 Fast (vision)', supportsImages: true },
  { value: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6 (vision)', supportsImages: true },
  { value: 'anthropic/claude-opus-4.6', label: 'Claude Opus 4.6 (vision)', supportsImages: true },
  { value: 'anthropic/claude-opus-4.5', label: 'Claude Opus 4.5 (vision)', supportsImages: true },
  { value: 'anthropic/claude-haiku-4.5', label: 'Claude Haiku 4.5 (vision)', supportsImages: true },
  { value: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5 (vision)', supportsImages: true },
  { value: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B' },
  { value: 'google/gemma-4-31b-it:free', label: 'Gemma 4 31B IT (free)' },
  { value: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', label: 'Nemotron 3 Nano Omni 30B A3B Reasoning (free)' },
  { value: "nvidia/nemotron-3-super-120b-a12b:free", label: "Nemotron 3 Super 120B A12B (free)", supportsImages: true },
  { value: 'deepseek/deepseek-v4-flash:free', label: 'DeepSeek V4 Flash (free)' },
  { value: 'google/gemini-3.5-flash', label: 'Gemini 3.5 Flash (vision)', supportsImages: true },
  { value: 'google/gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite (vision)', supportsImages: true },
  { value: 'google/gemma-4-26b-a4b-it:free', label: 'Gemma 4 26B A4B IT (free)', supportsImages: true },
  { value: 'moonshotai/kimi-k2.6:free', label: 'Kimi K2.6 (free)', supportsImages: true },
  { value: 'xiaomi/mimo-v2.5-pro', label: 'Mimo V2.5 Pro (vision)', supportsImages: true },
  { value: 'xiaomi/mimo-v2.5', label: 'Mimo V2.5 (vision)', supportsImages: true },
  { value: 'minimax/minimax-m2.7', label: 'minimax m2.7 (vision)', supportsImages: true },
  { value: 'qwen/qwen3.7-max', label: 'Qwen 3.7 Max (vision)', supportsImages: true },
] as const;

export class ChatPanel {
  private container: HTMLElement;
  private messages: ChatDisplayMessage[] = [];
  private nextMessageId = 1;
  private history: AiChatMessage[] = [];
  private processItems: ChatProcessItem[] = [];
  private pendingAttachments: AiChatAttachment[] = [];
  private loading = false;
  private mounted = false;
  private onOpenSettings: () => void;
  private onAgentActions: AgentActionsHandler;
  private getWorkspacePath: () => string | null;
  private getEditorContext: () => AiEditorContext;
  private getSettings: () => AppSettings;
  private onSettingsChange: (settings: Partial<AppSettings>) => void | Promise<void>;

  // ── Streaming state ──────────────────────────────────────────────
  /** ID of the message currently being streamed (or null). */
  private streamingMessageId: number | null = null;
  /** Id of the in-flight request, used to route deltas and to cancel. */
  private activeRequestId: string | null = null;
  /** Text received from the model but not yet painted into the DOM. */
  private streamPending = '';
  /** Text already painted into the streaming bubble. */
  private streamPainted = '';
  /** True once the server has finished sending; the painter then drains. */
  private streamEnded = false;
  /** requestAnimationFrame handle for the painter. */
  private streamRaf: number | null = null;
  /** Resolves when the painter has drained everything after the stream ends. */
  private streamDrained: (() => void) | null = null;
  /**
   * The live <span class="chat-stream-text"> element inside the active
   * streaming bubble. Mutated in-place — no full list re-render needed.
   */
  private streamingTextEl: HTMLElement | null = null;
  /** IPC subscriptions to tear down when the panel goes away. */
  private disposers: (() => void)[] = [];

  // ── History ─────────────────────────────────────────────────────
  /** Id of the conversation being edited; null until the first turn. */
  private conversationId: string | null = null;
  private historyPanelEl!: HTMLElement;
  private historyListEl!: HTMLElement;
  private historyBtn!: HTMLButtonElement;
  private newChatBtn!: HTMLButtonElement;
  private historyOpen = false;

  private messagesEl!: HTMLElement;
  private processEl!: HTMLElement;
  private inputEl!: HTMLTextAreaElement;
  private fileInputEl!: HTMLInputElement;
  private attachmentsEl!: HTMLElement;
  private sendBtn!: HTMLButtonElement;
  private clearBtn!: HTMLButtonElement;
  private modelSelect!: HTMLSelectElement | null;

  constructor(
    containerId: string,
    onOpenSettings: () => void,
    onAgentActions: AgentActionsHandler,
    getWorkspacePath: () => string | null,
    getEditorContext: () => AiEditorContext,
    getSettings: () => AppSettings,
    onSettingsChange: (settings: Partial<AppSettings>) => void | Promise<void>,
  ) {
    this.container = document.getElementById(containerId)!;
    this.onOpenSettings = onOpenSettings;
    this.onAgentActions = onAgentActions;
    this.getWorkspacePath = getWorkspacePath;
    this.getEditorContext = getEditorContext;
    this.getSettings = getSettings;
    this.onSettingsChange = onSettingsChange;
  }

  mount(): void {
    if (this.mounted) return;
    this.mounted = true;
    this.render();
  }

  show(): void {
    this.mount();
    this.renderSettingsBar();
    this.renderContextBar();
    this.scrollToBottom();
    setTimeout(() => this.inputEl?.focus(), 50);
  }

  updateSettings(): void {
    if (!this.mounted) return;
    this.renderSettingsBar();
  }

  private render(): void {
    const settings = this.getSettings();
    this.container.innerHTML = `
      <div class="chat-panel">
        <div class="chat-header">
          <div class="chat-header-left">
            <svg class="chat-header-icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <span>AI Chat</span>
          </div>
          <div class="chat-header-actions">
            <button type="button" class="chat-action-btn" id="chat-btn-history" title="Conversation history">
              <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M8 1.5a6.5 6.5 0 1 0 6.45 7.35.5.5 0 0 0-.99-.13A5.5 5.5 0 1 1 8 2.5c1.6 0 3.03.68 4.03 1.77H10.3a.5.5 0 0 0 0 1h2.9a.5.5 0 0 0 .5-.5V1.9a.5.5 0 0 0-1 0v1.31A6.48 6.48 0 0 0 8 1.5zm.5 3a.5.5 0 0 0-1 0V8c0 .17.08.33.22.42l2.4 1.6a.5.5 0 1 0 .56-.84L8.5 7.73V4.5z"/></svg>
            </button>
            <button type="button" class="chat-action-btn" id="chat-btn-new" title="New conversation">
              <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M8 2.5a.5.5 0 0 1 .5.5v4.5H13a.5.5 0 0 1 0 1H8.5V13a.5.5 0 0 1-1 0V8.5H3a.5.5 0 0 1 0-1h4.5V3a.5.5 0 0 1 .5-.5z"/></svg>
            </button>
            <button type="button" class="chat-action-btn" id="chat-btn-clear" title="Clear conversation">
              <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm3.11 9.68a.5.5 0 0 1-.7.7L8 9.06l-2.41 2.32a.5.5 0 1 1-.7-.7L7.3 8.36 4.89 6.04a.5.5 0 0 1 .7-.7L8 7.66l2.41-2.32a.5.5 0 0 1 .7.7L8.7 8.36l2.41 2.32z"/></svg>
            </button>
            <button type="button" class="chat-action-btn" id="chat-btn-settings" title="API Key settings">
              <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M9.1 1.16a.86.86 0 0 1 1.8 0l.13.7a.86.86 0 0 0 .87.67l.7-.21a.86.86 0 0 1 1.15 1.15l-.21.7a.86.86 0 0 0 .67.87l.7.13a.86.86 0 0 1 0 1.8l-.7.13a.86.86 0 0 0-.67.87l.21.7a.86.86 0 0 1-1.15 1.15l-.7-.21a.86.86 0 0 0-.87.67l-.13.7a.86.86 0 0 1-1.8 0l-.13-.7a.86.86 0 0 0-.87-.67l-.7.21a.86.86 0 0 1-1.15-1.15l.21-.7a.86.86 0 0 0 .67-.87l-.7-.13a.86.86 0 0 1 0-1.8l.7-.13a.86.86 0 0 0 .67-.87l-.21-.7a.86.86 0 0 1 1.15-1.15l.7.21a.86.86 0 0 0 .87-.67l.13-.7z"/></svg>
            </button>
          </div>
        </div>
        <div class="chat-history-panel" id="chat-history-panel" hidden>
          <div class="chat-history-head">
            <span>History</span>
            <button type="button" class="chat-history-clear" id="chat-history-clear">Clear all</button>
          </div>
          <div class="chat-history-list" id="chat-history-list"></div>
        </div>
        <div class="chat-model-bar">
          <label for="chat-model-select">Model</label>
          <select id="chat-model-select" class="chat-model-select">
            ${this.renderModelOptions(settings)}
          </select>
        </div>
        <div class="chat-context-bar hidden" id="chat-context-bar"></div>
        <div class="chat-process-section hidden" id="chat-process-section"></div>
        <div class="chat-messages" id="chat-messages-list"></div>
        <div class="chat-input-area">
          <div class="chat-attachments hidden" id="chat-attachments"></div>
          <div class="chat-input-row">
            <button type="button" class="chat-attach-btn" id="chat-btn-attach" title="Attach image or code file">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
                <path d="M10.6 3.4 5.1 8.9a2 2 0 1 0 2.8 2.8l5.2-5.2a3.5 3.5 0 1 0-5-5L2.8 6.8a5 5 0 1 0 7.1 7.1l4.6-4.6a.75.75 0 0 0-1.1-1.1l-4.6 4.6a3.5 3.5 0 0 1-5-5L9.2 2.5a2 2 0 1 1 2.8 2.8L6.8 10.6a.5.5 0 0 1-.7-.7l5.5-5.5a.75.75 0 0 0-1-1z"/>
              </svg>
            </button>
            <textarea
              id="chat-input"
              class="chat-input"
              placeholder="Ask AI anything…"
              rows="1"
              spellcheck="false"
            ></textarea>
            <button type="button" class="chat-send-btn" id="chat-btn-send" title="Send message (Enter)">
              <svg class="chat-send-icon" viewBox="0 0 16 16" width="15" height="15" fill="currentColor">
                <path d="M1.724 1.053a.5.5 0 0 1 .54-.068l12 6a.5.5 0 0 1 0 .894l-12 6A.5.5 0 0 1 1.5 13.5V9.236l7.5-1.264L1.5 6.764V2.5a.5.5 0 0 1 .224-.447z"/>
              </svg>
              <svg class="chat-stop-icon" viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true">
                <rect x="3.5" y="3.5" width="9" height="9" rx="1.5"/>
              </svg>
            </button>
          </div>
          <input type="file" id="chat-file-input" class="hidden" multiple accept="image/*,.txt,.md,.json,.js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.cs,.go,.rs,.php,.rb,.lua,.html,.css,.scss,.xml,.yaml,.yml,.toml,.ini,.sh,.bat,.cmd,.ps1,.sql" />
          <span class="chat-hint">Enter to send · Shift+Enter for new line</span>
        </div>
      </div>
    `;

    this.messagesEl = this.container.querySelector('#chat-messages-list')!;
    this.processEl = this.container.querySelector('#chat-process-section')!;
    this.inputEl = this.container.querySelector('#chat-input')! as HTMLTextAreaElement;
    this.fileInputEl = this.container.querySelector('#chat-file-input')! as HTMLInputElement;
    this.attachmentsEl = this.container.querySelector('#chat-attachments')!;
    this.sendBtn = this.container.querySelector('#chat-btn-send')! as HTMLButtonElement;
    this.clearBtn = this.container.querySelector('#chat-btn-clear')! as HTMLButtonElement;
    this.historyBtn = this.container.querySelector('#chat-btn-history')! as HTMLButtonElement;
    this.newChatBtn = this.container.querySelector('#chat-btn-new')! as HTMLButtonElement;
    this.historyPanelEl = this.container.querySelector('#chat-history-panel')! as HTMLElement;
    this.historyListEl = this.container.querySelector('#chat-history-list')! as HTMLElement;
    this.modelSelect = this.container.querySelector('#chat-model-select') as HTMLSelectElement | null;

    this.sendBtn.addEventListener('click', () => {
      // The same button stops the run while one is in flight.
      if (this.loading) this.cancelStream();
      else void this.sendMessage();
    });
    this.clearBtn.addEventListener('click', () => this.clearChat());
    this.historyBtn.addEventListener('click', () => void this.toggleHistory());
    this.newChatBtn.addEventListener('click', () => void this.startNewConversation());
    this.container
      .querySelector('#chat-history-clear')
      ?.addEventListener('click', () => void this.clearAllHistory());
    this.container.querySelector('#chat-btn-settings')?.addEventListener('click', () => this.onOpenSettings());
    this.container.querySelector('#chat-btn-attach')?.addEventListener('click', () => this.fileInputEl.click());
    this.fileInputEl.addEventListener('change', () => void this.attachLocalFiles());
    this.modelSelect?.addEventListener('change', () => {
      const model = this.modelSelect?.value.trim();
      if (this.getSettings().aiProvider === 'local') {
        void this.onSettingsChange({ localAiModel: model ?? '' });
      } else if (model) {
        const settings = this.getSettings();
        if (settings.aiProvider === 'openrouter') {
          void this.onSettingsChange({ openRouterModel: model });
        } else if (settings.aiProvider === 'claude') {
          void this.onSettingsChange({ claudeModel: model });
        } else {
          void this.onSettingsChange({ geminiModel: model });
        }
      }
      this.renderPendingAttachments();
    });

    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!this.loading) void this.sendMessage();
      }
    });

    this.inputEl.addEventListener('input', () => this.autoResizeInput());
    bindReliableTextFocus(this.inputEl);
    this.subscribeToStream();
    this.renderContextBar();
    this.renderProcessSection();
    this.renderPendingAttachments();
    this.renderMessages();

    // Fetch the latest model lists from the API on mount
    void this.refreshGeminiModels();
    void this.refreshOpenRouterModels();
    void this.refreshClaudeModels();
    if (this.getSettings().aiProvider === 'local') void this.refreshLocalModels();
  }

  private renderSettingsBar(): void {
    if (!this.mounted) return;
    const settings = this.getSettings();
    const bar = this.container.querySelector('.chat-model-bar');
    bar?.classList.toggle('hidden', settings.aiProvider !== 'gemini' && settings.aiProvider !== 'openrouter' && settings.aiProvider !== 'claude' && settings.aiProvider !== 'local');
    if (!this.modelSelect) return;

    if (settings.aiProvider === 'local' && this.localModelsCache === null) void this.refreshLocalModels();

    const current =
      settings.aiProvider === 'openrouter'
        ? settings.openRouterModel || 'openai/gpt-4o-mini'
        : settings.aiProvider === 'claude'
          ? settings.claudeModel || 'claude-sonnet-4-20250514'
          : settings.aiProvider === 'local'
            ? settings.localAiModel || ''
            : settings.geminiModel || 'gemini-2.5-flash';
    this.modelSelect.innerHTML = this.renderModelOptions(settings);
    if (this.modelSelect.querySelector(`option[value="${CSS.escape(current)}"]`)) {
      this.modelSelect.value = current;
    }
  }

  private renderContextBar(): void {
    const bar = this.container.querySelector('#chat-context-bar');
    if (!bar) return;
    const context = this.getEditorContext();
    if (!context.activeFilePath) {
      bar.classList.add('hidden');
      bar.textContent = '';
      return;
    }

    const name = context.activeFilePath.split(/[/\\]/).pop() ?? context.activeFilePath;
    const selection = context.selectedText ? ' selection attached' : ' file attached';
    bar.classList.remove('hidden');
    bar.textContent = `${name} - ${context.languageId ?? 'text'}${selection}`;
    bar.setAttribute('title', context.activeFilePath);
  }

  /** Cache of dynamically-fetched models from the API. */
  private geminiModelsCache: { value: string; label: string; supportsImages: boolean }[] | null = null;
  private openRouterModelsCache: { value: string; label: string; supportsImages: boolean }[] | null = null;
  private claudeModelsCache: { value: string; label: string; supportsImages: boolean }[] | null = null;
  private localModelsCache: { value: string; label: string; supportsImages: boolean }[] | null = null;

  private renderModelOptions(settings: AppSettings): string {
    const isClaude = settings.aiProvider === 'claude';
    const isOpenRouter = settings.aiProvider === 'openrouter';
    let options: readonly { value: string; label: string; supportsImages?: boolean }[];
    let selected: string;

    if (settings.aiProvider === 'local') {
      const models = this.localModelsCache ?? [];
      const localSelected = settings.localAiModel || '';
      const auto = `<option value="" ${localSelected === '' ? 'selected' : ''}>Auto (prefers a coder model)</option>`;
      const custom =
        localSelected && !models.some((m) => m.value === localSelected)
          ? `<option value="${this.escapeAttr(localSelected)}" selected>${this.escapeHtml(localSelected)}</option>`
          : '';
      return (
        auto +
        custom +
        models
          .map(
            (m) =>
              `<option value="${this.escapeAttr(m.value)}" ${m.value === localSelected ? 'selected' : ''}>${this.escapeHtml(m.label)}</option>`,
          )
          .join('')
      );
    }

    if (isClaude) {
      options = this.claudeModelsCache ?? [];
      selected = settings.claudeModel || 'claude-sonnet-4-20250514';
    } else if (isOpenRouter) {
      options = this.openRouterModelsCache ?? OPENROUTER_MODEL_FALLBACK;
      selected = settings.openRouterModel || 'openai/gpt-4o-mini';
    } else {
      options = this.geminiModelsCache ?? GEMINI_MODEL_FALLBACK;
      selected = settings.geminiModel || 'gemini-2.5-flash';
    }
    const hasSelected = options.some((option) => option.value === selected);
    const custom = hasSelected
      ? ''
      : `<option value="${this.escapeAttr(selected)}" selected>${this.escapeHtml(selected)}</option>`;

    return (
      custom +
      options.map(
        (option) =>
          `<option value="${this.escapeAttr(option.value)}" ${option.value === selected ? 'selected' : ''}>${this.escapeHtml(option.label)}</option>`,
      ).join('')
    );
  }

  /** Fetch Gemini models dynamically via IPC, falling back to the static list on failure. */
  async refreshGeminiModels(): Promise<void> {
    try {
      const models = await window.electronAPI.listGeminiModels();
      if (models.length > 0) {
        this.geminiModelsCache = models;
        this.renderSettingsBar();
      }
    } catch {
      // keep using the fallback list
    }
  }

  /** Fetch OpenRouter models dynamically via IPC, falling back to the static list on failure. */
  async refreshOpenRouterModels(): Promise<void> {
    try {
      const models = await window.electronAPI.listOpenRouterModels();
      if (models.length > 0) {
        this.openRouterModelsCache = models;
        this.renderSettingsBar();
      }
    } catch {
      // keep using the fallback list
    }
  }

  /** Fetch Claude models dynamically via IPC, falling back to the static list on failure. */
  async refreshClaudeModels(): Promise<void> {
    try {
      const models = await window.electronAPI.listClaudeModels();
      if (models.length > 0) {
        this.claudeModelsCache = models;
        this.renderSettingsBar();
      }
    } catch {
      // keep using the fallback list
    }
  }

  /** Ask the local AI server (Ollama / LM Studio / llama.cpp) which models it has. Stays null when unreachable. */
  async refreshLocalModels(): Promise<void> {
    try {
      const models = await window.electronAPI.listLocalModels();
      if (models.length > 0) {
        this.localModelsCache = models;
        this.renderSettingsBar();
      }
    } catch {
      // server not running — the "Auto" option still works once it is up
    }
  }

  private autoResizeInput(): void {
    const el = this.inputEl;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  /**
   * True when the preload exposes the streaming API.
   *
   * The renderer hot-reloads but the preload script only reloads on a full
   * Electron restart, so a dev session can end up with a new renderer talking
   * to an old preload. The web shim also lacks these methods. Either way the
   * panel must degrade to the non-streaming path instead of throwing.
   */
  private hasStreamingApi(): boolean {
    const api = window.electronAPI as Partial<typeof window.electronAPI> | undefined;
    return (
      typeof api?.aiChatStream === 'function' &&
      typeof api?.aiChatCancel === 'function' &&
      typeof api?.onAiChatDelta === 'function' &&
      typeof api?.onAiChatStatus === 'function'
    );
  }

  /** Routes streamed fragments and agent progress into the live bubble. */
  private subscribeToStream(): void {
    if (!this.hasStreamingApi()) {
      console.warn(
        '[ChatPanel] Streaming API unavailable — falling back to buffered replies. ' +
          'If this is a dev session, restart Electron so the preload script is rebuilt.',
      );
      return;
    }

    this.disposers.push(
      window.electronAPI.onAiChatDelta(({ requestId, text }) => {
        if (requestId !== this.activeRequestId) return;
        this.pushDelta(text);
      }),
    );
    this.disposers.push(
      window.electronAPI.onAiChatStatus((status: AiStreamStatus) => {
        if (status.requestId !== this.activeRequestId) return;
        this.applyLiveStatus(status);
      }),
    );

    // A reload would otherwise leave the listeners and an orphaned run behind.
    const onUnload = () => this.dispose();
    window.addEventListener('beforeunload', onUnload);
    this.disposers.push(() => window.removeEventListener('beforeunload', onUnload));
  }

  /** Releases IPC subscriptions and stops any in-flight run. */
  dispose(): void {
    this.cancelStream();
    for (const dispose of this.disposers) dispose();
    this.disposers = [];
  }

  /** Replaces the matching running step, or appends a new one. */
  private applyLiveStatus(status: AiStreamStatus): void {
    const existing = this.processItems.find(
      (item) => item.label === status.label && item.status === 'running',
    );
    if (existing) {
      existing.status = status.status;
    } else {
      this.processItems = this.processItems.filter((item) => item.type !== 'thinking' || item.status !== 'running');
      this.processItems.push({ label: status.label, type: status.kind, status: status.status });
    }
    this.renderProcessSection();
  }

  private async sendMessage(): Promise<void> {
    const text = this.inputEl.value.trim();
    if ((!text && this.pendingAttachments.length === 0) || this.loading) return;

    if (this.hasUnsupportedImageAttachment()) {
      this.addMessage({
        role: 'model',
        text:
          'This OpenRouter model does not support image input. Choose a vision model like GPT-4o Mini, GPT-4.1 Mini, Claude 3.5 Sonnet, or Gemini 2.0 Flash, then send again.',
        error: true,
      });
      this.renderMessages();
      this.scrollToBottom();
      return;
    }

    const attachments = this.pendingAttachments;
    this.addMessage({ role: 'user', text, attachments });
    this.history.push({ role: 'user', text, attachments });
    this.pendingAttachments = [];
    this.inputEl.value = '';
    this.inputEl.style.height = 'auto';
    this.renderPendingAttachments();
    this.loading = true;
    this.processItems = [{ label: 'Planning request', type: 'thinking', status: 'running' }];
    this.renderProcessSection();

    // The reply bubble exists before the first fragment, so the "Thinking…"
    // state and the streamed text share one element and nothing jumps.
    const reply = this.addMessage({ role: 'model', text: '' });
    const requestId = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.beginStream(reply.id, requestId);

    this.renderMessages();
    this.scrollToBottom();
    this.updateSendButton();
    this.setHeaderActive(true);

    let result: AiChatResult;
    try {
      result = this.hasStreamingApi()
        ? await window.electronAPI.aiChatStream(
            requestId,
            this.history,
            this.getWorkspacePath(),
            this.getEditorContext(),
          )
        : // Older preload / web build: one buffered reply, no deltas.
          await window.electronAPI.aiChat(
            this.history,
            this.getWorkspacePath(),
            this.getEditorContext(),
          );
    } catch (err) {
      result = { error: `Unexpected error: ${err instanceof Error ? err.message : String(err)}` };
    }

    // Let the painter catch up with whatever is still buffered.
    await this.endStream();

    this.processItems = this.processItemsFromResult(result);

    if (result.actions?.length) {
      try {
        await this.onAgentActions(result.actions);
      } catch (err) {
        this.processItems.push({
          label: `Applying changes failed: ${err instanceof Error ? err.message : String(err)}`,
          type: 'thinking',
          status: 'failed',
        });
      }
    }

    // Fold the outcome into the placeholder bubble rather than adding a new one.
    if (result.error && !result.text) {
      reply.text = result.cancelled ? 'Stopped.' : result.error;
      reply.error = true;
      reply.actions = result.actions;
    } else if (result.text) {
      reply.text = result.text;
      reply.actions = result.actions;
      this.history.push({ role: 'model', text: result.text });
    } else if (result.actions?.length) {
      const summary = this.summarizeActions(result.actions);
      reply.text = summary;
      reply.actions = result.actions;
      this.history.push({ role: 'model', text: summary });
    } else {
      reply.text = result.cancelled ? 'Stopped.' : 'No response.';
      reply.error = !result.cancelled;
    }

    this.loading = false;
    this.activeRequestId = null;
    this.setHeaderActive(false);
    this.renderProcessSection();
    this.renderMessages();
    this.scrollToBottom();
    this.updateSendButton();
    void this.persistConversation();
    setTimeout(() => this.inputEl?.focus(), 50);
  }

  /** Asks the main process to abort the in-flight run. */
  private cancelStream(): void {
    if (!this.activeRequestId || !this.hasStreamingApi()) return;
    window.electronAPI.aiChatCancel(this.activeRequestId);
  }

  /** Toggle the header icon's active (pulsing) state while the AI is working. */
  private setHeaderActive(active: boolean): void {
    const icon = this.container.querySelector('.chat-header-icon');
    icon?.classList.toggle('chat-header-icon--active', active);
  }

  private clearChat(): void {
    this.cancelStream();
    this.stopStreaming();
    this.loading = false;
    this.setHeaderActive(false);
    this.updateSendButton();
    this.messages = [];
    this.history = [];
    this.conversationId = null;
    this.processItems = [];
    this.pendingAttachments = [];
    this.renderProcessSection();
    this.renderPendingAttachments();
    this.renderMessages();
  }

  private addMessage(message: Omit<ChatDisplayMessage, 'id'>): ChatDisplayMessage {
    const displayMessage: ChatDisplayMessage = { ...message, id: this.nextMessageId++ };
    this.messages.push(displayMessage);
    return displayMessage;
  }


  // ════════════════════════════════════════════════════════════════
  //  Conversation history
  // ════════════════════════════════════════════════════════════════

  /** History needs the same preload generation as streaming does. */
  private hasHistoryApi(): boolean {
    const api = window.electronAPI as Partial<typeof window.electronAPI> | undefined;
    return typeof api?.chatList === 'function' && typeof api?.chatSave === 'function';
  }

  private async toggleHistory(): Promise<void> {
    if (!this.hasHistoryApi()) return;
    this.historyOpen = !this.historyOpen;
    this.historyPanelEl.hidden = !this.historyOpen;
    this.historyBtn.classList.toggle('is-active', this.historyOpen);
    if (this.historyOpen) await this.renderHistoryList();
  }

  private async renderHistoryList(): Promise<void> {
    const conversations = await window.electronAPI.chatList();

    if (conversations.length === 0) {
      this.historyListEl.innerHTML = '<div class="chat-history-empty">No saved conversations yet.</div>';
      return;
    }

    this.historyListEl.innerHTML = conversations
      .map(
        (c) => `
        <div class="chat-history-item${c.id === this.conversationId ? ' is-current' : ''}" data-id="${this.escapeAttr(c.id)}">
          <button type="button" class="chat-history-open" data-id="${this.escapeAttr(c.id)}">
            <span class="chat-history-title">${this.escapeRawHtml(c.title)}</span>
            <span class="chat-history-meta">${this.escapeRawHtml(this.formatTimestamp(c.updatedAt))} · ${c.messageCount} msg</span>
          </button>
          <button type="button" class="chat-history-delete" data-id="${this.escapeAttr(c.id)}" title="Delete">
            <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor"><path d="M6.5 1a.5.5 0 0 0-.5.5V2H3.5a.5.5 0 0 0 0 1H4v9.5A1.5 1.5 0 0 0 5.5 14h5a1.5 1.5 0 0 0 1.5-1.5V3h.5a.5.5 0 0 0 0-1H10v-.5a.5.5 0 0 0-.5-.5h-3zM5 3h6v9.5a.5.5 0 0 1-.5.5h-5a.5.5 0 0 1-.5-.5V3z"/></svg>
          </button>
        </div>`,
      )
      .join('');

    for (const btn of this.historyListEl.querySelectorAll('.chat-history-open')) {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.id;
        if (id) void this.loadConversation(id);
      });
    }
    for (const btn of this.historyListEl.querySelectorAll('.chat-history-delete')) {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const id = (btn as HTMLElement).dataset.id;
        if (id) void this.deleteConversation(id);
      });
    }
  }

  /** Relative for recent items, absolute once it stops being useful. */
  private formatTimestamp(value: number): string {
    if (!value) return 'unknown';
    const elapsed = Date.now() - value;
    const minutes = Math.round(elapsed / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(value).toLocaleDateString();
  }

  private async loadConversation(id: string): Promise<void> {
    if (this.loading) this.cancelStream();

    const conversation = await window.electronAPI.chatLoad(id);
    if (!conversation) {
      await this.renderHistoryList();
      return;
    }

    this.stopStreaming();
    this.loading = false;
    this.setHeaderActive(false);
    this.updateSendButton();

    this.conversationId = conversation.id;
    this.history = conversation.messages.map((m) => ({ ...m }));
    this.processItems = [];
    this.pendingAttachments = [];

    // Rebuild the display list from the stored turns.
    this.messages = conversation.messages.map((m) => ({
      id: this.nextMessageId++,
      role: m.role === 'model' ? 'model' : 'user',
      text: m.text ?? '',
      attachments: m.attachments,
    }));

    this.renderProcessSection();
    this.renderPendingAttachments();
    this.renderMessages();
    this.scrollToBottom();

    this.historyOpen = false;
    this.historyPanelEl.hidden = true;
    this.historyBtn.classList.remove('is-active');
  }

  private async deleteConversation(id: string): Promise<void> {
    await window.electronAPI.chatDelete(id);
    // Deleting the open conversation detaches it; the messages stay on screen
    // until the user starts a new one, so nothing disappears mid-read.
    if (id === this.conversationId) this.conversationId = null;
    await this.renderHistoryList();
  }

  private async clearAllHistory(): Promise<void> {
    await window.electronAPI.chatClear();
    this.conversationId = null;
    await this.renderHistoryList();
  }

  /** Saves the current turns, creating the conversation on first use. */
  private async persistConversation(): Promise<void> {
    if (!this.hasHistoryApi() || this.history.length === 0) return;

    if (!this.conversationId) {
      this.conversationId = `c${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    const saved = await window.electronAPI.chatSave({
      id: this.conversationId,
      title: '',
      createdAt: 0,
      updatedAt: 0,
      messages: this.history,
    });

    // A failed save leaves the id in place so the next turn retries.
    if (saved && this.historyOpen) await this.renderHistoryList();
  }

  private async startNewConversation(): Promise<void> {
    await this.persistConversation();
    this.conversationId = null;
    this.clearChat();
    if (this.historyOpen) await this.renderHistoryList();
  }

  // ════════════════════════════════════════════════════════════════
  //  Streaming — driven by real fragments from the model
  // ════════════════════════════════════════════════════════════════

  /** Arms the streaming state for a new reply bubble. */
  private beginStream(messageId: number, requestId: string): void {
    this.stopPainter();
    this.streamingMessageId = messageId;
    this.activeRequestId = requestId;
    this.streamPending = '';
    this.streamPainted = '';
    this.streamEnded = false;
    this.streamingTextEl = null;
  }

  /**
   * Queues a fragment that just arrived from the model.
   *
   * Fragments are buffered rather than painted straight away so a burst of
   * chunks in one tick doesn't cause a burst of markdown re-parses; the
   * painter below drains the buffer on the next animation frame.
   */
  private pushDelta(text: string): void {
    if (this.streamingMessageId === null || !text) return;
    this.streamPending += text;
    this.schedulePaint();
  }

  private schedulePaint(): void {
    if (this.streamRaf !== null) return;
    this.streamRaf = window.requestAnimationFrame(() => {
      this.streamRaf = null;
      this.paintFrame();
    });
  }

  /**
   * Moves the current arrival batch into the DOM once per frame.
   *
   * The server already determines the cadence of streamed text. Replaying it
   * in tiny character slices makes responses look delayed and needlessly
   * re-renders markdown many times. A frame-sized batch gives smooth updates
   * while retaining the live caret during the active response.
   */
  private paintFrame(): void {
    if (this.streamingMessageId === null) return;

    const message = this.messages.find((item) => item.id === this.streamingMessageId);
    if (!message) {
      this.stopPainter();
      return;
    }

    if (this.streamPending.length > 0) {
      const batch = this.streamPending;
      this.streamPending = '';
      this.streamPainted += batch;
      message.text = this.streamPainted;

      // Whether to follow the text has to be decided *before* the DOM grows.
      const follow = this.isScrolledToBottom();

      this.ensureStreamElement();
      if (this.streamingTextEl) {
        this.streamingTextEl.innerHTML = this.renderMarkdown(this.streamPainted);
      } else {
        this.renderMessages();
      }

      // Only auto-scroll if the user was already at the bottom; otherwise
      // reading back through the reply would be yanked down every frame.
      if (follow && this.messagesEl) {
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
      }
    }

    if (this.streamPending.length > 0) {
      this.schedulePaint();
      return;
    }

    if (this.streamEnded) {
      const done = this.streamDrained;
      this.streamDrained = null;
      done?.();
    }
  }

  /**
   * Finds the live text span and clears the "Thinking…" placeholder the first
   * time content is painted.
   */
  private ensureStreamElement(): void {
    if (this.streamingTextEl?.isConnected) return;
    const bubbleEl = this.messagesEl?.querySelector(
      `[data-msg-id="${this.streamingMessageId}"]`,
    ) as HTMLElement | null;
    if (!bubbleEl) {
      this.streamingTextEl = null;
      return;
    }
    bubbleEl.querySelector('.chat-thinking-wrap')?.remove();
    this.streamingTextEl = bubbleEl.querySelector('.chat-stream-text') as HTMLElement | null;
  }

  /** Waits for the painter to flush the remaining buffer, then disarms. */
  private endStream(): Promise<void> {
    if (this.streamingMessageId === null) return Promise.resolve();
    this.streamEnded = true;

    const drained = this.streamPending.length === 0
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          this.streamDrained = resolve;
          this.schedulePaint();
          // Never hang the UI on a dropped frame.
          window.setTimeout(() => {
            if (this.streamDrained === resolve) {
              this.streamDrained = null;
              resolve();
            }
          }, 1500);
        });

    return drained.then(() => {
      this.stopPainter();
      this.streamingMessageId = null;
      this.streamingTextEl = null;
      this.streamPending = '';
      this.streamPainted = '';
      this.streamEnded = false;
      // Applying staged edits can open a review dialog next. Re-render now so
      // the streaming class and its caret disappear before that dialog waits.
      this.renderMessages();
    });
  }

  private stopPainter(): void {
    if (this.streamRaf !== null) {
      window.cancelAnimationFrame(this.streamRaf);
      this.streamRaf = null;
    }
    this.streamDrained = null;
  }

  /** Hard reset used by "clear conversation". */
  private stopStreaming(): void {
    this.stopPainter();
    this.streamingMessageId = null;
    this.activeRequestId = null;
    this.streamingTextEl = null;
    this.streamPending = '';
    this.streamPainted = '';
    this.streamEnded = false;
  }

  private async attachLocalFiles(): Promise<void> {
    const files = Array.from(this.fileInputEl.files ?? []);
    this.fileInputEl.value = '';
    if (files.length === 0) return;

    const loaded = await Promise.all(files.map((file) => this.readAttachment(file)));
    this.pendingAttachments.push(...loaded.filter((item): item is AiChatAttachment => item !== null));
    this.renderPendingAttachments();
  }

  private async readAttachment(file: File): Promise<AiChatAttachment | null> {
    const textLimit = 60000;
    const imageLimitBytes = 8 * 1024 * 1024;
    const mimeType = file.type || guessMimeType(file.name);

    try {
      if (mimeType.startsWith('image/')) {
        if (file.size > imageLimitBytes) {
          return {
            name: file.name,
            kind: 'text',
            mimeType: 'text/plain',
            content: `Image "${file.name}" was skipped because it is larger than 8 MB.`,
          };
        }
        return {
          name: file.name,
          kind: 'image',
          mimeType,
          dataUrl: await readFileAsDataUrl(file),
        };
      }

      const content = await file.text();
      return {
        name: file.name,
        kind: 'text',
        mimeType,
        content: content.slice(0, textLimit),
        truncated: content.length > textLimit,
      };
    } catch {
      return null;
    }
  }

  private renderPendingAttachments(): void {
    if (!this.attachmentsEl) return;
    this.attachmentsEl.classList.toggle('hidden', this.pendingAttachments.length === 0);
    const warning = this.hasUnsupportedImageAttachment()
      ? `<div class="chat-attachment-warning">Current OpenRouter model cannot read images. Select a vision model before sending.</div>`
      : '';

    this.attachmentsEl.innerHTML =
      warning +
      this.pendingAttachments
        .map((attachment, index) => this.renderPendingAttachment(attachment, index))
        .join('');

    this.attachmentsEl.querySelectorAll('.chat-attachment-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const index = Number((chip as HTMLElement).dataset.attachmentIndex);
        if (!Number.isNaN(index)) {
          this.pendingAttachments.splice(index, 1);
          this.renderPendingAttachments();
        }
      });
    });
  }

  private hasUnsupportedImageAttachment(): boolean {
    if (this.getSettings().aiProvider !== 'openrouter') return false;
    if (!this.pendingAttachments.some((attachment) => attachment.kind === 'image')) return false;
    return !openRouterModelSupportsImages(this.getSettings().openRouterModel);
  }

  private renderPendingAttachment(attachment: AiChatAttachment, index: number): string {
    if (attachment.kind === 'image' && attachment.dataUrl) {
      return `
        <button type="button" class="chat-attachment-chip chat-attachment-image-chip" data-attachment-index="${index}" title="${this.escapeAttr(attachment.name)}">
          <img src="${this.escapeAttr(attachment.dataUrl)}" alt="${this.escapeAttr(attachment.name)}" loading="lazy" />
          <span>
            <strong>${this.escapeHtml(attachment.name)}</strong>
            <small>${this.escapeHtml(attachment.mimeType)}</small>
          </span>
          <b aria-hidden="true">×</b>
        </button>
      `;
    }

    return `
      <button type="button" class="chat-attachment-chip" data-attachment-index="${index}" title="${this.escapeAttr(attachment.name)}">
        <span>File</span>
        <strong>${this.escapeHtml(attachment.name)}</strong>
        <small>${attachment.truncated ? 'truncated' : this.escapeHtml(attachment.mimeType)}</small>
        <b aria-hidden="true">×</b>
      </button>
    `;
  }

  private updateSendButton(): void {
    // While a run is in flight the button turns into Stop, so it must stay
    // enabled — disabling it would leave no way to abort the request.
    this.sendBtn.disabled = false;
    this.sendBtn.classList.toggle('is-stop', this.loading);
    this.sendBtn.title = this.loading ? 'Stop generating' : 'Send message (Enter)';
    this.sendBtn.setAttribute('aria-label', this.loading ? 'Stop generating' : 'Send message');
  }

  private processItemsFromResult(result: AiChatResult): ChatProcessItem[] {
    if (result.actions?.length) {
      return result.actions.map((action) => ({
        label: action.label,
        type: action.type,
        status: result.error && action === result.actions?.[result.actions.length - 1] ? 'failed' : 'done',
      }));
    }

    if (result.error) {
      return [{ label: result.error, type: 'thinking', status: 'failed' }];
    }

    return [{ label: 'Completed response', type: 'thinking', status: 'done' }];
  }

  private renderProcessSection(): void {
    if (!this.processEl) return;
    this.processEl.classList.remove('hidden');
    const items = this.loading ? this.processItems : this.processItems.slice(-8);
    this.processEl.innerHTML = `
      <div class="chat-process-header">
        <span>Process</span>
        <small>${this.loading ? 'Running' : this.processItems.length > 0 ? 'Latest run' : 'Always visible'}</small>
      </div>
      <div class="chat-process-list">
        ${items.length > 0
        ? items.map((item) => this.renderProcessItem(item)).join('')
        : this.renderProcessItem({ label: 'Waiting for the next request', type: 'thinking', status: 'done' })
      }
      </div>
    `;
  }

  private renderProcessItem(item: ChatProcessItem): string {
    return `
      <div class="chat-process-item chat-process-${item.status}">
        <span class="chat-process-dot"></span>
        <span class="chat-process-kind">${this.processTypeLabel(item.type)}</span>
        <span class="chat-process-label">${this.escapeHtml(item.label)}</span>
      </div>
    `;
  }

  private processTypeLabel(type: ChatProcessItem['type']): string {
    if (type === 'write_file') return 'Write';
    if (type === 'read_file') return 'Read';
    if (type === 'delete_file') return 'Delete';
    if (type === 'list_directory') return 'List';
    if (type === 'search_files') return 'Search';
    if (type === 'run_command') return 'Run';
    return 'Think';
  }

  private summarizeActions(actions: AiAgentAction[]): string {
    const writes = actions.filter((action) => action.type === 'write_file').length;
    const reads = actions.filter((action) => action.type === 'read_file').length;
    const deletes = actions.filter((action) => action.type === 'delete_file').length;
    const lists = actions.filter((action) => action.type === 'list_directory').length;
    const searches = actions.filter((action) => action.type === 'search_files').length;
    const runs = actions.filter((action) => action.type === 'run_command').length;
    const parts = [
      writes ? `${writes} file ${writes === 1 ? 'change' : 'changes'}` : '',
      deletes ? `${deletes} file ${deletes === 1 ? 'deletion' : 'deletions'}` : '',
      reads ? `${reads} file ${reads === 1 ? 'read' : 'reads'}` : '',
      lists ? `${lists} directory ${lists === 1 ? 'listing' : 'listings'}` : '',
      searches ? `${searches} ${searches === 1 ? 'search' : 'searches'}` : '',
      runs ? `${runs} command ${runs === 1 ? 'run' : 'runs'}` : '',
    ].filter(Boolean);
    return `Done. Process summary: ${parts.join(', ') || 'completed the requested workflow'}.`;
  }

  // ════════════════════════════════════════════════════════════════
  //  renderMessages — builds the full message list HTML
  // ════════════════════════════════════════════════════════════════

  private renderMessages(): void {
    if (!this.messagesEl) return;

    // ── Empty state ──────────────────────────────────────────────
    if (this.messages.length === 0 && !this.loading) {
      this.messagesEl.innerHTML = `
        <div class="chat-empty">
          <div class="chat-empty-icon">
            <svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <h3>Fully automated agent</h3>
          <p>Ask the AI agent to read, write, and run commands in your workspace. Files open in the editor automatically.</p>
          <div class="chat-suggestions">
            <button type="button" class="chat-suggestion" data-prompt="Please write 'hello world' in hello.txt">✍️ Write hello.txt</button>
            <button type="button" class="chat-suggestion" data-prompt="Lint the active file. Find syntax errors, likely bugs, type issues, security risks, and style problems. Return diagnostics with line numbers and suggested fixes. Do not edit files unless I ask.">✓ Lint active file</button>
            <button type="button" class="chat-suggestion" data-prompt="Explain how async/await works in JavaScript">💡 Explain async/await</button>
            <button type="button" class="chat-suggestion" data-prompt="List the files in this workspace">📁 List workspace files</button>
            <button type="button" class="chat-suggestion" data-prompt="Search the workspace for TODO comments">🔎 Find TODOs</button>
          </div>
        </div>
      `;
      this.messagesEl.querySelectorAll('.chat-suggestion').forEach((btn) => {
        btn.addEventListener('click', () => {
          const prompt = (btn as HTMLElement).dataset.prompt ?? '';
          this.inputEl.value = prompt;
          void this.sendMessage();
        });
      });
      return;
    }

    // ── Message list ─────────────────────────────────────────────
    let html = '';
    for (const msg of this.messages) {
      if (msg.role === 'user') {
        html += `
          <div class="chat-bubble chat-bubble-user">
            <div class="chat-bubble-content">${this.escapeHtml(msg.text || '(attachment)')}${this.renderAttachmentSummary(msg.attachments)}</div>
          </div>
        `;
      } else {
        const errorCls = msg.error ? ' chat-bubble-error' : '';
        const streamingCls = msg.id === this.streamingMessageId ? ' chat-bubble-streaming' : '';
        const isStreaming = msg.id === this.streamingMessageId;

        // Streaming bubble uses a special inner structure:
        //   - While streaming: shows "Thinking…" dots + .chat-stream-text with caret
        //   - After streaming: .chat-stream-text holds the final rendered markdown
        let contentHtml: string;
        if (isStreaming && msg.text === '') {
          // Still in "Thinking…" phase — no tokens yet
          contentHtml = `
            <div class="chat-thinking-wrap">
              <span class="chat-thinking-label">AI is responding</span>
              <div class="chat-thinking-dots">
                <span></span><span></span><span></span>
              </div>
            </div>
            <span class="chat-stream-text"></span>
          `;
        } else if (isStreaming) {
          // Tokens arriving — render streamed markdown with caret span
          contentHtml = `<span class="chat-stream-text">${this.renderMarkdown(msg.text)}</span>`;
        } else {
          // Fully rendered (no streaming)
          contentHtml = this.renderMarkdown(msg.text);
        }

        html += `
          <div class="chat-bubble chat-bubble-ai${errorCls}${streamingCls}" data-msg-id="${msg.id}">
            <div class="chat-bubble-avatar${isStreaming ? ' chat-bubble-avatar-active' : ''}">✦</div>
            <div class="chat-bubble-content">${contentHtml}</div>
          </div>
        `;
        // Action logs rendered after the bubble (non-streaming)
        if (!isStreaming && msg.actions?.length) {
          for (const action of msg.actions) {
            html += this.renderActionLog(action);
          }
        }
      }
    }

    // ── Global loading bubble (before first AI message is created) ─
    if (this.loading && !this.messages.some((m) => m.id === this.streamingMessageId)) {
      html += `
        <div class="chat-bubble chat-bubble-ai chat-loading-bubble">
          <div class="chat-bubble-avatar chat-bubble-avatar-active">✦</div>
          <div class="chat-bubble-content">
            <div class="chat-agent-workflow">
              <div class="chat-loading-dots">
                <span></span><span></span><span></span>
              </div>
              <div class="chat-agent-steps">
                <span>Plan</span>
                <span>Edit</span>
                <span>Run</span>
                <span>Fix</span>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    this.messagesEl.innerHTML = html;
    this.bindCodeCopyButtons();

    // After rendering, point streamingTextEl at the new DOM node
    if (this.streamingMessageId !== null) {
      const bubbleEl = this.messagesEl.querySelector(
        `[data-msg-id="${this.streamingMessageId}"]`,
      ) as HTMLElement | null;
      if (bubbleEl) {
        this.streamingTextEl = bubbleEl.querySelector('.chat-stream-text') as HTMLElement | null;
      }
    }
  }

  private bindCodeCopyButtons(): void {
    this.messagesEl.querySelectorAll('.chat-code-block').forEach((block) => {
      const copyBtn = block.querySelector('.chat-code-copy');
      const codeEl = block.querySelector('code');
      copyBtn?.addEventListener('click', () => {
        if (codeEl) {
          navigator.clipboard.writeText(codeEl.textContent ?? '');
          (copyBtn as HTMLElement).textContent = '✓ Copied';
          setTimeout(() => {
            (copyBtn as HTMLElement).textContent = 'Copy';
          }, 2000);
        }
      });
    });
  }

  /** Compact activity row for completed tool calls, modeled after IDE agent timelines. */
  private renderActionLog(action: AiAgentAction): string {
    if ((action.type === 'write_file' || action.type === 'delete_file') && action.path) {
      const fileName = action.path.split(/[\\/]/).pop() || action.path;
      const extension = fileName.includes('.') ? fileName.split('.').pop()!.toUpperCase() : 'FILE';
      const delta = this.lineDelta(action.originalContent ?? '', action.type === 'delete_file' ? '' : action.content ?? '');
      const verb = action.type === 'delete_file' ? 'Deleted' : 'Edited';
      return `
        <div class="chat-action-log chat-action-log-file" title="${this.escapeAttr(action.path)}">
          <span class="chat-action-verb">${verb}</span>
          <span class="chat-action-language">${this.escapeHtml(extension)}</span>
          <span class="chat-action-file">${this.escapeHtml(fileName)}</span>
          ${delta.added ? `<span class="chat-action-added">+${delta.added}</span>` : ''}
          ${delta.removed ? `<span class="chat-action-removed">-${delta.removed}</span>` : ''}
        </div>
      `;
    }
    return `<div class="chat-action-log">${this.renderMarkdown(action.label)}</div>`;
  }

  /**
   * Fast, useful change counts for the activity timeline. Unchanged prefixes
   * and suffixes are excluded, so a one-line edit reads +1 -1 instead of
   * counting the whole file.
   */
  private lineDelta(original: string, modified: string): { added: number; removed: number } {
    if (original === modified) return { added: 0, removed: 0 };
    const before = original === '' ? [] : original.split(/\r?\n/);
    const after = modified === '' ? [] : modified.split(/\r?\n/);
    let prefix = 0;
    while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;

    let suffix = 0;
    while (
      suffix < before.length - prefix &&
      suffix < after.length - prefix &&
      before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
    ) suffix++;

    return {
      added: after.length - prefix - suffix,
      removed: before.length - prefix - suffix,
    };
  }

  private renderAttachmentSummary(attachments?: AiChatAttachment[]): string {
    if (!attachments?.length) return '';
    const images = attachments
      .filter((attachment) => attachment.kind === 'image' && attachment.dataUrl)
      .map(
        (attachment) => `
          <figure class="chat-sent-image">
            <img src="${this.escapeAttr(attachment.dataUrl ?? '')}" alt="${this.escapeAttr(attachment.name)}" loading="lazy" />
            <figcaption>${this.escapeHtml(attachment.name)}</figcaption>
          </figure>
        `,
      )
      .join('');
    const files = attachments
      .filter((attachment) => attachment.kind !== 'image' || !attachment.dataUrl)
      .map((attachment) => `<span>File: ${this.escapeHtml(attachment.name)}</span>`)
      .join('');

    return `
      <div class="chat-attachment-summary">
        ${images ? `<div class="chat-sent-images">${images}</div>` : ''}
        ${files}
      </div>
    `;
  }

  /** True when the message list is parked at (or very near) the bottom. */
  private isScrolledToBottom(): boolean {
    const el = this.messagesEl;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  }

  private scrollToBottom(): void {
    requestAnimationFrame(() => {
      if (this.messagesEl) {
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
      }
    });
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/\n/g, '<br>');
  }

  private escapeAttr(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private escapeRawHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private renderMarkdown(text: string): string {
    // ── Step 1: extract fenced code blocks (preserved verbatim) ──
    const codeBlocks: string[] = [];
    let result = text.replace(
      /```(\w*)\n([\s\S]*?)```/g,
      (_match, lang: string, code: string) => {
        const token = `@@CHAT_CODE_BLOCK_${codeBlocks.length}@@`;
        const langLabel = this.escapeRawHtml(lang || 'code');
        const escapedCode = this.escapeRawHtml(code);
        codeBlocks.push(
          `<div class="chat-code-block"><div class="chat-code-header"><span class="chat-code-lang">${langLabel}</span><button type="button" class="chat-code-copy">Copy</button></div><pre><code>${escapedCode}</code></pre></div>`,
        );
        return token;
      },
    );

    // ── Step 2: process line-by-line for block elements ──────────
    const lines = result.split('\n');
    const output: string[] = [];
    let inList = false;
    let listTag = '';

    const flushList = () => {
      if (inList) {
        output.push(`</${listTag}>`);
        inList = false;
        listTag = '';
      }
    };

    for (const rawLine of lines) {
      // Horizontal rule
      if (/^---+$/.test(rawLine.trim())) {
        flushList();
        output.push('<hr style="border:none;border-top:1px solid var(--border-subtle);margin:8px 0;">');
        continue;
      }

      // ATX headings ### ## #
      const headingMatch = rawLine.match(/^(#{1,3})\s+(.*)/);
      if (headingMatch) {
        flushList();
        const level = headingMatch[1].length;
        const content = this.escapeRawHtml(headingMatch[2]);
        output.push(`<h${level} class="chat-md-h${level}">${content}</h${level}>`);
        continue;
      }

      // Unordered list item (- or *)
      const ulMatch = rawLine.match(/^(\s*)[*-]\s+(.*)/);
      if (ulMatch) {
        if (!inList || listTag !== 'ul') {
          flushList();
          output.push('<ul class="chat-md-list">');
          inList = true;
          listTag = 'ul';
        }
        output.push(`<li>${this.escapeRawHtml(ulMatch[2])}</li>`);
        continue;
      }

      // Ordered list item (1. 2. etc.)
      const olMatch = rawLine.match(/^(\s*)\d+\.\s+(.*)/);
      if (olMatch) {
        if (!inList || listTag !== 'ol') {
          flushList();
          output.push('<ol class="chat-md-list">');
          inList = true;
          listTag = 'ol';
        }
        output.push(`<li>${this.escapeRawHtml(olMatch[2])}</li>`);
        continue;
      }

      // Regular line.
      // This MUST be escaped: everything reaching here is untrusted model
      // output (which routinely echoes back file contents). Leaving it raw
      // let `<img src=x onerror=...>` execute inside the Electron renderer.
      // Headings and list items above are already escaped the same way.
      flushList();
      output.push(this.escapeRawHtml(rawLine));
    }

    flushList();
    result = output.join('\n');

    // ── Step 3: inline styles ─────────────────────────────────────
    // Escape HTML in non-list, non-heading portions is tricky after
    // we've already inserted HTML tags. We escape before block parsing
    // for plain lines, so just apply inline patterns now.
    result = result.replace(/~~(.+?)~~/g, '<del>$1</del>');
    result = result.replace(/`([^`\n]+)`/g, '<code class="chat-inline-code">$1</code>');
    result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    result = result.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
    // Convert remaining newlines to <br> only outside block HTML tags
    result = result.replace(/\n(?!<\/?(?:ul|ol|li|h[1-3]|hr))/g, '<br>');

    // ── Step 4: restore code blocks ───────────────────────────────
    codeBlocks.forEach((block, index) => {
      result = result.replace(`@@CHAT_CODE_BLOCK_${index}@@`, block);
    });

    return result;
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function guessMimeType(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'json') return 'application/json';
  if (ext === 'html') return 'text/html';
  if (ext === 'css') return 'text/css';
  if (ext === 'md') return 'text/markdown';
  return 'text/plain';
}

function openRouterModelSupportsImages(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return OPENROUTER_MODEL_FALLBACK.some(
    (option) => option.value === normalized && 'supportsImages' in option && option.supportsImages === true,
  );
}

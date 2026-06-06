/**
 * ChatPanel — fully automated Gemini agent UI in the sidebar.
 */
import type {
  AiAgentAction,
  AiChatAttachment,
  AiChatMessage,
  AiChatResult,
  AiEditorContext,
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

const GEMINI_MODEL_OPTIONS = [
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

const OPENROUTER_MODEL_OPTIONS = [
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
] as const;

export class ChatPanel {
  private container: HTMLElement;
  private messages: ChatDisplayMessage[] = [];
  private nextMessageId = 1;
  private typingMessageId: number | null = null;
  private typingTimer: number | null = null;
  private typingFullText = '';
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
            <svg class="chat-header-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2a4 4 0 0 1 4 4v1a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"/>
              <path d="M6 10a6 6 0 0 0 12 0"/>
              <circle cx="12" cy="19" r="3"/>
              <path d="M12 16v-3"/>
            </svg>
            <span>AI Chat</span>
          </div>
          <div class="chat-header-actions">
            <button type="button" class="chat-action-btn" id="chat-btn-clear" title="Clear conversation">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm3.11 9.68a.5.5 0 0 1-.7.7L8 9.06l-2.41 2.32a.5.5 0 1 1-.7-.7L7.3 8.36 4.89 6.04a.5.5 0 0 1 .7-.7L8 7.66l2.41-2.32a.5.5 0 0 1 .7.7L8.7 8.36l2.41 2.32z"/></svg>
            </button>
            <button type="button" class="chat-action-btn" id="chat-btn-settings" title="API Key settings">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M9.1 1.16a.86.86 0 0 1 1.8 0l.13.7a.86.86 0 0 0 .87.67l.7-.21a.86.86 0 0 1 1.15 1.15l-.21.7a.86.86 0 0 0 .67.87l.7.13a.86.86 0 0 1 0 1.8l-.7.13a.86.86 0 0 0-.67.87l.21.7a.86.86 0 0 1-1.15 1.15l-.7-.21a.86.86 0 0 0-.87.67l-.13.7a.86.86 0 0 1-1.8 0l-.13-.7a.86.86 0 0 0-.87-.67l-.7.21a.86.86 0 0 1-1.15-1.15l.21-.7a.86.86 0 0 0 .67-.87l-.7-.13a.86.86 0 0 1 0-1.8l.7-.13a.86.86 0 0 0 .67-.87l-.21-.7a.86.86 0 0 1 1.15-1.15l.7.21a.86.86 0 0 0 .87-.67l.13-.7z"/></svg>
            </button>
          </div>
        </div>
        <div class="chat-model-bar">
          <label for="chat-model-select">Model</label>
          <select id="chat-model-select" class="chat-model-select">
            ${this.renderModelOptions(settings)}
          </select>
        </div>
        <div class="chat-context-bar" id="chat-context-bar"></div>
        <div class="chat-process-section hidden" id="chat-process-section"></div>
        <div class="chat-messages" id="chat-messages-list"></div>
        <div class="chat-input-area">
          <div class="chat-attachments hidden" id="chat-attachments"></div>
          <div class="chat-input-row">
            <button type="button" class="chat-attach-btn" id="chat-btn-attach" title="Attach image or code file">
              <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor">
                <path d="M10.6 3.4 5.1 8.9a2 2 0 1 0 2.8 2.8l5.2-5.2a3.5 3.5 0 1 0-5-5L2.8 6.8a5 5 0 1 0 7.1 7.1l4.6-4.6a.75.75 0 0 0-1.1-1.1l-4.6 4.6a3.5 3.5 0 0 1-5-5L9.2 2.5a2 2 0 1 1 2.8 2.8L6.8 10.6a.5.5 0 0 1-.7-.7l5.5-5.5a.75.75 0 0 0-1-1z"/>
              </svg>
            </button>
            <textarea
              id="chat-input"
              class="chat-input"
              placeholder="Ask AI anything..."
              rows="1"
              spellcheck="false"
            ></textarea>
            <button type="button" class="chat-send-btn" id="chat-btn-send" title="Send message (Enter)">
              <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
                <path d="M1.724 1.053a.5.5 0 0 1 .54-.068l12 6a.5.5 0 0 1 0 .894l-12 6A.5.5 0 0 1 1.5 13.5V9.236l7.5-1.264L1.5 6.764V2.5a.5.5 0 0 1 .224-.447z"/>
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
    this.modelSelect = this.container.querySelector('#chat-model-select') as HTMLSelectElement | null;

    this.sendBtn.addEventListener('click', () => void this.sendMessage());
    this.clearBtn.addEventListener('click', () => this.clearChat());
    this.container.querySelector('#chat-btn-settings')?.addEventListener('click', () => this.onOpenSettings());
    this.container.querySelector('#chat-btn-attach')?.addEventListener('click', () => this.fileInputEl.click());
    this.fileInputEl.addEventListener('change', () => void this.attachLocalFiles());
    this.modelSelect?.addEventListener('change', () => {
      const model = this.modelSelect?.value.trim();
      if (model) {
        const settings = this.getSettings();
        if (settings.aiProvider === 'openrouter') {
          void this.onSettingsChange({ openRouterModel: model });
        } else {
          void this.onSettingsChange({ geminiModel: model });
        }
      }
      this.renderPendingAttachments();
    });

    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void this.sendMessage();
      }
    });

    this.inputEl.addEventListener('input', () => this.autoResizeInput());
    bindReliableTextFocus(this.inputEl);
    this.renderContextBar();
    this.renderProcessSection();
    this.renderPendingAttachments();
    this.renderMessages();
  }

  private renderSettingsBar(): void {
    if (!this.mounted) return;
    const settings = this.getSettings();
    const bar = this.container.querySelector('.chat-model-bar');
    bar?.classList.toggle('hidden', settings.aiProvider !== 'gemini' && settings.aiProvider !== 'openrouter');
    if (!this.modelSelect) return;

    const current =
      settings.aiProvider === 'openrouter'
        ? settings.openRouterModel || 'openai/gpt-4o-mini'
        : settings.geminiModel || 'gemini-2.5-flash';
    this.modelSelect.innerHTML = this.renderModelOptions(settings);
    this.modelSelect.value = current;
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

  private renderModelOptions(settings: AppSettings): string {
    const isOpenRouter = settings.aiProvider === 'openrouter';
    const options = isOpenRouter ? OPENROUTER_MODEL_OPTIONS : GEMINI_MODEL_OPTIONS;
    const selected = isOpenRouter
      ? settings.openRouterModel || 'openai/gpt-4o-mini'
      : settings.geminiModel || 'gemini-2.5-flash';
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

  private autoResizeInput(): void {
    const el = this.inputEl;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
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
    this.processItems = [
      { label: 'Planning request', type: 'thinking', status: 'running' },
      { label: 'Inspecting editor context', type: 'thinking', status: 'running' },
      { label: 'Preparing edits and checks', type: 'thinking', status: 'running' },
    ];
    this.renderProcessSection();
    this.renderMessages();
    this.scrollToBottom();
    this.updateSendButton();

    try {
      const result: AiChatResult = await window.electronAPI.aiChat(
        this.history,
        this.getWorkspacePath(),
        this.getEditorContext(),
      );

      this.processItems = this.processItemsFromResult(result);
      this.renderProcessSection();

      if (result.actions?.length) {
        await this.onAgentActions(result.actions);
      }

      if (result.error) {
        this.addMessage({ role: 'model', text: result.error, error: true, actions: result.actions }, true);
      } else if (result.text) {
        this.addMessage({ role: 'model', text: result.text, actions: result.actions }, true);
        this.history.push({ role: 'model', text: result.text });
      } else if (result.actions?.length) {
        const summary = this.summarizeActions(result.actions);
        this.addMessage({ role: 'model', text: summary, actions: result.actions }, true);
        this.history.push({ role: 'model', text: summary });
      }
    } catch (err) {
      this.processItems = [
        {
          label: `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
          type: 'thinking',
          status: 'failed',
        },
      ];
      this.renderProcessSection();
      this.addMessage({
        role: 'model',
        text: `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
        error: true,
      }, true);
    }

    this.loading = false;
    this.renderProcessSection();
    this.renderMessages();
    this.scrollToBottom();
    this.updateSendButton();
    setTimeout(() => this.inputEl?.focus(), 50);
  }

  private clearChat(): void {
    this.stopTypingAnimation();
    this.messages = [];
    this.history = [];
    this.processItems = [];
    this.pendingAttachments = [];
    this.renderProcessSection();
    this.renderPendingAttachments();
    this.renderMessages();
  }

  private addMessage(
    message: Omit<ChatDisplayMessage, 'id'>,
    animate = false,
  ): ChatDisplayMessage {
    const displayMessage: ChatDisplayMessage = {
      ...message,
      id: this.nextMessageId++,
      text: animate && message.role === 'model' ? '' : message.text,
    };
    this.messages.push(displayMessage);
    if (animate && message.role === 'model') {
      this.startTypingAnimation(displayMessage, message.text);
    }
    return displayMessage;
  }

  private startTypingAnimation(message: ChatDisplayMessage, fullText: string): void {
    this.stopTypingAnimation(true);
    this.typingMessageId = message.id;
    this.typingFullText = fullText;

    if (!fullText) {
      this.typingMessageId = null;
      return;
    }

    const charsPerTick = fullText.length > 4000 ? 28 : fullText.length > 1600 ? 14 : 5;
    let index = 0;
    const tick = () => {
      const current = this.messages.find((item) => item.id === message.id);
      if (!current) {
        this.stopTypingAnimation();
        return;
      }

      index = Math.min(fullText.length, index + charsPerTick);
      current.text = fullText.slice(0, index);
      this.renderMessages();
      this.scrollToBottom();

      if (index >= fullText.length) {
        this.typingMessageId = null;
        this.typingTimer = null;
        this.typingFullText = '';
        this.renderMessages();
        return;
      }

      this.typingTimer = window.setTimeout(tick, 16);
    };

    tick();
  }

  private stopTypingAnimation(completeCurrent = false): void {
    if (this.typingTimer !== null) {
      window.clearTimeout(this.typingTimer);
      this.typingTimer = null;
    }
    if (completeCurrent && this.typingMessageId !== null && this.typingFullText) {
      const current = this.messages.find((item) => item.id === this.typingMessageId);
      if (current) current.text = this.typingFullText;
    }
    this.typingMessageId = null;
    this.typingFullText = '';
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
          <b aria-hidden="true">x</b>
        </button>
      `;
    }

    return `
      <button type="button" class="chat-attachment-chip" data-attachment-index="${index}" title="${this.escapeAttr(attachment.name)}">
        <span>File</span>
        <strong>${this.escapeHtml(attachment.name)}</strong>
        <small>${attachment.truncated ? 'truncated' : this.escapeHtml(attachment.mimeType)}</small>
        <b aria-hidden="true">x</b>
      </button>
    `;
  }

  private updateSendButton(): void {
    this.sendBtn.disabled = this.loading;
    this.sendBtn.classList.toggle('is-loading', this.loading);
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
        ${
          items.length > 0
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
    if (type === 'run_command') return 'Run';
    return 'Think';
  }

  private summarizeActions(actions: AiAgentAction[]): string {
    const writes = actions.filter((action) => action.type === 'write_file').length;
    const reads = actions.filter((action) => action.type === 'read_file').length;
    const runs = actions.filter((action) => action.type === 'run_command').length;
    const parts = [
      writes ? `${writes} file ${writes === 1 ? 'change' : 'changes'}` : '',
      reads ? `${reads} file ${reads === 1 ? 'read' : 'reads'}` : '',
      runs ? `${runs} command ${runs === 1 ? 'run' : 'runs'}` : '',
    ].filter(Boolean);
    return `Done. Process summary: ${parts.join(', ') || 'completed the requested workflow'}.`;
  }

  private renderMessages(): void {
    if (!this.messagesEl) return;

    if (this.messages.length === 0 && !this.loading) {
      this.messagesEl.innerHTML = `
        <div class="chat-empty">
          <div class="chat-empty-icon">
            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
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

    let html = '';
    for (const msg of this.messages) {
      if (msg.role === 'user') {
        html += `<div class="chat-bubble chat-bubble-user"><div class="chat-bubble-content">${this.escapeHtml(msg.text || '(attachment)')}${this.renderAttachmentSummary(msg.attachments)}</div></div>`;
      } else {
        const cls = msg.error ? ' chat-bubble-error' : '';
        const typingCls = msg.id === this.typingMessageId ? ' chat-bubble-typing' : '';
        html += `<div class="chat-bubble chat-bubble-ai${cls}${typingCls}"><div class="chat-bubble-avatar">✦</div><div class="chat-bubble-content">${this.renderMarkdown(msg.text)}</div></div>`;
        if (msg.actions?.length) {
          for (const action of msg.actions) {
            html += `<div class="chat-action-log">${this.renderMarkdown(action.label)}</div>`;
          }
        }
      }
    }

    if (this.loading) {
      html += `
        <div class="chat-bubble chat-bubble-ai">
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
    const codeBlocks: string[] = [];
    let result = text.replace(
      /```(\w*)\n([\s\S]*?)```/g,
      (_match, lang: string, code: string) => {
        const token = `@@CHAT_CODE_BLOCK_${codeBlocks.length}@@`;
        const langLabel = this.escapeRawHtml(lang || 'code');
        const escapedCode = this.escapeRawHtml(code);
        codeBlocks.push(`<div class="chat-code-block"><div class="chat-code-header"><span class="chat-code-lang">${langLabel}</span><button type="button" class="chat-code-copy">Copy</button></div><pre><code>${escapedCode}</code></pre></div>`);
        return token;
      },
    );

    result = this.escapeRawHtml(result);
    result = result.replace(/`([^`]+)`/g, '<code class="chat-inline-code">$1</code>');
    result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    result = result.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
    result = result.replace(/\n/g, '<br>');
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
  return OPENROUTER_MODEL_OPTIONS.some(
    (option) => option.value === normalized && 'supportsImages' in option && option.supportsImages === true,
  );
}

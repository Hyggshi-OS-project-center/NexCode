/**
 * NexCode AI Agent — Full-featured chat interface
 *
 * Features:
 * - Chat with AI agent (Gemini / OpenRouter)
 * - Session management (create, switch, delete)
 * - Settings panel for provider, API keys, models
 * - Action log tracking agent file/command operations
 * - File & image attachment support
 * - Rich markdown rendering
 * - Keyboard shortcuts (Ctrl+Enter, Shift+Enter, Ctrl+N, Ctrl+,)
 * - Auto-resize textarea
 * - Welcome screen with suggestion chips
 * - Loading / thinking indicator
 */

// =============================================================================
// State
// =============================================================================
const state = {
    sessions: [],
    currentSessionId: null,
    sessionHistory: [],
    sessionHistoryIndex: -1,
    sessionFilterActive: false,
    sessionSearchQuery: '',
    messages: [],
    actions: [],
    attachments: [],
    isLoading: false,
    abortController: null,
    settings: {
        provider: 'gemini',
        geminiApiKey: '',
        geminiModel: 'gemini-2.5-flash',
        openRouterApiKey: '',
        openRouterModel: 'openai/gpt-4o-mini',
        maxTurns: 10,
    },
    editorContext: null,
    workspacePath: null,
    providerStatus: 'idle', // idle | loading | success | error
};

// =============================================================================
// DOM References
// =============================================================================
const $ = (id) => document.getElementById(id);

const dom = {
    messages: $('chat-messages'),
    input: $('agent-input'),
    sendBtn: $('btn-send'),
    form: $('agent-form'), // we'll handle submit on sendBtn click
    newSession: $('btn-new-session'),
    settingsBtn: $('btn-agent-settings'),
    settingsOverlay: $('settings-overlay'),
    settingsClose: $('btn-settings-close'),
    settingsSave: $('btn-settings-save'),
    settingsReset: $('btn-settings-reset'),
    providerSelect: $('setting-provider'),
    geminiKey: $('setting-gemini-key'),
    geminiModel: $('setting-gemini-model'),
    openrouterKey: $('setting-openrouter-key'),
    openrouterModel: $('setting-openrouter-model'),
    toggleGeminiVis: $('toggle-gemini-vis'),
    toggleOpenrouterVis: $('toggle-openrouter-vis'),
    groupGeminiKey: $('group-gemini-key'),
    groupGeminiModel: $('group-gemini-model'),
    groupOpenrouterKey: $('group-openrouter-key'),
    groupOpenrouterModel: $('group-openrouter-model'),
    maxTurns: $('setting-max-turns'),
    sessionList: $('session-list'),
    providerName: $('provider-name'),
    providerModel: $('provider-model'),
    providerStatus: $('provider-status'),
    actionLogPanel: $('action-log-panel'),
    actionLogList: $('action-log-list'),
    actionCount: $('action-count'),
    toggleActions: $('btn-toggle-actions'),
    loadingIndicator: $('loading-indicator'),
    cancelBtn: $('btn-cancel-request'),
    attachFile: $('btn-attach-file'),
    attachImage: $('btn-attach-image'),
    addEditorContext: $('btn-add-editor-context'),
    clearChat: $('btn-clear-chat'),
    filePicker: $('file-picker'),
    imagePicker: $('image-picker'),
    attachmentPreview: $('attachment-preview-area'),
    attachmentList: $('attachment-list'),
    messageTemplate: $('message-template'),
    actionItemTemplate: $('action-item-template'),
    sessionItemTemplate: $('session-item-template'),
    // Window controls
    minimizeBtn: $('btn-agent-minimize'),
    maximizeBtn: $('btn-agent-maximize'),
    closeBtn: $('btn-agent-close'),
    layout: $('agent-layout'),
    toggleSidebar: $('btn-toggle-sidebar'),
    sessionBack: $('btn-session-back'),
    sessionForward: $('btn-session-forward'),
    runPrompt: $('btn-run-prompt'),
    toggleTerminal: $('btn-toggle-terminal'),
    sessionFilter: $('btn-session-filter'),
    sessionSearch: $('btn-session-search'),
    sessionSearchRow: $('session-search-row'),
    sessionSearchInput: $('session-search-input'),
    moreWorkspaces: $('btn-more-workspaces'),
    customizations: $('btn-customizations'),
    workspaceContext: $('btn-workspace-context'),
    workspaceContextName: $('workspace-context-name'),
    workspaceLabel: $('workspace-label'),
    modelContext: $('btn-model-context'),
    tabChanges: $('tab-changes'),
    tabFiles: $('tab-files'),
    filesEmpty: $('files-empty'),
    actionLogBar: $('action-log-bar'),
};

function getElectronAPI() {
    return window.electronAPI || null;
}

async function syncAgentWindowControls() {
    if (!dom.maximizeBtn) return;
    const api = getElectronAPI();
    if (!api || !api.isMaximized) return;
    try {
        const isMax = await api.isMaximized();
        dom.maximizeBtn.classList.toggle('is-maximized', Boolean(isMax));
        dom.maximizeBtn.title = isMax ? 'Restore' : 'Maximize';
    } catch {
        dom.maximizeBtn.classList.remove('is-maximized');
        dom.maximizeBtn.title = 'Maximize';
    }
}

function isElement(value) {
    return value instanceof HTMLElement;
}

// =============================================================================
// Utility Functions
// =============================================================================
function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatRelativeTime(date) {
    const value = date instanceof Date ? date : new Date(date);
    const diffMs = Date.now() - value.getTime();
    const minutes = Math.max(1, Math.round(diffMs / 60000));
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hrs ago`;
    const days = Math.round(hours / 24);
    return `${days} days ago`;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function basename(filePath) {
    if (!filePath) return '';
    const normalized = String(filePath).replace(/[\\\/]+$/, '');
    const parts = normalized.split(/[\\\/]/);
    return parts[parts.length - 1] || normalized;
}

function updateWorkspaceUi() {
    const label = state.workspacePath ? basename(state.workspacePath) : 'Select folder';
    if (dom.workspaceContextName) dom.workspaceContextName.textContent = label;
    if (dom.workspaceLabel) dom.workspaceLabel.textContent = state.workspacePath ? label : 'No workspace';
    if (dom.workspaceContext) {
        dom.workspaceContext.title = state.workspacePath
            ? `Workspace: ${state.workspacePath}`
            : 'Select workspace folder';
        dom.workspaceContext.classList.toggle('needs-workspace', !state.workspacePath);
    }
}

async function refreshWorkspaceContext() {
    const api = getElectronAPI();
    if (!api?.getWorkspacePath) {
        updateWorkspaceUi();
        return null;
    }
    try {
        state.workspacePath = await api.getWorkspacePath();
        updateWorkspaceUi();
        return state.workspacePath;
    } catch (error) {
        showToast(`Workspace context error: ${error.message || error}`);
        updateWorkspaceUi();
        return null;
    }
}

async function selectWorkspaceFolder() {
    const api = getElectronAPI();
    if (!api?.openFolder) {
        showToast('Folder picker is not available');
        return null;
    }
    const folder = await api.openFolder();
    if (!folder) return state.workspacePath;
    state.workspacePath = folder;
    if (api.setWorkspacePath) {
        try {
            await api.setWorkspacePath(folder);
        } catch {
            // The selected folder is still passed directly to aiChat in this window.
        }
    }
    updateWorkspaceUi();
    showToast(`Workspace selected: ${folder}`);
    return folder;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCurrentSession() {
    return state.sessions.find((session) => session.id === state.currentSessionId) || null;
}

function openActionLog(expand = true) {
    if (!dom.actionLogPanel || !dom.toggleActions) return;
    dom.actionLogPanel.classList.toggle('hidden', !expand);
    dom.toggleActions.classList.toggle('expanded', expand);
    dom.actionLogPanel.style.maxHeight = expand ? `${Math.max(dom.actionLogPanel.scrollHeight, 120)}px` : '0';
}

function setInspectorTab(tab) {
    const showingChanges = tab === 'changes';
    dom.tabChanges?.classList.toggle('active', showingChanges);
    dom.tabFiles?.classList.toggle('active', !showingChanges);
    if (dom.filesEmpty) {
        dom.filesEmpty.querySelector('p').textContent = showingChanges
            ? 'Code changes and action results will appear here.'
            : 'Folders and files will appear here.';
    }
    openActionLog(showingChanges);
}

function navigateSessionHistory(direction) {
    const nextHistoryIndex = state.sessionHistoryIndex + direction;
    if (nextHistoryIndex < 0 || nextHistoryIndex >= state.sessionHistory.length) return;
    const nextSessionId = state.sessionHistory[nextHistoryIndex];
    if (!state.sessions.some((session) => session.id === nextSessionId)) return;
    state.sessionHistoryIndex = nextHistoryIndex;
    switchSession(nextSessionId, { trackHistory: false });
}

function updateNavigationButtons() {
    if (dom.sessionBack) dom.sessionBack.disabled = state.sessionHistoryIndex <= 0;
    if (dom.sessionForward) dom.sessionForward.disabled = state.sessionHistoryIndex >= state.sessionHistory.length - 1;
}

/**
 * Simple markdown to HTML renderer.
 * Handles: code blocks, inline code, bold, italic, links, lists, headers, blockquotes, tables.
 */
function renderMarkdown(text) {
    if (!text) return '';

    let html = escapeHtml(text);

    // Code blocks (must be before inline code)
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
        const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : '';
        return `<pre><code${langClass}>${code.trim()}</code></pre>`;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Tables
    html = html.replace(/\|(.+)\|/g, (match, content) => {
        const cells = content.split('|').map((c) => c.trim());
        // Check if it's a separator row
        if (cells.every((c) => /^:?-+:?$/.test(c))) return '';
        const isHeader = match.includes('---') || false; // heuristic
        const tag = isHeader ? 'th' : 'td';
        return `<tr>${cells.map((c) => `<${tag}>${c}</${tag}>`).join('')}</tr>`;
    });

    // Headers
    html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Blockquotes
    html = html.replace(/^>\s?(.+)$/gm, '<blockquote>$1</blockquote>');

    // Bold and italic
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // Unordered lists
    html = html.replace(/^[\*\-]\s(.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

    // Ordered lists
    html = html.replace(/^\d+\.\s(.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => {
        if (!match.startsWith('<ul>')) {
            return '<ol>' + match + '</ol>';
        }
        return match;
    });

    // Line breaks
    html = html.replace(/\n/g, '<br>');

    // Fix nested <br> inside block elements
    html = html.replace(/<\/h1><br>/g, '</h1>');
    html = html.replace(/<\/h2><br>/g, '</h2>');
    html = html.replace(/<\/h3><br>/g, '</h3>');
    html = html.replace(/<\/h4><br>/g, '</h4>');
    html = html.replace(/<\/li><br>/g, '</li>');
    html = html.replace(/<\/blockquote><br>/g, '</blockquote>');
    html = html.replace(/<\/pre><br>/g, '</pre>');
    html = html.replace(/<\/table><br>/g, '</table>');
    html = html.replace(/<br><ul>/g, '<ul>');
    html = html.replace(/<br><ol>/g, '<ol>');

    return html;
}

// =============================================================================
// Message Rendering
// =============================================================================
function renderWelcomeScreen() {
    if (!isElement(dom.messages)) return;
    dom.messages.innerHTML = '<div class="welcome-message" aria-hidden="true"></div>';
    document.getElementById('agent-main')?.classList.remove('has-messages');
}

function addMessage(role, text, options = {}) {
    if (!isElement(dom.messages) || !dom.messageTemplate) return;
    const { actions, timestamp = new Date(), isTyping } = options;

    // Remove typing indicator if present
    removeTypingIndicator();

    // Remove welcome screen on first message
    const welcome = dom.messages.querySelector('.welcome-message');
    if (welcome) {
        welcome.remove();
    }
    document.getElementById('agent-main')?.classList.add('has-messages');

    const template = dom.messageTemplate.content.cloneNode(true);
    const messageEl = template.querySelector('.message');
    const avatar = template.querySelector('.message-avatar');
    const sender = template.querySelector('.message-sender');
    const timeEl = template.querySelector('.message-timestamp');
    const body = template.querySelector('.message-body');
    const copyBtn = template.querySelector('.msg-action-btn');

    messageEl.classList.add(role);

    if (role === 'user') {
        avatar.textContent = 'U';
        sender.textContent = 'You';
    } else if (role === 'agent') {
        avatar.textContent = 'N';
        sender.textContent = 'NexCode Agent';
    } else if (role === 'tool') {
        avatar.textContent = '>';
        sender.textContent = 'Action';
    } else {
        avatar.textContent = 'i';
        sender.textContent = 'System';
    }

    if (timeEl) {
        timeEl.textContent = formatTime(timestamp);
    }

    if (role === 'agent') {
        body.innerHTML = renderMarkdown(text);
    } else {
        body.textContent = text;
    }

    // Copy handler
    copyBtn?.addEventListener('click', () => {
        const textToCopy = role === 'agent' ? text : body.textContent;
        navigator.clipboard.writeText(textToCopy).then(() => {
            showToast('Copied to clipboard');
        });
    });

    messageEl.appendChild(template.querySelector('.message-avatar'));
    messageEl.appendChild(template.querySelector('.message-content'));
    messageEl.appendChild(template.querySelector('.message-actions'));

    dom.messages.appendChild(messageEl);
    scrollToBottom();

    // Track actions if provided
    if (actions && actions.length > 0) {
        actions.forEach((action) => addAction(action));
    }
}

function addTypingIndicator() {
    if (!isElement(dom.messages)) return;
    removeTypingIndicator();
    const typingEl = document.createElement('div');
    typingEl.className = 'typing-indicator';
    typingEl.id = 'typing-indicator';
    typingEl.innerHTML = `
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
    `;
    dom.messages.appendChild(typingEl);
    scrollToBottom();
}

function removeTypingIndicator() {
    const existing = document.getElementById('typing-indicator');
    if (existing) existing.remove();
}

function addAction(action) {
    if (!dom.actionItemTemplate || !isElement(dom.actionLogList) || !isElement(dom.actionCount)) return;
    const template = dom.actionItemTemplate.content.cloneNode(true);
    const item = template.querySelector('.action-item');
    const icon = template.querySelector('.action-icon');
    const label = template.querySelector('.action-label');
    const time = template.querySelector('.action-time');

    switch (action.type) {
        case 'write_file':
            icon.textContent = 'W';
            item.classList.add('action-success');
            break;
        case 'read_file':
            icon.textContent = 'R';
            item.classList.add('action-success');
            break;
        case 'run_command':
            icon.textContent = '$';
            item.classList.add(action.command?.includes('failed') ? 'action-error' : 'action-success');
            break;
        default:
            icon.textContent = '*';
    }

    label.textContent = action.label || `${action.type}: ${action.path || action.command || ''}`;
    time.textContent = formatTime(new Date());

    dom.actionLogList.appendChild(item);
    state.actions.push(action);
    dom.actionCount.textContent = state.actions.length;
}

function addSystemMessage(text) {
    if (!isElement(dom.messages)) return;
    dom.messages.querySelector('.welcome-message')?.remove();
    document.getElementById('agent-main')?.classList.add('has-messages');
    const systemEl = document.createElement('div');
    systemEl.className = 'message system';
    systemEl.innerHTML = `<div class="message-body">${escapeHtml(text)}</div>`;
    dom.messages.appendChild(systemEl);
    scrollToBottom();
}

function scrollToBottom() {
    if (!isElement(dom.messages)) return;
    requestAnimationFrame(() => {
        dom.messages.scrollTop = dom.messages.scrollHeight;
    });
}

// =============================================================================
// Session Management
// =============================================================================
function createSession(title) {
    const session = {
        id: generateId(),
        title: title || `Session ${state.sessions.length + 1}`,
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
    };
    state.sessions.push(session);
    renderSessionList();
    switchSession(session.id);
    return session;
}

function switchSession(sessionId, options = {}) {
    if (!isElement(dom.messages) || !isElement(dom.actionLogList) || !isElement(dom.actionCount)) return;
    state.currentSessionId = sessionId;
    if (options.trackHistory !== false && state.sessionHistory[state.sessionHistoryIndex] !== sessionId) {
        state.sessionHistory = state.sessionHistory.slice(0, state.sessionHistoryIndex + 1);
        state.sessionHistory.push(sessionId);
        state.sessionHistoryIndex = state.sessionHistory.length - 1;
    }
    state.messages = [];
    state.actions = [];
    document.getElementById('agent-main')?.classList.remove('has-messages');

    // Clear chat and action log
    dom.messages.innerHTML = '';
    dom.actionLogList.innerHTML = '';
    dom.actionCount.textContent = '0';

    const session = state.sessions.find((s) => s.id === sessionId);
    if (session) {
        // Restore messages from session history
        session.messages.forEach((msg) => {
            addMessage(msg.role, msg.text, {
                actions: msg.actions,
                timestamp: new Date(msg.timestamp),
            });
        });

        // Restore actions
        if (session.actions) {
            session.actions.forEach((action) => addAction(action));
        }
    }

    if (!session || session.messages.length === 0) {
        renderWelcomeScreen();
    }

    renderSessionList();
    updateProviderInfo();
    updateNavigationButtons();
}

function deleteSession(sessionId) {
    const index = state.sessions.findIndex((s) => s.id === sessionId);
    if (index === -1) return;

    state.sessions.splice(index, 1);
    state.sessionHistory = state.sessionHistory.filter((id) => id !== sessionId);
    state.sessionHistoryIndex = Math.min(state.sessionHistoryIndex, state.sessionHistory.length - 1);

    if (state.sessions.length === 0) {
        createSession();
    } else if (state.currentSessionId === sessionId) {
        switchSession(state.sessions[Math.min(index, state.sessions.length - 1)].id);
    } else {
        renderSessionList();
        updateNavigationButtons();
    }
}

function renderSessionList() {
    if (!isElement(dom.sessionList) || !dom.sessionItemTemplate) return;
    dom.sessionList.innerHTML = '';
    const query = state.sessionSearchQuery.trim().toLowerCase();
    state.sessions.forEach((session, index) => {
        if (state.sessionFilterActive && session.id !== state.currentSessionId) return;
        if (query && !session.title.toLowerCase().includes(query)) return;
        const template = dom.sessionItemTemplate.content.cloneNode(true);
        const item = template.querySelector('.session-item');
        const title = template.querySelector('.session-title');
        const meta = template.querySelector('.session-meta');
        const deleteBtn = template.querySelector('.session-delete');

        item.dataset.sessionId = session.id;
        title.textContent = index === 0 && session.title === 'New Chat' ? 'continue' : session.title;
        meta.textContent = formatRelativeTime(session.updatedAt || session.createdAt);

        if (session.id === state.currentSessionId) {
            item.classList.add('active');
        }

        item.addEventListener('click', () => {
            if (state.currentSessionId !== session.id) {
                switchSession(session.id);
            }
        });
        item.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                if (state.currentSessionId !== session.id) {
                    switchSession(session.id);
                }
            }
        });

        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteSession(session.id);
        });

        dom.sessionList.appendChild(item);
    });
}

// =============================================================================
// Settings
// =============================================================================
function toggleSettings() {
    if (!isElement(dom.settingsOverlay)) return;
    const isOpen = !dom.settingsOverlay.classList.contains('hidden');
    dom.settingsOverlay.classList.toggle('hidden');

    if (!isOpen) {
        // Populate settings from state
        if (dom.providerSelect) dom.providerSelect.value = state.settings.provider;
        if (dom.geminiKey) dom.geminiKey.value = state.settings.geminiApiKey;
        if (dom.geminiModel) dom.geminiModel.value = state.settings.geminiModel;
        if (dom.openrouterKey) dom.openrouterKey.value = state.settings.openRouterApiKey;
        if (dom.openrouterModel) dom.openrouterModel.value = state.settings.openRouterModel;
        if (dom.maxTurns) dom.maxTurns.value = state.settings.maxTurns;
        updateProviderFields();
    }
}

function updateProviderFields() {
    if (!dom.providerSelect || !dom.groupGeminiKey || !dom.groupGeminiModel || !dom.groupOpenrouterKey || !dom.groupOpenrouterModel) return;
    const provider = dom.providerSelect.value;
    const isGemini = provider === 'gemini';
    dom.groupGeminiKey.classList.toggle('hidden', !isGemini);
    dom.groupGeminiModel.classList.toggle('hidden', !isGemini);
    dom.groupOpenrouterKey.classList.toggle('hidden', isGemini);
    dom.groupOpenrouterModel.classList.toggle('hidden', isGemini);
}

function saveSettings() {
    if (!dom.providerSelect || !dom.geminiKey || !dom.geminiModel || !dom.openrouterKey || !dom.openrouterModel || !dom.maxTurns || !isElement(dom.settingsOverlay)) return;
    state.settings.provider = dom.providerSelect.value;
    state.settings.geminiApiKey = dom.geminiKey.value.trim();
    state.settings.geminiModel = dom.geminiModel.value;
    state.settings.openRouterApiKey = dom.openrouterKey.value.trim();
    state.settings.openRouterModel = dom.openrouterModel.value.trim();
    state.settings.maxTurns = parseInt(dom.maxTurns.value, 10) || 10;

    // Save to localStorage for persistence
    try {
        localStorage.setItem('nexcode-agent-settings', JSON.stringify(state.settings));
    } catch (e) {
        // ignore
    }

    updateProviderInfo();
    dom.settingsOverlay.classList.add('hidden');
    showToast('Settings saved');
}

function resetSettings() {
    if (!dom.providerSelect || !dom.geminiKey || !dom.geminiModel || !dom.openrouterKey || !dom.openrouterModel || !dom.maxTurns) return;
    state.settings = {
        provider: 'gemini',
        geminiApiKey: '',
        geminiModel: 'gemini-2.5-flash',
        openRouterApiKey: '',
        openRouterModel: 'openai/gpt-4o-mini',
        maxTurns: 10,
    };
    dom.providerSelect.value = 'gemini';
    dom.geminiKey.value = '';
    dom.geminiModel.value = 'gemini-2.5-flash';
    dom.openrouterKey.value = '';
    dom.openrouterModel.value = 'openai/gpt-4o-mini';
    dom.maxTurns.value = '10';
    updateProviderFields();
    updateProviderInfo();
    showToast('Settings reset to defaults');
}

function loadSettings() {
    try {
        const saved = localStorage.getItem('nexcode-agent-settings');
        if (saved) {
            const parsed = JSON.parse(saved);
            Object.assign(state.settings, parsed);
        }
    } catch (e) {
        // ignore
    }
}

function updateProviderInfo() {
    const providerNameMap = {
        gemini: 'Gemini',
        openrouter: 'OpenRouter',
    };
    if (dom.providerName) {
        dom.providerName.textContent = providerNameMap[state.settings.provider] || 'Unknown';
    }

    if (dom.providerModel) {
        if (state.settings.provider === 'gemini') {
            dom.providerModel.textContent = state.settings.geminiModel || 'Not configured';
        } else {
            dom.providerModel.textContent = state.settings.openRouterModel || 'Not configured';
        }
    }

    updateProviderStatus(state.providerStatus);
}

function updateProviderStatus(status) {
    if (!dom.providerStatus) return;
    state.providerStatus = status;
    const dot = dom.providerStatus.querySelector('.status-dot');
    const text = dom.providerStatus.querySelector('span:last-child');
    if (!dot || !text) return;

    dot.className = 'status-dot';
    switch (status) {
        case 'loading':
            dot.classList.add('status-loading');
            text.textContent = 'Thinking...';
            break;
        case 'success':
            dot.classList.add('status-success');
            text.textContent = 'Ready';
            break;
        case 'error':
            dot.classList.add('status-error');
            text.textContent = 'Error';
            break;
        default:
            dot.classList.add('status-idle');
            text.textContent = 'Idle';
    }
}

// =============================================================================
// Attachment Handling
// =============================================================================
function handleFileAttach(files) {
    for (const file of files) {
        if (file.size > 10 * 1024 * 1024) {
            showToast(`File too large: ${file.name} (max 10MB)`);
            continue;
        }
        state.attachments.push({
            id: generateId(),
            name: file.name,
            kind: 'text',
            file: file,
            dataUrl: null,
        });
    }
    renderAttachments();
}

function handleImageAttach(files) {
    for (const file of files) {
        if (file.size > 20 * 1024 * 1024) {
            showToast(`Image too large: ${file.name} (max 20MB)`);
            continue;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            state.attachments.push({
                id: generateId(),
                name: file.name,
                kind: 'image',
                file: file,
                dataUrl: e.target.result,
            });
            renderAttachments();
        };
        reader.readAsDataURL(file);
    }
}

function removeAttachment(id) {
    state.attachments = state.attachments.filter((a) => a.id !== id);
    renderAttachments();
}

function renderAttachments() {
    if (!isElement(dom.attachmentList) || !isElement(dom.attachmentPreview)) return;
    dom.attachmentList.innerHTML = '';
    if (state.attachments.length === 0) {
        dom.attachmentPreview.classList.add('hidden');
        return;
    }

    dom.attachmentPreview.classList.remove('hidden');
    state.attachments.forEach((att) => {
        const chip = document.createElement('div');
        chip.className = 'attachment-chip';
        chip.innerHTML = `
            ${att.kind === 'image' ? `<img src="${att.dataUrl}" class="attachment-thumb" alt="" />` : '<span>File</span>'}
            <span>${escapeHtml(att.name)}</span>
            <button class="remove-attachment" data-id="${att.id}">x</button>
        `;
        chip.querySelector('.remove-attachment').addEventListener('click', () => {
            removeAttachment(att.id);
        });
        dom.attachmentList.appendChild(chip);
    });
}

// =============================================================================
// AI Chat Integration
// =============================================================================
async function sendMessage() {
    const text = dom.input.value.trim();
    if (!text && state.attachments.length === 0) return;

    if (state.isLoading) return;

    // Validate API key
    const apiKey = state.settings.provider === 'gemini'
        ? state.settings.geminiApiKey
        : state.settings.openRouterApiKey;

    if (!apiKey) {
        addSystemMessage('Please configure your API key in Settings before using the AI agent.');
        return;
    }

    // Add user message
    addMessage('user', text);

    // Build attachments for the AI
    const attachments = [];
    for (const att of state.attachments) {
        if (att.kind === 'image' && att.dataUrl) {
            attachments.push({
                name: att.name,
                kind: 'image',
                mimeType: att.file.type || 'image/png',
                dataUrl: att.dataUrl,
            });
        } else {
            // Read file content as text
            try {
                const content = await att.file.text();
                attachments.push({
                    name: att.name,
                    kind: 'text',
                    mimeType: 'text/plain',
                    content: content.slice(0, 50000), // limit to 50KB
                    truncated: content.length > 50000,
                });
            } catch (e) {
                attachments.push({
                    name: att.name,
                    kind: 'text',
                    mimeType: 'text/plain',
                    content: '[Could not read file content]',
                });
            }
        }
    }

    // Clear input and attachments
    dom.input.value = '';
    state.attachments = [];
    renderAttachments();

    // Show loading state
    setLoading(true);
    addTypingIndicator();
    updateProviderStatus('loading');

    // Cancel previous request if any
    if (state.abortController) {
        state.abortController.abort();
    }
    state.abortController = new AbortController();

    try {
        // Build message history for context
        const currentSession = state.sessions.find((s) => s.id === state.currentSessionId);
        const history = currentSession ? currentSession.messages.slice(-20) : [];

        const aiMessages = history.map((msg) => ({
            role: msg.role === 'agent' ? 'model' : msg.role,
            text: msg.text,
            attachments: msg.attachments || [],
        }));

        aiMessages.push({
            role: 'user',
            text: text,
            attachments: attachments.length > 0 ? attachments : undefined,
        });

        // Call the AI via the Electron IPC bridge
        const result = await window.electronAPI.aiChat(
            aiMessages,
            state.workspacePath || await refreshWorkspaceContext(),
            state.editorContext // editorContext
        );

        if (result.error) {
            addMessage('agent', `**Error:** ${result.error}`);
            updateProviderStatus('error');
            addSystemMessage(`Error: ${result.error}`);
        } else {
            const replyText = result.text || '*(Agent completed the task without a text response.)*';
            addMessage('agent', replyText, {
                actions: result.actions || [],
            });
            updateProviderStatus('success');

            // Save to session history
            if (currentSession) {
                currentSession.messages.push({
                    role: 'user',
                    text: text,
                    timestamp: new Date().toISOString(),
                    attachments: attachments.length > 0 ? attachments : undefined,
                });
                currentSession.messages.push({
                    role: 'agent',
                    text: replyText,
                    timestamp: new Date().toISOString(),
                    actions: result.actions || [],
                });
                currentSession.updatedAt = new Date();
                renderSessionList();
            }
        }
    } catch (err) {
        if (err.name === 'AbortError') {
            addSystemMessage('Request cancelled.');
            updateProviderStatus('idle');
        } else {
            const errorMsg = err.message || String(err);
            addMessage('agent', `**Connection Error:** ${errorMsg}`);
            addSystemMessage(`Error: ${errorMsg}`);
            updateProviderStatus('error');
        }
    } finally {
        setLoading(false);
        removeTypingIndicator();
        state.abortController = null;
        if (state.providerStatus === 'loading') {
            updateProviderStatus('idle');
        }
    }
}

function setLoading(loading) {
    state.isLoading = loading;
    if (dom.loadingIndicator) dom.loadingIndicator.classList.toggle('hidden', !loading);
    if (dom.sendBtn) dom.sendBtn.disabled = loading;
    if (dom.input) dom.input.disabled = loading;
}

function cancelRequest() {
    if (state.abortController) {
        state.abortController.abort();
        state.abortController = null;
    }
    setLoading(false);
    removeTypingIndicator();
    updateProviderStatus('idle');
    addSystemMessage('Request cancelled.');
}

// =============================================================================
// Toast Notification
// =============================================================================
function showToast(message, duration = 2000) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// =============================================================================
// Input Handler
// =============================================================================
function autoResizeTextarea() {
    if (!dom.input) return;
    dom.input.style.height = 'auto';
    dom.input.style.height = Math.min(dom.input.scrollHeight, 150) + 'px';
}

function handleInputKeydown(e) {
    if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        sendMessage();
    } else if (e.key === 'Enter' && e.shiftKey) {
        // Allow default (new line)
    } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

// =============================================================================
// Editor Context
// =============================================================================
async function fetchEditorContext() {
    try {
        // Try to get editor context from the main window
        // This uses IPC if available, or falls back gracefully
        if (window.electronAPI.getEditorContext) {
            const context = await window.electronAPI.getEditorContext();
            state.editorContext = context;
            if (context && context.activeFilePath) {
                addSystemMessage(`Editor context loaded: ${context.activeFilePath}`);
            } else {
                addSystemMessage('Editor context: No active file open.');
            }
        } else {
            // Fallback: try to get from the shared state
            addSystemMessage('Editor context: Not available in this window.');
        }
    } catch (e) {
        addSystemMessage(`Could not fetch editor context: ${e.message}`);
    }
}

// =============================================================================
// Keyboard Shortcuts
// =============================================================================
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl+N for new session
        if (e.ctrlKey && e.key === 'n') {
            e.preventDefault();
            createSession();
        }
        // Ctrl+, for settings
        if (e.ctrlKey && e.key === ',') {
            e.preventDefault();
            if (navigator.platform.indexOf('Win') >= 0 || navigator.platform.indexOf('Linux') >= 0) {
                // Windows/Linux uses Ctrl+,
                toggleSettings();
            }
        }
        // Escape to close settings
        if (e.key === 'Escape') {
            if (!dom.settingsOverlay.classList.contains('hidden')) {
                dom.settingsOverlay.classList.add('hidden');
            }
        }
    });
}

// =============================================================================
// Clipboard / Copy
// =============================================================================
// Copy message functionality is handled per-message in addMessage()
// Additional: copy all messages (future feature)

function setupInterfaceControls() {
    dom.toggleSidebar?.addEventListener('click', () => {
        dom.layout?.classList.toggle('sidebar-collapsed');
        dom.toggleSidebar.classList.toggle('active');
    });

    dom.sessionBack?.addEventListener('click', () => navigateSessionHistory(-1));
    dom.sessionForward?.addEventListener('click', () => navigateSessionHistory(1));
    dom.runPrompt?.addEventListener('click', sendMessage);

    dom.toggleTerminal?.addEventListener('click', () => {
        dom.layout?.classList.remove('inspector-collapsed');
        dom.toggleTerminal.classList.toggle('active');
        setInspectorTab('changes');
        showToast('Action log opened');
    });

    dom.sessionFilter?.addEventListener('click', () => {
        state.sessionFilterActive = !state.sessionFilterActive;
        dom.sessionFilter.classList.toggle('active', state.sessionFilterActive);
        renderSessionList();
    });

    dom.sessionSearch?.addEventListener('click', () => {
        if (!dom.sessionSearchRow || !dom.sessionSearchInput) return;
        const isHidden = dom.sessionSearchRow.classList.toggle('hidden');
        dom.sessionSearch.classList.toggle('active', !isHidden);
        if (!isHidden) {
            dom.sessionSearchInput.focus();
            dom.sessionSearchInput.select();
        } else {
            state.sessionSearchQuery = '';
            dom.sessionSearchInput.value = '';
            renderSessionList();
        }
    });

    dom.sessionSearchInput?.addEventListener('input', () => {
        state.sessionSearchQuery = dom.sessionSearchInput.value;
        renderSessionList();
    });
    dom.sessionSearchInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            dom.sessionSearchRow?.classList.add('hidden');
            dom.sessionSearch?.classList.remove('active');
            state.sessionSearchQuery = '';
            dom.sessionSearchInput.value = '';
            renderSessionList();
        }
    });

    dom.moreWorkspaces?.addEventListener('click', async () => {
        const api = getElectronAPI();
        if (api?.getWorkspacePath) {
            try {
                const workspacePath = await api.getWorkspacePath();
                showToast(workspacePath ? `Current workspace: ${workspacePath}` : 'No additional workspaces are available yet');
                return;
            } catch {
                // Fall through to the local message.
            }
        }
        showToast('No additional workspaces are available yet');
    });

    dom.customizations?.addEventListener('click', toggleSettings);
    dom.modelContext?.addEventListener('click', toggleSettings);

    dom.workspaceContext?.addEventListener('click', () => void selectWorkspaceFolder());

    dom.tabChanges?.addEventListener('click', () => setInspectorTab('changes'));
    dom.tabFiles?.addEventListener('click', () => setInspectorTab('files'));
}

// =============================================================================
// Initialization
// =============================================================================
function init() {
    // Load settings from localStorage
    loadSettings();

    // Create initial session
    createSession('New Chat');
    setupInterfaceControls();
    void refreshWorkspaceContext();

    // Wire event listeners
    if (dom.sendBtn) dom.sendBtn.addEventListener('click', sendMessage);
    if (dom.input) {
        dom.input.addEventListener('input', autoResizeTextarea);
        dom.input.addEventListener('keydown', handleInputKeydown);
    }

    // New session
    if (dom.newSession) dom.newSession.addEventListener('click', () => createSession());

    // Window controls
    if (dom.minimizeBtn) {
        dom.minimizeBtn.addEventListener('click', () => {
            const api = getElectronAPI();
            if (api && api.minimizeWindow) {
                api.minimizeWindow();
            }
        });
    }
    if (dom.maximizeBtn) {
        dom.maximizeBtn.addEventListener('click', () => {
            const api = getElectronAPI();
            if (api && api.maximizeWindow) {
                api.maximizeWindow();
                window.setTimeout(() => void syncAgentWindowControls(), 40);
            }
        });
    }
    if (dom.closeBtn) {
        dom.closeBtn.addEventListener('click', () => {
            const api = getElectronAPI();
            if (api && api.closeWindow) {
                api.closeWindow();
            }
        });
    }
    const dragArea = document.querySelector('.titlebar-drag');
    dragArea?.addEventListener('dblclick', () => {
        const api = getElectronAPI();
        if (api && api.maximizeWindow) {
            api.maximizeWindow();
            window.setTimeout(() => void syncAgentWindowControls(), 40);
        }
    });
    window.addEventListener('resize', () => void syncAgentWindowControls());
    void syncAgentWindowControls();

    // Settings
    if (dom.settingsBtn) dom.settingsBtn.addEventListener('click', toggleSettings);
    if (dom.settingsClose && dom.settingsOverlay) {
        dom.settingsClose.addEventListener('click', () => dom.settingsOverlay.classList.add('hidden'));
    }
    if (dom.settingsSave) dom.settingsSave.addEventListener('click', saveSettings);
    if (dom.settingsReset) dom.settingsReset.addEventListener('click', resetSettings);
    if (dom.providerSelect) dom.providerSelect.addEventListener('change', updateProviderFields);

    // Toggle API key visibility
    if (dom.toggleGeminiVis && dom.geminiKey) {
        dom.toggleGeminiVis.addEventListener('click', () => {
            dom.geminiKey.type = dom.geminiKey.type === 'password' ? 'text' : 'password';
            dom.toggleGeminiVis.textContent = dom.geminiKey.type === 'password' ? 'Show' : 'Hide';
        });
    }
    if (dom.toggleOpenrouterVis && dom.openrouterKey) {
        dom.toggleOpenrouterVis.addEventListener('click', () => {
            dom.openrouterKey.type = dom.openrouterKey.type === 'password' ? 'text' : 'password';
            dom.toggleOpenrouterVis.textContent = dom.openrouterKey.type === 'password' ? 'Show' : 'Hide';
        });
    }

    // Cancel request
    if (dom.cancelBtn) dom.cancelBtn.addEventListener('click', cancelRequest);

    // Action log toggle
    dom.toggleActions?.addEventListener('click', () => {
        if (!dom.actionLogPanel || !dom.toggleActions) return;
        const isExpanded = dom.actionLogPanel.classList.contains('hidden');
        dom.actionLogPanel.classList.toggle('hidden');
        dom.toggleActions.classList.toggle('expanded');
        dom.actionLogPanel.style.maxHeight = isExpanded ? dom.actionLogPanel.scrollHeight + 'px' : '0';
    });

    // File attachment
    if (dom.attachFile && dom.filePicker) {
        dom.attachFile.addEventListener('click', () => dom.filePicker.click());
        dom.filePicker.addEventListener('change', () => {
            if (dom.filePicker.files.length > 0) {
                handleFileAttach(dom.filePicker.files);
                dom.filePicker.value = '';
            }
        });
    }

    // Image attachment
    if (dom.attachImage && dom.imagePicker) {
        dom.attachImage.addEventListener('click', () => dom.imagePicker.click());
        dom.imagePicker.addEventListener('change', () => {
            if (dom.imagePicker.files.length > 0) {
                handleImageAttach(dom.imagePicker.files);
                dom.imagePicker.value = '';
            }
        });
    }

    // Editor context
    if (dom.addEditorContext) dom.addEditorContext.addEventListener('click', fetchEditorContext);

    // Clear chat
    dom.clearChat?.addEventListener('click', () => {
        if (!isElement(dom.messages) || !isElement(dom.actionLogList) || !isElement(dom.actionCount)) return;
        dom.messages.innerHTML = '';
        dom.actionLogList.innerHTML = '';
        state.actions = [];
        dom.actionCount.textContent = '0';
        renderWelcomeScreen();

        // Clear current session messages
        const currentSession = state.sessions.find((s) => s.id === state.currentSessionId);
        if (currentSession) {
            currentSession.messages = [];
            currentSession.actions = [];
            renderSessionList();
        }
    });

    // Keyboard shortcuts
    setupKeyboardShortcuts();

    // Settings overlay click-outside
    dom.settingsOverlay?.addEventListener('click', (e) => {
        if (e.target === dom.settingsOverlay) {
            dom.settingsOverlay.classList.add('hidden');
        }
    });

    // Update provider info
    updateProviderInfo();

    console.log('[NexCode Agent] Initialized successfully');
}

// =============================================================================
// Auto-start
// =============================================================================
document.addEventListener('DOMContentLoaded', init);

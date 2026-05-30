/**
 * Preload script for the NexCode AI Agent window.
 * Exposes a secure bridge between the renderer and main process via contextBridge.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // ─── Agent Window Controls ────────────────────────────────────────────
    // These use agent-specific IPC channels that target agentWindow, NOT the main window
    minimizeWindow: () => ipcRenderer.send('agent-window:minimize'),
    maximizeWindow: () => ipcRenderer.send('agent-window:maximize'),
    closeWindow: () => ipcRenderer.send('agent-window:close'),
    isMaximized: () => ipcRenderer.invoke('agent-window:is-maximized'),

    // ─── AI Agent ─────────────────────────────────────────────────────────
    /**
     * Send a chat message to the AI agent and get a response.
     * @param {Array} messages - Array of { role: 'user'|'model', text, attachments? }
     * @param {string|null} workspacePath - Current workspace directory
     * @param {object|null} editorContext - Active file editor context
     * @returns {Promise<{ text?: string, error?: string, actions?: Array }>}
     */
    aiChat: (messages, workspacePath, editorContext) => {
        return ipcRenderer.invoke('ai:chat', messages, workspacePath, editorContext);
    },

    /**
     * Get the current editor context from the main IDE window.
     * @returns {Promise<{ activeFilePath: string|null, languageId: string|null, cursor?: object, selection?: object, selectedText?: string, content?: string }|null>}
     */
    getEditorContext: () => {
        return ipcRenderer.invoke('ai:get-editor-context');
    },

    /**
     * Get the current workspace path.
     * @returns {Promise<string|null>}
     */
    getWorkspacePath: () => {
        return ipcRenderer.invoke('ai:get-workspace-path');
    },

    /**
     * Open a folder picker so the agent can work in a local workspace.
     * @returns {Promise<string|null>}
     */
    openFolder: () => {
        return ipcRenderer.invoke('dialog:openFolder');
    },

    /**
     * Persist the selected workspace for future agent requests.
     * @param {string|null} workspacePath
     * @returns {Promise<void>}
     */
    setWorkspacePath: (workspacePath) => {
        return ipcRenderer.invoke('ai:set-workspace-path', workspacePath || null);
    },

    /**
     * Get the current app settings (includes API keys and model config).
     * @returns {Promise<object>}
     */
    getSettings: () => {
        return ipcRenderer.invoke('settings:get');
    },

    /**
     * Listen for shortcut triggers from the main window.
     * @param {function} callback
     * @returns {function} Cleanup function
     */
    onShortcut: (callback) => {
        const handler = (event, action) => callback(action);
        ipcRenderer.on('shortcut:trigger', handler);
        return () => ipcRenderer.removeListener('shortcut:trigger', handler);
    },
});

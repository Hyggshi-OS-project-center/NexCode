/**
 * Session Manager & Hot Exit (VS Code Standard).
 * Preserves the workspace folder, open tabs, active tab, and unsaved drafts
 * across app restarts so that work is never lost on close.
 */

export interface SessionDraft {
  path: string;
  name: string;
  isUntitled: boolean;
  content: string;
  originalContent?: string;
  timestamp: number;
}

export interface SessionTabInfo {
  path: string;
  name: string;
  isDirty: boolean;
}

export interface SessionState {
  workspacePath: string | null;
  openTabs: SessionTabInfo[];
  activeTab: string | null;
  drafts: Record<string, SessionDraft>;
}

const STORAGE_KEY = 'nexcode.session.v1';

export class SessionManager {
  private state: SessionState = {
    workspacePath: null,
    openTabs: [],
    activeTab: null,
    drafts: {},
  };

  private saveTimer: number | null = null;

  constructor() {
    this.load();
  }

  /**
   * Load saved session from localStorage.
   */
  public load(): SessionState | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SessionState;
        if (parsed && typeof parsed === 'object') {
          this.state = {
            workspacePath: parsed.workspacePath ?? null,
            openTabs: Array.isArray(parsed.openTabs) ? parsed.openTabs : [],
            activeTab: parsed.activeTab ?? null,
            drafts: parsed.drafts && typeof parsed.drafts === 'object' ? parsed.drafts : {},
          };
          return this.state;
        }
      }
    } catch (err) {
      console.warn('[SessionManager] Failed to load session:', err);
    }
    return null;
  }

  /**
   * Get current in-memory session state.
   */
  public getState(): SessionState {
    return this.state;
  }

  /**
   * Update and immediately flush session state (tabs/workspace/active tab).
   * Tab changes must be persisted right away — do not debounce.
   */
  public updateSession(partial: Partial<SessionState>): void {
    if (partial.workspacePath !== undefined) this.state.workspacePath = partial.workspacePath;
    if (partial.openTabs !== undefined) this.state.openTabs = partial.openTabs;
    if (partial.activeTab !== undefined) this.state.activeTab = partial.activeTab;
    if (partial.drafts !== undefined) this.state.drafts = partial.drafts;
    this.flush();
  }

  /**
   * Save an unsaved draft buffer for hot exit.
   */
  public saveDraft(
    path: string,
    name: string,
    content: string,
    originalContent?: string,
    isUntitled = false,
  ): void {
    this.state.drafts[path] = {
      path,
      name,
      isUntitled,
      content,
      originalContent,
      timestamp: Date.now(),
    };
    this.scheduleSave();
  }

  /**
   * Remove a draft buffer (e.g. when file is saved or discarded or closed).
   */
  public removeDraft(path: string): void {
    if (this.state.drafts[path]) {
      delete this.state.drafts[path];
      this.scheduleSave();
    }
  }

  /**
   * Retrieve a draft for a specific path if one exists.
   */
  public getDraft(path: string): SessionDraft | undefined {
    return this.state.drafts[path];
  }

  /**
   * Check if there are any active unsaved drafts.
   */
  public hasDrafts(): boolean {
    return Object.keys(this.state.drafts).length > 0;
  }

  /**
   * Immediately flush state to persistent localStorage.
   */
  public flush(): void {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (err) {
      console.warn('[SessionManager] Failed to persist session:', err);
    }
  }

  /**
   * Clear session data completely.
   */
  public clear(): void {
    this.state = {
      workspacePath: null,
      openTabs: [],
      activeTab: null,
      drafts: {},
    };
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer !== null) return;
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      this.flush();
    }, 400);
  }
}

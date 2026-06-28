/**
 * Rename service — handles file and tab rename operations with dependencies injected.
 */
import type { MenuItem } from '../contextmenu/ContextMenu';
import { joinPath } from '../../utils/pathUtils';

export interface RenameServiceDependencies {
  /** Check if a path is a special tab (release notes/welcome) */
  isSpecialTab: (path: string) => boolean;
  /** Get parent path of a file path */
  getParentPath: (path: string) => string;
  /** Check if a path exists */
  pathExists: (path: string) => Promise<boolean>;
  /** Rename a file or directory */
  renamePath: (oldPath: string, newPath: string) => Promise<void>;
  /** Show an alert message */
  showAlert: (message: string) => void;
  /** Refresh the explorer view */
  refreshExplorer: () => Promise<void>;
  /** Get the current workspace path */
  getWorkspacePath: () => string | null;
  /** Close a tab */
  closeTab: (path: string) => void | Promise<void>;
}

export class RenameService {
  private deps: RenameServiceDependencies;
  /** Callback to start inline rename UI - should be set by the TabManager or app */
  startInlineRenameCallback: ((path: string) => void) | null = null;

  constructor(deps: RenameServiceDependencies) {
    this.deps = deps;
  }

  /**
   * Set the callback to start inline rename UI.
   * This should be called by the TabManager or app to wire up the inline rename functionality.
   */
  setStartInlineRenameCallback(callback: (path: string) => void): void {
    this.startInlineRenameCallback = callback;
  }

  /**
   * Get context menu items for a tab at the given position.
   * @returns Array of menu items to show in the context menu
   */
  getTabContextMenuItems(path: string, x: number, y: number): MenuItem[] {
    if (this.deps.isSpecialTab(path)) {
      // Special tabs (release notes, welcome) only show close option
      return [
        { label: 'Close', action: () => this.deps.closeTab(path) },
      ];
    }

    // Regular tabs show rename, separator, and close options
    return [
      {
        label: 'Rename',
        // This action should start the inline rename UI
        action: () => this.startInlineRename(path),
      },
      { separator: true },
      { label: 'Close', action: () => this.deps.closeTab(path) },
    ];
  }

  /**
   * Returns an action to start inline rename on a tab.
   * This action should be called when the user selects "Rename" from the context menu.
   * The actual inline rename UI is handled by the callback set via setStartInlineRenameCallback.
   */
  startInlineRename(path: string): () => void {
    return () => {
      // Call the callback to start the inline rename UI
      if (this.startInlineRenameCallback) {
        this.startInlineRenameCallback(path);
      }
      // If no callback is set, do nothing (this should be wired up properly)
    };
  }

  /**
   * Handle a tab rename confirmation with the given new name.
   * Performs validation, executes the rename, and returns the paths for state updates.
   * Returns null if the rename was not handled (e.g., cancelled or invalid),
   * or an object with oldPath and newPath if the rename was successful.
   */
  async handleTabRenameConfirmed(path: string, newName: string): Promise<{ oldPath: string; newPath: string } | null> {
    if (!newName || newName.trim() === '') {
      return null;
    }

    const trimmedName = newName.trim();
    const currentName = path.split(/[/\\]/).pop() ?? '';
    
    if (trimmedName === currentName) {
      return null;
    }

    const parentPath = this.deps.getParentPath(path);
    const dest = parentPath ? joinPath(parentPath, trimmedName) : trimmedName;

    // Check if destination already exists
    if (await this.deps.pathExists(dest)) {
      this.deps.showAlert(`"${trimmedName}" already exists.`);
      return null;
    }

    try {
      // Perform the actual rename
      await this.deps.renamePath(path, dest);
      
      // Refresh explorer if we have a workspace
      const workspacePath = this.deps.getWorkspacePath();
      if (workspacePath) {
        await this.deps.refreshExplorer();
      }
      
      return { oldPath: path, newPath: dest };
    } catch (error) {
      this.deps.showAlert(`Could not rename "${currentName}". The file may be in use.`);
      return null;
    }
  }
}
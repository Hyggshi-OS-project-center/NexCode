/**
 * Modal dialog — choose file or folder and enter a name (replaces window.prompt).
 */
import { basename } from '../../utils/pathUtils';
import { bindReliableTextFocus } from '../../utils/textInputFocus';

export type CreateItemType = 'file' | 'folder';

export interface CreateItemResult {
  type: CreateItemType;
  name: string;
}

const INVALID_NAME = /[\\/:*?"<>|]/;

export class CreateItemDialog {
  private static overlay: HTMLElement | null = null;

  static show(options: {
    parentPath: string;
    defaultType?: CreateItemType;
  }): Promise<CreateItemResult | null> {
    const dlg = CreateItemDialog.ensureDialog();
    const pathEl = dlg.querySelector('.create-item-path-target')!;
    const nameInput = dlg.querySelector('.create-item-name') as HTMLInputElement;
    const errorEl = dlg.querySelector('.create-item-error')!;
    const fileRadio = dlg.querySelector('input[value="file"]') as HTMLInputElement;
    const folderRadio = dlg.querySelector('input[value="folder"]') as HTMLInputElement;

    const folderName = basename(options.parentPath);
    pathEl.textContent = folderName;

    const defaultType = options.defaultType ?? 'file';
    fileRadio.checked = defaultType === 'file';
    folderRadio.checked = defaultType === 'folder';

    const defaultName = defaultType === 'folder' ? 'new-folder' : 'untitled.txt';
    nameInput.value = defaultName;
    errorEl.classList.add('hidden');
    errorEl.textContent = '';

    dlg.classList.remove('hidden');

    return new Promise((resolve) => {
      const cleanup = (result: CreateItemResult | null) => {
        dlg.classList.add('hidden');
        createBtn.removeEventListener('click', onCreate);
        cancelBtn.removeEventListener('click', onCancel);
        dlg.removeEventListener('click', onOverlayClick);
        nameInput.removeEventListener('keydown', onKeyDown);
        fileRadio.removeEventListener('change', onTypeChange);
        folderRadio.removeEventListener('change', onTypeChange);
        resolve(result);
      };

      const getType = (): CreateItemType => (fileRadio.checked ? 'file' : 'folder');

      const onTypeChange = () => {
        const isFolder = getType() === 'folder';
        if (nameInput.value === 'untitled.txt' || nameInput.value === 'new-folder') {
          nameInput.value = isFolder ? 'new-folder' : 'untitled.txt';
        }
        nameInput.placeholder = isFolder ? 'folder-name' : 'filename.ext';
      };

      const validate = (): string | null => {
        const name = nameInput.value.trim();
        if (!name) return 'Please enter a name.';
        if (INVALID_NAME.test(name)) return 'Name cannot contain \\ / : * ? " < > |';
        if (name === '.' || name === '..') return 'Invalid name.';
        return null;
      };

      const onCreate = () => {
        const err = validate();
        if (err) {
          errorEl.textContent = err;
          errorEl.classList.remove('hidden');
          nameInput.focus();
          return;
        }
        cleanup({ type: getType(), name: nameInput.value.trim() });
      };

      const onCancel = () => cleanup(null);

      const onOverlayClick = (e: MouseEvent) => {
        if (e.target === dlg) onCancel();
      };

      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onCreate();
        }
        if (e.key === 'Escape') onCancel();
      };

      const createBtn = dlg.querySelector('[data-action="create"]')!;
      const cancelBtn = dlg.querySelector('[data-action="cancel"]')!;

      createBtn.addEventListener('click', onCreate);
      cancelBtn.addEventListener('click', onCancel);
      dlg.addEventListener('click', onOverlayClick);
      nameInput.addEventListener('keydown', onKeyDown);
      fileRadio.addEventListener('change', onTypeChange);
      folderRadio.addEventListener('change', onTypeChange);

      onTypeChange();
      requestAnimationFrame(() => {
        nameInput.focus();
        nameInput.select();
      });
    });
  }

  private static ensureDialog(): HTMLElement {
    if (CreateItemDialog.overlay) return CreateItemDialog.overlay;

    const dlg = document.createElement('div');
    dlg.id = 'create-item-dialog';
    dlg.className = 'modal-overlay hidden';
    dlg.innerHTML = `
      <div class="modal-card create-item-dialog" role="dialog" aria-labelledby="create-item-title">
        <h3 id="create-item-title">Create new item</h3>
        <p class="create-item-message">What would you like to create in this folder?</p>
        <p class="create-item-path">Location: <span class="create-item-path-target"></span></p>
        <div class="create-item-type" role="radiogroup" aria-label="Item type">
          <label class="create-type-option">
            <input type="radio" name="create-item-type" value="file" checked />
            <span class="create-type-label">📄 File</span>
          </label>
          <label class="create-type-option">
            <input type="radio" name="create-item-type" value="folder" />
            <span class="create-type-label">📁 Folder</span>
          </label>
        </div>
        <label class="create-item-field-label" for="create-item-name-input">Name</label>
        <input type="text" id="create-item-name-input" class="create-item-name" autocomplete="off" spellcheck="false" />
        <p class="create-item-error hidden" role="alert"></p>
        <div class="modal-actions">
          <button type="button" class="welcome-btn" data-action="cancel">Cancel</button>
          <button type="button" class="welcome-btn primary" data-action="create">Create</button>
        </div>
      </div>
    `;
    document.body.appendChild(dlg);
    const nameInput = dlg.querySelector('.create-item-name');
    if (nameInput instanceof HTMLElement) {
      bindReliableTextFocus(nameInput);
    }
    CreateItemDialog.overlay = dlg;
    return dlg;
  }
}

/**
 * Reliable focus for text fields in Electron (frameless window + global user-select: none).
 */
export function bindReliableTextFocus(field: HTMLElement): void {
  const focus = (): void => {
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
      if (field.disabled || field.readOnly) return;
      field.focus({ preventScroll: true });
    } else if (field instanceof HTMLSelectElement) {
      field.focus({ preventScroll: true });
    }
  };

  field.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (document.activeElement !== field) {
      focus();
    }
  });

  field.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (document.activeElement !== field) {
      focus();
    }
  });
}

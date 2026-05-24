/**
 * Media preview panel — images (viewer), video, and audio.
 */
import type { MediaKind } from '../../../shared/types';
import { renderFileIconHtml } from '../../utils/fileIcons';
import { escapeHtml, formatFileSize } from '../../utils/textAnalysis';
import { ImageViewer } from './ImageViewer';

const EL = 'd' + 'iv';

export class BinaryFileView {
  private el: HTMLElement;
  private onOpenAnyway?: () => void;
  private imageViewer: ImageViewer | null = null;

  constructor(containerId: string) {
    const parent = document.getElementById(containerId)!;
    this.el = document.createElement(EL);
    this.el.id = 'binary-view';
    this.el.className = 'binary-view hidden';
    parent.appendChild(this.el);
  }

  show(options: {
    path: string;
    size: number;
    mediaKind?: MediaKind;
    mediaUrl?: string;
    onOpenAnyway: () => void;
  }): void {
    this.disposeImageViewer();
    this.pausePlayback();
    this.onOpenAnyway = options.onOpenAnyway;
    const fileName = options.path.split(/[/\\]/).pop() ?? options.path;
    const name = escapeHtml(fileName);
    const sizeLabel = formatFileSize(options.size);
    const url = options.mediaUrl ?? '';
    const fileIconHtml = renderFileIconHtml(fileName, false);

    if (options.mediaKind === 'image' && url) {
      this.el.classList.add('binary-view--image');
      this.el.innerHTML = `
        <${EL} class="binary-view-content binary-view-content-image">
          <${EL} class="image-viewer-host"></${EL}>
          <footer class="binary-view-footer">
            <p class="binary-meta">${name} · ${sizeLabel}</p>
            <button type="button" class="welcome-btn" data-action="open-anyway">Open as Text</button>
          </footer>
        </${EL}>
      `;
      const host = this.el.querySelector('.image-viewer-host')!;
      const alt = options.path.split(/[/\\]/).pop() ?? options.path;
      this.imageViewer = new ImageViewer(host, url, alt);
    } else if (options.mediaKind && url) {
      this.el.classList.remove('binary-view--image');
      const mediaBody = this.renderMedia(options.mediaKind, url, name);
      this.el.innerHTML = `
        <${EL} class="binary-view-content media-preview">
          ${mediaBody}
          <p class="binary-meta">${name} · ${sizeLabel}</p>
          <button type="button" class="welcome-btn" data-action="open-anyway">Open as Text</button>
        </${EL}>
      `;
    } else {
      this.el.classList.remove('binary-view--image');
      this.el.innerHTML = `
        <${EL} class="binary-view-content binary-view-content-placeholder">
          <${EL} class="binary-icon binary-icon-file">${fileIconHtml}</${EL}>
          <h2 class="binary-filename">${name}</h2>
          <p class="binary-message">
            The file is not displayed in the text editor because it is binary or uses an unsupported text encoding.
          </p>
          <p class="binary-meta">${sizeLabel}</p>
          <button type="button" class="binary-open-btn" data-action="open-anyway">Open Anyway</button>
        </${EL}>
      `;
    }

    this.el.querySelector('[data-action="open-anyway"]')?.addEventListener('click', () => {
      this.onOpenAnyway?.();
    });

    this.el.classList.remove('hidden');
  }

  private renderMedia(kind: NonNullable<MediaKind>, url: string, alt: string): string {
    const safeUrl = escapeHtml(url);
    switch (kind) {
      case 'image':
        return '';
      case 'video':
        return `<${EL} class="media-preview-frame media-preview-video">
          <video src="${safeUrl}" controls playsinline preload="metadata"></video>
        </${EL}>`;
      case 'audio':
        return `<${EL} class="media-preview-frame media-preview-audio">
          <${EL} class="audio-visual">♫</${EL}>
          <audio src="${safeUrl}" controls preload="metadata"></audio>
        </${EL}>`;
      default:
        return '';
    }
  }

  private disposeImageViewer(): void {
    this.imageViewer?.destroy();
    this.imageViewer = null;
  }

  private pausePlayback(): void {
    this.el.querySelectorAll('video, audio').forEach((el) => {
      (el as HTMLMediaElement).pause();
    });
  }

  hide(): void {
    this.pausePlayback();
    this.disposeImageViewer();
    this.el.classList.remove('binary-view--image');
    this.el.classList.add('hidden');
  }

  isVisible(): boolean {
    return !this.el.classList.contains('hidden');
  }
}

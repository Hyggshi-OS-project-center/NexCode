/**
 * PDF viewer using pdfjs-dist — renders pages with zoom, scroll, and navigation.
 */

let pdfjsLib: any = null;

async function ensurePdfjs(): Promise<any> {
  if (!pdfjsLib) {
    // Legacy build works reliably in Electron without ESM worker issues.
    pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/legacy/build/pdf.worker.mjs',
      import.meta.url,
    ).href;
  }
  return pdfjsLib;
}

export class PdfViewer {
  private root: HTMLElement;
  private container: HTMLElement;
  private toolbar: HTMLElement;
  private pageInfo: HTMLElement;
  private pageInput: HTMLInputElement;
  private zoomLabel: HTMLElement;
  private loader: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private textLayer: HTMLElement;
  private pdfDoc: any = null;
  private currentPage = 1;
  private totalPages = 0;
  private zoom = 1.0;
  private rendering = false;
  private pendingRender: number | null = null;
  private dataBase64: string | undefined;

  private onWheelBound: (e: WheelEvent) => void;

  constructor(parent: HTMLElement, url: string, dataBase64?: string) {
    this.onWheelBound = (e) => this.onWheel(e);
    this.dataBase64 = dataBase64;

    this.root = document.createElement('div');
    this.root.className = 'pdf-viewer';

    this.toolbar = document.createElement('d' + 'iv');
    this.toolbar.className = 'pdf-viewer-toolbar';
    this.toolbar.setAttribute('role', 'toolbar');
    this.toolbar.setAttribute('aria-label', 'PDF viewer');

    const mkBtn = (action: string, title: string, label: string) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pdf-viewer-btn';
      b.dataset.action = action;
      b.title = title;
      b.textContent = label;
      return b;
    };

    const mkSep = () => {
      const s = document.createElement('span');
      s.className = 'pdf-viewer-sep';
      s.setAttribute('aria-hidden', 'true');
      return s;
    };

    this.toolbar.append(
      mkBtn('zoom-out', 'Zoom out', '−'),
      mkBtn('zoom-in', 'Zoom in', '+'),
      (() => {
        this.zoomLabel = document.createElement('span');
        this.zoomLabel.className = 'pdf-viewer-zoom-label';
        this.zoomLabel.textContent = '100%';
        return this.zoomLabel;
      })(),
      mkSep(),
      mkBtn('fit-width', 'Fit to width', 'Fit W'),
      mkBtn('fit-page', 'Fit to page', 'Fit P'),
      mkSep(),
      mkBtn('prev-page', 'Previous page', '◀'),
      (() => {
        this.pageInfo = document.createElement('span');
        this.pageInfo.className = 'pdf-viewer-page-info';
        this.pageInfo.textContent = '— / —';
        return this.pageInfo;
      })(),
      (() => {
        this.pageInput = document.createElement('input');
        this.pageInput.type = 'number';
        this.pageInput.className = 'pdf-viewer-page-input';
        this.pageInput.min = '1';
        this.pageInput.value = '1';
        this.pageInput.setAttribute('aria-label', 'Go to page');
        return this.pageInput;
      })(),
      mkBtn('next-page', 'Next page', '▶'),
    );

    this.root.appendChild(this.toolbar);

    this.loader = document.createElement('div');
    this.loader.className = 'pdf-viewer-loader';
    this.loader.textContent = 'Loading PDF…';
    this.loader.setAttribute('aria-hidden', 'true');
    this.root.appendChild(this.loader);

    this.container = document.createElement('div');
    this.container.className = 'pdf-viewer-container';

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'pdf-viewer-canvas';
    this.ctx = this.canvas.getContext('2d');

    this.textLayer = document.createElement('div');
    this.textLayer.className = 'pdf-viewer-text-layer';

    this.container.append(this.canvas, this.textLayer);
    this.root.appendChild(this.container);
    parent.appendChild(this.root);

    this.bindToolbar();
    this.container.addEventListener('wheel', this.onWheelBound, { passive: false });

    void this.loadPdf(url);
  }

  destroy(): void {
    this.container.removeEventListener('wheel', this.onWheelBound);
    if (this.pdfDoc) {
      try { this.pdfDoc.destroy(); } catch { /* ignore */ }
    }
    this.root.remove();
  }

  private async loadPdf(url: string): Promise<void> {
    this.loader.classList.remove('hidden');
    try {
      const pdfjs = await ensurePdfjs();
      const source: any = this.dataBase64
        ? { data: Uint8Array.from(atob(this.dataBase64), (c) => c.charCodeAt(0)) }
        : url;
      const loadingTask = pdfjs.getDocument(source);
      const pdfDoc = await loadingTask.promise;
      this.pdfDoc = pdfDoc;
      this.totalPages = pdfDoc.numPages;
      this.currentPage = 1;
      this.updatePageInfo();
      await this.renderPage(this.currentPage);
    } catch (err) {
      this.container.innerHTML = `<div class="pdf-viewer-error">Failed to load PDF: ${(err as Error).message}</div>`;
    } finally {
      this.loader.classList.add('hidden');
    }
  }

  private async renderPage(pageNum: number): Promise<void> {
    if (!this.pdfDoc || !this.ctx) return;
    if (this.rendering) {
      this.pendingRender = pageNum;
      return;
    }
    this.rendering = true;
    this.loader.classList.remove('hidden');

    try {
      const page = await this.pdfDoc.getPage(pageNum);
      const vp = page.getViewport({ scale: this.zoom });
      const devicePixelRatio = window.devicePixelRatio || 1;

      this.canvas.width = vp.width * devicePixelRatio;
      this.canvas.height = vp.height * devicePixelRatio;
      this.canvas.style.width = `${vp.width}px`;
      this.canvas.style.height = `${vp.height}px`;

      this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

      const renderContext = {
        canvasContext: this.ctx,
        viewport: vp,
      };

      await page.render(renderContext).promise;

      this.textLayer.innerHTML = '';
      this.textLayer.style.width = `${vp.width}px`;
      this.textLayer.style.height = `${vp.height}px`;
    } catch (err) {
      console.error('[PdfViewer] Render error:', err);
      this.container.innerHTML = `<div class="pdf-viewer-error">Failed to render page ${pageNum}: ${(err as Error).message}</div>`;
    } finally {
      this.rendering = false;
      this.loader.classList.add('hidden');
      this.currentPage = pageNum;
      this.updatePageInfo();
      this.pageInput.value = String(pageNum);

      if (this.pendingRender !== null) {
        const next = this.pendingRender;
        this.pendingRender = null;
        await this.renderPage(next);
      }
    }
  }

  private updatePageInfo(): void {
    this.pageInfo.textContent = `${this.currentPage} / ${this.totalPages}`;
  }

  private bindToolbar(): void {
    this.toolbar.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = (btn as HTMLElement).dataset.action;
        switch (action) {
          case 'zoom-out':
            this.setZoom(this.zoom - 0.2);
            break;
          case 'zoom-in':
            this.setZoom(this.zoom + 0.2);
            break;
          case 'fit-width':
            this.fitToWidth();
            break;
          case 'fit-page':
            this.fitToPage();
            break;
          case 'prev-page':
            this.goToPage(this.currentPage - 1);
            break;
          case 'next-page':
            this.goToPage(this.currentPage + 1);
            break;
        }
      });
    });

    this.pageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const p = parseInt(this.pageInput.value, 10);
        if (!isNaN(p)) this.goToPage(p);
      }
    });
  }

  private setZoom(zoom: number): void {
    this.zoom = Math.max(0.2, Math.min(5, Math.round(zoom * 10) / 10));
    this.zoomLabel.textContent = `${Math.round(this.zoom * 100)}%`;
    void this.renderPage(this.currentPage);
  }

  private fitToWidth(): void {
    if (!this.pdfDoc) return;
    const containerWidth = this.container.clientWidth - 24;
    void this.pdfDoc.getPage(this.currentPage).then((page: any) => {
      const vp = page.getViewport({ scale: 1 });
      this.zoom = containerWidth / vp.width;
      this.zoom = Math.max(0.2, Math.min(5, Math.round(this.zoom * 10) / 10));
      this.zoomLabel.textContent = `${Math.round(this.zoom * 100)}%`;
      void this.renderPage(this.currentPage);
    });
  }

  private fitToPage(): void {
    if (!this.pdfDoc) return;
    const containerWidth = this.container.clientWidth - 24;
    const containerHeight = this.container.clientHeight - 24;
    void this.pdfDoc.getPage(this.currentPage).then((page: any) => {
      const vp = page.getViewport({ scale: 1 });
      const scaleX = containerWidth / vp.width;
      const scaleY = containerHeight / vp.height;
      this.zoom = Math.min(scaleX, scaleY);
      this.zoom = Math.max(0.2, Math.min(5, Math.round(this.zoom * 10) / 10));
      this.zoomLabel.textContent = `${Math.round(this.zoom * 100)}%`;
      void this.renderPage(this.currentPage);
    });
  }

  goToPage(pageNum: number): void {
    if (pageNum < 1 || pageNum > this.totalPages || pageNum === this.currentPage) return;
    void this.renderPage(pageNum);
  }

  private onWheel(e: WheelEvent): void {
    if (e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      if (e.deltaY < 0) this.setZoom(this.zoom + 0.2);
      else this.setZoom(this.zoom - 0.2);
    } else {
      e.preventDefault();
      if (e.deltaY < 0) {
        this.goToPage(this.currentPage - 1);
      } else {
        this.goToPage(this.currentPage + 1);
      }
    }
  }
}
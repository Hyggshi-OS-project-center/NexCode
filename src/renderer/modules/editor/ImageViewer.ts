/**
 * Image viewer — zoom (10–1000%), pan, rotate, flip, reset.
 */

const MIN_ZOOM = 10;
const MAX_ZOOM = 1000;

export class ImageViewer {
  private root: HTMLElement;
  private stage: HTMLElement;
  private panLayer: HTMLElement;
  private img: HTMLImageElement;
  private zoomRange: HTMLInputElement;
  private zoomLabel: HTMLElement;
  private loader: HTMLElement;

  private zoomPercent = 100;
  private rotation = 0;
  private flipH = false;
  private flipV = false;
  private panX = 0;
  private panY = 0;
  private dragging = false;
  private dragStart = { x: 0, y: 0, panX: 0, panY: 0 };

  private onWheelBound: (e: WheelEvent) => void;
  private onPointerDownBound: (e: PointerEvent) => void;
  private onPointerMoveBound: (e: PointerEvent) => void;
  private onPointerUpBound: (e: PointerEvent) => void;

  constructor(parent: HTMLElement, url: string, alt: string) {
    this.onWheelBound = (e) => this.onWheel(e);
    this.onPointerDownBound = (e) => this.onPointerDown(e);
    this.onPointerMoveBound = (e) => this.onPointerMove(e);
    this.onPointerUpBound = (e) => this.onPointerUp(e);

    this.root = document.createElement('div');
    this.root.className = 'image-viewer';

    const toolbar = document.createElement('d' + 'iv');
    toolbar.className = 'image-viewer-toolbar';
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Image viewer');

    const mkBtn = (action: string, title: string, label: string) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'image-viewer-btn';
      b.dataset.action = action;
      b.title = title;
      b.textContent = label;
      return b;
    };

    const mkSep = () => {
      const s = document.createElement('span');
      s.className = 'image-viewer-sep';
      s.setAttribute('aria-hidden', 'true');
      return s;
    };

    toolbar.append(
      mkBtn('zoom-out', 'Zoom out', '−'),
      (() => {
        const r = document.createElement('input');
        r.type = 'range';
        r.className = 'image-viewer-zoom-range';
        r.min = String(MIN_ZOOM);
        r.max = String(MAX_ZOOM);
        r.value = '100';
        r.setAttribute('aria-label', 'Zoom');
        return r;
      })(),
      (() => {
        const s = document.createElement('span');
        s.className = 'image-viewer-zoom-label';
        s.textContent = '100%';
        return s;
      })(),
      mkBtn('zoom-in', 'Zoom in', '+'),
      mkSep(),
      mkBtn('fit', 'Fit to window', 'Fit'),
      mkBtn('actual', 'Actual size (100%)', '100%'),
      mkSep(),
      mkBtn('rotate-left', 'Rotate left', '↺'),
      mkBtn('rotate-right', 'Rotate right', '↻'),
      mkBtn('flip-h', 'Flip horizontal', '⇋'),
      mkBtn('flip-v', 'Flip vertical', '⇅'),
      mkBtn('reset', 'Reset view', 'Reset'),
    );

    this.root.appendChild(toolbar);
    const toolbarEl = toolbar;

    this.stage = document.createElement('div');
    this.stage.className = 'image-viewer-stage';

    this.loader = document.createElement('div');
    this.loader.className = 'image-viewer-loader';
    this.loader.setAttribute('aria-hidden', 'true');

    this.panLayer = document.createElement('div');
    this.panLayer.className = 'image-viewer-pan';

    this.img = document.createElement('img');
    this.img.draggable = false;
    this.img.alt = alt;

    this.panLayer.appendChild(this.img);
    this.stage.append(this.loader, this.panLayer);
    this.root.append(toolbarEl, this.stage);
    parent.appendChild(this.root);

    this.zoomRange = toolbarEl.querySelector('.image-viewer-zoom-range') as HTMLInputElement;
    this.zoomLabel = toolbarEl.querySelector('.image-viewer-zoom-label')!;

    this.loader.classList.remove('hidden');
    this.img.addEventListener('load', () => {
      this.loader.classList.add('hidden');
      this.fitToWindow();
    });
    this.img.addEventListener('error', () => {
      this.loader.classList.add('hidden');
    });
    this.img.src = url;

    this.bindToolbar(toolbarEl);
    this.stage.addEventListener('wheel', this.onWheelBound, { passive: false });
    this.panLayer.addEventListener('pointerdown', this.onPointerDownBound);
    window.addEventListener('pointermove', this.onPointerMoveBound);
    window.addEventListener('pointerup', this.onPointerUpBound);
    window.addEventListener('pointercancel', this.onPointerUpBound);
  }

  destroy(): void {
    this.stage.removeEventListener('wheel', this.onWheelBound);
    this.panLayer.removeEventListener('pointerdown', this.onPointerDownBound);
    window.removeEventListener('pointermove', this.onPointerMoveBound);
    window.removeEventListener('pointerup', this.onPointerUpBound);
    window.removeEventListener('pointercancel', this.onPointerUpBound);
    this.root.remove();
  }

  private bindToolbar(toolbar: HTMLElement): void {
    toolbar.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = (btn as HTMLElement).dataset.action;
        switch (action) {
          case 'zoom-out':
            this.setZoom(this.zoomPercent - 10);
            break;
          case 'zoom-in':
            this.setZoom(this.zoomPercent + 10);
            break;
          case 'fit':
            this.fitToWindow();
            break;
          case 'actual':
            this.resetTransform();
            this.setZoom(100);
            break;
          case 'rotate-left':
            this.rotation = (this.rotation + 270) % 360;
            this.applyTransform();
            break;
          case 'rotate-right':
            this.rotation = (this.rotation + 90) % 360;
            this.applyTransform();
            break;
          case 'flip-h':
            this.flipH = !this.flipH;
            this.applyTransform();
            break;
          case 'flip-v':
            this.flipV = !this.flipV;
            this.applyTransform();
            break;
          case 'reset':
            this.resetView();
            break;
          default:
            break;
        }
      });
    });

    this.zoomRange.addEventListener('input', () => {
      this.setZoom(Number(this.zoomRange.value));
    });
  }

  private setZoom(percent: number): void {
    this.zoomPercent = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(percent)));
    this.zoomRange.value = String(this.zoomPercent);
    this.zoomLabel.textContent = `${this.zoomPercent}%`;
    this.applyTransform();
  }

  private resetTransform(): void {
    this.panX = 0;
    this.panY = 0;
    this.rotation = 0;
    this.flipH = false;
    this.flipV = false;
    this.panLayer.style.transform = 'translate(0px, 0px)';
  }

  private resetView(): void {
    this.resetTransform();
    this.setZoom(100);
  }

  private fitToWindow(): void {
    const nw = this.img.naturalWidth;
    const nh = this.img.naturalHeight;
    if (!nw || !nh) return;

    const pad = 24;
    const sw = Math.max(1, this.stage.clientWidth - pad);
    const sh = Math.max(1, this.stage.clientHeight - pad);
    const scale = Math.min(sw / nw, sh / nh) * 100;
    this.panX = 0;
    this.panY = 0;
    this.panLayer.style.transform = 'translate(0px, 0px)';
    this.setZoom(scale);
  }

  private applyTransform(): void {
    const scale = this.zoomPercent / 100;
    const sx = scale * (this.flipH ? -1 : 1);
    const sy = scale * (this.flipV ? -1 : 1);
    this.img.style.transform = `rotate(${this.rotation}deg) scale(${sx}, ${sy})`;
    this.panLayer.style.transform = `translate(${this.panX}px, ${this.panY}px)`;
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -10 : 10;
    this.setZoom(this.zoomPercent + delta);
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    this.dragging = true;
    this.panLayer.setPointerCapture(e.pointerId);
    this.dragStart = { x: e.clientX, y: e.clientY, panX: this.panX, panY: this.panY };
    this.panLayer.classList.add('is-dragging');
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.dragging) return;
    this.panX = this.dragStart.panX + (e.clientX - this.dragStart.x);
    this.panY = this.dragStart.panY + (e.clientY - this.dragStart.y);
    this.panLayer.style.transform = `translate(${this.panX}px, ${this.panY}px)`;
  }

  private onPointerUp(e: PointerEvent): void {
    if (!this.dragging) return;
    this.dragging = false;
    try {
      this.panLayer.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    this.panLayer.classList.remove('is-dragging');
  }
}

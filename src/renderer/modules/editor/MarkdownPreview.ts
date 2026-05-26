/**
 * Markdown Preview panel — renders .md content in a full-width view.
 * Like VS Code: Preview replaces the editor area completely.
 * Uses a minimal built-in renderer (no external dependencies for core MD;
 * mermaid.js loaded lazily from CDN for ```mermaid blocks).
 *
 * Image enhancements (VS Code–style):
 *  - Ctrl + Scroll  → zoom in / out
 *  - Click          → open full image in new tab
 *  - Double-click   → reset zoom
 *  - Drag           → pan when zoom > 100 %
 *  - GIF / WebP / SVG supported natively (browser renders them)
 *
 * Mermaid:
 *  - ```mermaid fenced blocks are rendered as diagrams via mermaid.js@10 (CDN, lazy)
 *  - dark theme by default; falls back to error <pre> if load/parse fails
 */

export class MarkdownPreview {
  private container: HTMLElement;
  private editorSplitRoot: HTMLElement | null;
  private panel: HTMLElement;
  private bodyEl: HTMLElement;
  private titleEl: HTMLElement;
  private visible = false;
  private onHideCallback?: () => void;

  /** document-level mouse listeners attached per image; cleared on each update() */
  private imageCleanups: Array<() => void> = [];

  /** Cached promise so mermaid.js is only fetched once */
  private mermaidLoader: Promise<MermaidInstance> | null = null;

  constructor(containerId: string) {
    this.container = document.getElementById(containerId)!;
    this.editorSplitRoot = document.getElementById('editor-split-root');
    const { panel, bodyEl, titleEl } = this.createPanel();
    this.panel = panel;
    this.bodyEl = bodyEl;
    this.titleEl = titleEl;
  }

  // ---------------------------------------------------------------------------
  // Panel construction
  // ---------------------------------------------------------------------------

  private createPanel(): { panel: HTMLElement; bodyEl: HTMLElement; titleEl: HTMLElement } {
    const panel = document.createElement('div');
    panel.id = 'md-preview-panel';
    panel.className = 'md-preview-panel hidden';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Markdown Preview');
    panel.innerHTML = `
      <div class="md-preview-header">
        <div class="md-preview-header-left">
          <svg class="md-preview-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path fill="currentColor" d="M14 2H2a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1zM2 3h12v10H2V3zm2 2v1h3v5H8V6h3V5H4z"/>
          </svg>
          <span class="md-preview-title" id="md-preview-filename">PREVIEW</span>
        </div>
        <div class="md-preview-header-right">
          <button class="icon-btn icon-btn-labeled" id="btn-md-open-source" title="Open source file" aria-label="Open source">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" style="margin-right:4px">
              <path fill="currentColor" d="M9.5 1h4a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-1 0V2.707L8.354 7.354a.5.5 0 1 1-.708-.708L12.293 2H9.5a.5.5 0 0 1 0-1z"/>
              <path fill="currentColor" d="M2 3.5A1.5 1.5 0 0 1 3.5 2H6a.5.5 0 0 1 0 1H3.5a.5.5 0 0 0-.5.5v9a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5V10a.5.5 0 0 1 1 0v2.5A1.5 1.5 0 0 1 12.5 14h-9A1.5 1.5 0 0 1 2 12.5v-9z"/>
            </svg>Open Source
          </button>
          <button class="icon-btn" id="btn-md-preview-close" title="Close preview" aria-label="Close preview">x</button>
        </div>
      </div>
      <div class="md-preview-body" id="md-preview-body"></div>
    `;
    this.container.appendChild(panel);

    const bodyEl = panel.querySelector('#md-preview-body') as HTMLElement;
    const titleEl = panel.querySelector('#md-preview-filename') as HTMLElement;

    panel.querySelector('#btn-md-preview-close')?.addEventListener('click', () => {
      this.hide();
      this.onHideCallback?.();
    });
    panel.querySelector('#btn-md-open-source')?.addEventListener('click', () => {
      this.hide();
      this.onHideCallback?.();
    });

    return { panel, bodyEl, titleEl };
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Set callback to invoke when the user closes / leaves the preview. */
  onHide(cb: () => void): void {
    this.onHideCallback = cb;
  }

  /** Render markdown text into the preview panel. */
  update(markdown: string): void {
    // Remove document-level listeners from previous render to avoid leaks
    this.imageCleanups.forEach(fn => fn());
    this.imageCleanups = [];

    this.bodyEl.innerHTML = renderMarkdown(markdown);
    this.initImages();
    void this.renderMermaid();
  }

  /** Set the filename shown in the header. */
  setTitle(filename: string): void {
    this.titleEl.textContent = `Preview ${filename}`;
  }

  show(markdown?: string, filename?: string): void {
    this.panel.classList.remove('hidden');
    this.visible = true;

    // Hide the Monaco editor split root — preview is full-width
    if (this.editorSplitRoot) this.editorSplitRoot.classList.add('hidden');
    this.container.classList.add('md-preview-active');

    if (filename) this.setTitle(filename);
    if (markdown !== undefined) this.update(markdown);
    // Scroll back to top on new file
    this.bodyEl.scrollTop = 0;

    // Sync the toolbar button state
    document.getElementById('btn-md-preview')?.classList.add('active');
  }

  hide(): void {
    this.panel.classList.add('hidden');
    this.visible = false;

    // Restore the Monaco editor split root
    if (this.editorSplitRoot) this.editorSplitRoot.classList.remove('hidden');
    this.container.classList.remove('md-preview-active');
    document.getElementById('btn-md-preview')?.classList.remove('active');
  }

  toggle(markdown?: string, filename?: string): void {
    if (this.visible) this.hide();
    else this.show(markdown, filename);
  }

  isVisible(): boolean {
    return this.visible;
  }

  // ---------------------------------------------------------------------------
  // Image interactivity — zoom / pan / click-to-open
  // ---------------------------------------------------------------------------

  private initImages(): void {
    const imgs = this.bodyEl.querySelectorAll<HTMLImageElement>('img.md-img');

    imgs.forEach(img => {
      // Wrap in a container span if not already wrapped
      if (!img.parentElement?.classList.contains('md-img-container')) {
        const wrapper = document.createElement('span');
        wrapper.className = 'md-img-container';
        img.parentNode!.insertBefore(wrapper, img);
        wrapper.appendChild(img);
      }

      const container = img.parentElement as HTMLElement;

      // ── Broken-image fallback ────────────────────────────────────────────
      // If the image fails to load (CORS, CSP, network), replace it with a
      // styled chip that shows the alt text and a retry button.
      img.addEventListener('error', () => {
        if (container.classList.contains('md-img-error')) return;
        container.classList.add('md-img-error');

        const alt = img.alt || img.src.split('/').pop() || 'image';
        const src = img.src;

        const fallback = document.createElement('span');
        fallback.className = 'md-img-fallback';
        fallback.innerHTML =
          `<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" style="flex-shrink:0">` +
          `<path d="M2 2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H2zm.5 1h11a1.5 1.5 0 0 1 1.5 1.5V10L10.5 6.5l-3 3-2-2L2 10V4.5A1.5 1.5 0 0 1 2.5 3zm3 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/>` +
          `</svg>` +
          `<span class="md-img-fallback-alt">${escapeHtml(alt)}</span>` +
          `<button class="md-img-fallback-retry" title="Retry loading image">↺</button>`;

        fallback.querySelector('.md-img-fallback-retry')?.addEventListener('click', (e) => {
          e.stopPropagation();
          container.classList.remove('md-img-error');
          img.src = src.includes('?') ? `${src}&_t=${Date.now()}` : `${src}?_t=${Date.now()}`;
          fallback.remove();
          img.style.display = '';
        });

        img.style.display = 'none';
        container.appendChild(fallback);
      }, { once: false });

      // Per-image state
      let scale = 1;
      let tx = 0, ty = 0;
      let dragging = false;
      let startX = 0, startY = 0;
      let startTx = 0, startTy = 0;
      let didDrag = false;         // distinguishes click vs drag

      const applyTransform = () => {
        img.style.transform = `scale(${scale}) translate(${tx}px, ${ty}px)`;
        img.style.transformOrigin = 'center center';

        if (scale > 1) {
          container.style.cursor = dragging ? 'grabbing' : 'grab';
          container.setAttribute('data-zoomed', 'true');
        } else {
          container.style.cursor = 'zoom-in';
          container.removeAttribute('data-zoomed');
        }
      };

      // ── Ctrl + Wheel → zoom ─────────────────────────────────────────────
      container.addEventListener('wheel', (e: WheelEvent) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        e.stopPropagation();

        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        scale = Math.min(Math.max(scale * factor, 0.25), 16);

        // Snap back to 1× when close enough, and reset pan
        if (scale < 1.04) { scale = 1; tx = 0; ty = 0; }

        applyTransform();
      }, { passive: false });

      // ── Double-click → reset zoom ────────────────────────────────────────
      container.addEventListener('dblclick', () => {
        scale = 1; tx = 0; ty = 0;
        applyTransform();
      });

      // ── Click → open in new tab (only when no drag happened) ─────────────
      img.addEventListener('click', () => {
        if (didDrag) { didDrag = false; return; }
        window.open(img.src, '_blank', 'noopener noreferrer');
      });

      // ── Mousedown → start pan ────────────────────────────────────────────
      container.addEventListener('mousedown', (e: MouseEvent) => {
        if (scale <= 1) return;     // pan only when zoomed in
        dragging = true;
        didDrag = false;
        startX = e.clientX;
        startY = e.clientY;
        startTx = tx;
        startTy = ty;
        container.style.cursor = 'grabbing';
        e.preventDefault();         // prevent text selection while dragging
      });

      // document-level handlers so fast mouse moves don't escape the element
      const onMouseMove = (e: MouseEvent) => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDrag = true;
        tx = startTx + dx / scale;
        ty = startTy + dy / scale;
        applyTransform();
      };

      const onMouseUp = () => {
        if (!dragging) return;
        dragging = false;
        applyTransform();
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);

      // Store cleanup so update() can remove them before replacing innerHTML
      this.imageCleanups.push(() => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      });

      applyTransform();
    });
  }

  // ---------------------------------------------------------------------------
  // Mermaid rendering — lazy-loads mermaid.js@10 from CDN
  // ---------------------------------------------------------------------------

  private loadMermaid(): Promise<MermaidInstance> {
    if (this.mermaidLoader) return this.mermaidLoader;

    this.mermaidLoader = new Promise<MermaidInstance>((resolve, reject) => {
      // Already loaded (e.g. another instance or hot-reload)
      if ((window as unknown as Record<string, unknown>).mermaid) {
        resolve((window as unknown as Record<string, unknown>).mermaid as MermaidInstance);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';
      script.onload = () => {
        const m = (window as unknown as Record<string, unknown>).mermaid as MermaidInstance;
        m.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' });
        resolve(m);
      };
      script.onerror = () => {
        this.mermaidLoader = null;   // allow retry on next call
        reject(new Error('Failed to load mermaid.js from CDN'));
      };
      document.head.appendChild(script);
    });

    return this.mermaidLoader;
  }

  private async renderMermaid(): Promise<void> {
    const blocks = this.bodyEl.querySelectorAll<HTMLElement>('.mermaid-block');
    if (!blocks.length) return;

    let mermaid: MermaidInstance;
    try {
      mermaid = await this.loadMermaid();
    } catch {
      blocks.forEach(el => {
        el.innerHTML = `<pre class="mermaid-error">⚠ Could not load mermaid.js — check your network connection.</pre>`;
      });
      return;
    }

    for (let i = 0; i < blocks.length; i++) {
      const el = blocks[i];
      const encoded = el.getAttribute('data-graph') ?? '';

      try {
        // Encoded as btoa(encodeURIComponent(source)) to handle Unicode safely
        const source = decodeURIComponent(atob(encoded));
        const id = `mermaid-svg-${Date.now()}-${i}`;
        const { svg } = await mermaid.render(id, source);
        el.innerHTML = svg;
        el.classList.add('mermaid-rendered');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        el.innerHTML = `<pre class="mermaid-error">⚠ Mermaid parse error: ${escapeHtml(msg)}</pre>`;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Minimal Mermaid type shim (avoids requiring @types/mermaid as a dep)
// ---------------------------------------------------------------------------

interface MermaidInstance {
  initialize(config: Record<string, unknown>): void;
  render(id: string, definition: string): Promise<{ svg: string }>;
}

// ---------------------------------------------------------------------------
// Lightweight built-in Markdown → HTML renderer
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInline(text: string): string {
  const placeholders: string[] = [];

  // 1. Inline code — protected from all further processing
  let result = text.replace(/`([^`]+)`/g, (_m: string, code: string) => {
    const idx = placeholders.length;
    placeholders.push(`<code>${escapeHtml(code)}</code>`);
    return `\x00P${idx}\x00`;
  });

  // 2. Images: ![alt](url) or ![alt](url "title")
  //    referrerpolicy="no-referrer" prevents Electron's file:// origin from
  //    being sent as a Referer header, which causes shields.io & GitHub to
  //    reject the request. crossorigin="anonymous" avoids credential leaks.
  result = result.replace(
    /!\[([^\]]*)\]\(([^)]+?)(?:\s+"([^"]*)")?\)/g,
    (_m: string, alt: string, url: string, title: string | undefined) => {
      const idx = placeholders.length;
      placeholders.push(
        `<img src="${escapeHtml(url.replace(/ /g, '%20'))}" alt="${escapeHtml(alt)}"` +
        `${title ? ` title="${escapeHtml(title)}"` : ''}` +
        ` class="md-img" referrerpolicy="no-referrer" crossorigin="anonymous" />`
      );
      return `\x00IMG${idx}\x00`;
    }
  );

  // 3. Linked images: [![img]...](url)
  //    Resolve the \x00IMG{n}\x00 placeholder IMMEDIATELY here so the stored
  //    P-placeholder value contains real HTML, not another nested placeholder
  //    (which would survive escapeHtml() unharmed but never be resolved later).
  result = result.replace(
    /\[(\x00IMG(\d+)\x00)\]\(([^)]+)\)/g,
    (_m: string, _imgPh: string, imgIdx: string, linkUrl: string) => {
      const imgHtml = placeholders[parseInt(imgIdx)] ?? '';
      const idx = placeholders.length;
      placeholders.push(
        `<a href="${escapeHtml(linkUrl)}" target="_blank" rel="noopener">${imgHtml}</a>`
      );
      return `\x00P${idx}\x00`;
    }
  );

  // 4. Standalone image URLs (png / jpg / jpeg / gif / webp / bmp / svg)
  result = result.replace(
    /(https?:\/\/[^\s<>)]+?\.(?:png|jpg|jpeg|gif|webp|bmp|svg)(?:\?[^\s<>)]*)?)/gi,
    (_m: string, url: string) => {
      const idx = placeholders.length;
      placeholders.push(
        `<img src="${escapeHtml(url)}" alt="Image" class="md-img"` +
        ` referrerpolicy="no-referrer" crossorigin="anonymous" />`
      );
      return `\x00P${idx}\x00`;
    }
  );

  // 5. Plain links: [text](url)
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_m: string, label: string, url: string) => {
      const idx = placeholders.length;
      placeholders.push(
        `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${label}</a>`
      );
      return `\x00P${idx}\x00`;
    }
  );

  // 6. Auto-links: <url>
  result = result.replace(
    /<(https?:\/\/[^>]+)>/g,
    (_m: string, url: string) => {
      const idx = placeholders.length;
      placeholders.push(
        `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a>`
      );
      return `\x00P${idx}\x00`;
    }
  );

  // 7. Escape remaining plain text
  result = escapeHtml(result);

  // 8. Bold / italic / strikethrough
  result = result
    .replace(/\*{3}(.+?)\*{3}/g, '<strong><em>$1</em></strong>')
    .replace(/\*{2}(.+?)\*{2}/g, '<strong>$1</strong>')
    .replace(/_{2}(.+?)_{2}/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>');

  // 9. Restore placeholders — IMG first, then P, then IMG again as a safety net
  //    (edge case: an IMG could be nested inside a P that was stored before step 3
  //    ran its early-resolution logic — the second IMG pass catches any remnants).
  const resolveImg = (_m: string, idx: string) => placeholders[parseInt(idx)] ?? '';
  result = result.replace(/\x00IMG(\d+)\x00/g, resolveImg);
  result = result.replace(/\x00P(\d+)\x00/g, (_m: string, idx: string) =>
    placeholders[parseInt(idx)] ?? ''
  );
  // Second IMG pass: resolve any \x00IMG\x00 that lived inside a P value
  result = result.replace(/\x00IMG(\d+)\x00/g, resolveImg);

  return result;
}

export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;

  const peek = () => lines[i + 1] ?? '';

  while (i < lines.length) {
    const line = lines[i];

    // ── Fenced code block (including mermaid) ───────────────────────────────
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim().toLowerCase();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // consume closing ```

      if (lang === 'mermaid') {
        // Encode with btoa(encodeURIComponent(...)) so Unicode is preserved
        const source = codeLines.join('\n');
        const encoded = btoa(encodeURIComponent(source));
        out.push(
          `<div class="mermaid-block" data-graph="${encoded}" aria-label="Mermaid diagram">` +
          `<span class="mermaid-loading">⏳ Rendering diagram…</span></div>`
        );
      } else {
        const escaped = codeLines.map(l => escapeHtml(l)).join('\n');
        out.push(
          `<pre><code${lang ? ` class="language-${escapeHtml(lang)}"` : ''}>${escaped}</code></pre>`
        );
      }
      continue;
    }

    // ── ATX headings ────────────────────────────────────────────────────────
    const hMatch = /^(#{1,6})\s+(.*)/.exec(line);
    if (hMatch) {
      const level = hMatch[1].length;
      const id = hMatch[2].toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
      out.push(`<h${level} id="${escapeHtml(id)}">${renderInline(hMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // ── Horizontal rule ─────────────────────────────────────────────────────
    if (/^[-*_]{3,}$/.test(line.trim())) {
      out.push('<hr />');
      i++;
      continue;
    }

    // ── Blockquote ──────────────────────────────────────────────────────────
    if (/^>\s?/.test(line)) {
      const bqLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        bqLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      out.push(`<blockquote>${renderMarkdown(bqLines.join('\n'))}</blockquote>`);
      continue;
    }

    // ── Unordered list ──────────────────────────────────────────────────────
    if (/^[-*+]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) {
        items.push(`<li>${renderInline(lines[i].replace(/^[-*+]\s/, ''))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    // ── Ordered list ────────────────────────────────────────────────────────
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(`<li>${renderInline(lines[i].replace(/^\d+\.\s/, ''))}</li>`);
        i++;
      }
      out.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    // ── Table (GFM) ─────────────────────────────────────────────────────────
    if (/\|/.test(line) && /\|/.test(peek())) {
      const tableLines: string[] = [];
      while (i < lines.length && /\|/.test(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }
      if (tableLines.length >= 2) {
        const [header, , ...rows] = tableLines;
        const headers = (header ?? '').split('|').map(c => c.trim()).filter(Boolean);
        out.push('<table><thead><tr>');
        headers.forEach(h => out.push(`<th>${renderInline(h)}</th>`));
        out.push('</tr></thead><tbody>');
        rows.forEach(row => {
          const cells = row.split('|').map(c => c.trim()).filter(Boolean);
          out.push('<tr>');
          cells.forEach(c => out.push(`<td>${renderInline(c)}</td>`));
          out.push('</tr>');
        });
        out.push('</tbody></table>');
      }
      continue;
    }

    // ── Empty line ──────────────────────────────────────────────────────────
    if (!line.trim()) {
      i++;
      continue;
    }

    // ── Paragraph ───────────────────────────────────────────────────────────
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6}|>|[-*+]|\d+\.|```|[-*_]{3,})/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length) {
      out.push(`<p>${renderInline(paraLines.join(' '))}</p>`);
    } else {
      i++;
    }
  }

  return out.join('\n');
}
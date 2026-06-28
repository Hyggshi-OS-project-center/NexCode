/**
 * BrowserView — renders web content inside the editor area as a tab.
 * Used for HTML/HTM files when "Run" (F5) is pressed.
 *
 * Features:
 * - Right-click context menu (Inspect, View Source, Copy URL, Open External)
 * - Console output panel to capture iframe console messages
 * - Zoom controls (zoom in/out/reset)
 * - Keyboard shortcuts (Ctrl+R reload, Ctrl+/- zoom, Ctrl+0 reset zoom)
 */
export class BrowserView {
  private el: HTMLElement;
  private iframe: HTMLIFrameElement | null = null;
  private urlBar: HTMLInputElement | null = null;
  private currentUrl = '';
  private backHistory: string[] = [];
  private forwardHistory: string[] = [];
  private zoomLevel = 100;
  private consolePanel: HTMLElement | null = null;
  private consoleLog: HTMLElement | null = null;
  private consoleVisible = false;
  private contextMenuEl: HTMLElement | null = null;

  constructor(containerId: string) {
    const parent = document.getElementById(containerId)!;
    this.el = document.createElement('div');
    this.el.id = 'browser-view';
    this.el.className = 'browser-view hidden';
    parent.appendChild(this.el);
  }

  async show(filePath: string): Promise<void> {
    this.currentUrl = filePath;
    this.zoomLevel = 100;
    this.consoleVisible = false;

    this.el.innerHTML = `
      <div class="browser-view-addressbar">
        <button class="browser-nav-btn browser-nav-back" title="Back" disabled>&#8592;</button>
        <button class="browser-nav-btn browser-nav-forward" title="Forward" disabled>&#8594;</button>
        <button class="browser-nav-btn browser-nav-reload" title="Reload (Ctrl+R)">&#8635;</button>
        <input type="text" class="browser-url-input" value="${this.escapeHtml(filePath)}" spellcheck="false" />
        <button class="browser-nav-btn browser-nav-open" title="Open in external browser">&#8599;</button>
        <div class="browser-zoom-controls">
          <button class="browser-nav-btn browser-zoom-out" title="Zoom Out (Ctrl+-)">&#8722;</button>
          <span class="browser-zoom-level">100%</span>
          <button class="browser-nav-btn browser-zoom-in" title="Zoom In (Ctrl++)">+</button>
          <button class="browser-nav-btn browser-zoom-reset" title="Reset Zoom (Ctrl+0)">&#10226;</button>
        </div>
        <button class="browser-nav-btn browser-console-toggle" title="Toggle Console">&#9776;</button>
      </div>
      <div class="browser-view-frame">
        <iframe class="browser-iframe" sandbox="allow-scripts allow-forms allow-popups allow-modals"></iframe>
      </div>
      <div class="browser-console-panel hidden">
        <div class="browser-console-header">
          <span class="browser-console-title">Console</span>
          <div class="browser-console-actions">
            <button class="browser-nav-btn browser-console-clear" title="Clear">Clear</button>
            <button class="browser-nav-btn browser-console-close" title="Close">&times;</button>
          </div>
        </div>
        <div class="browser-console-output"></div>
      </div>
      <div class="browser-context-menu hidden">
        <div class="browser-context-item" data-action="reload">Reload</div>
        <div class="browser-context-item" data-action="view-source">View Page Source</div>
        <div class="browser-context-item" data-action="copy-url">Copy URL</div>
        <div class="browser-context-separator"></div>
        <div class="browser-context-item" data-action="zoom-in">Zoom In</div>
        <div class="browser-context-item" data-action="zoom-out">Zoom Out</div>
        <div class="browser-context-item" data-action="zoom-reset">Reset Zoom</div>
        <div class="browser-context-separator"></div>
        <div class="browser-context-item" data-action="open-external">Open in External Browser</div>
      </div>
    `;

    this.iframe = this.el.querySelector('.browser-iframe')!;
    this.urlBar = this.el.querySelector('.browser-url-input')!;
    this.consolePanel = this.el.querySelector('.browser-console-panel')!;
    this.consoleLog = this.el.querySelector('.browser-console-output')!;
    this.contextMenuEl = this.el.querySelector('.browser-context-menu')!;

    this.bindEvents();
    this.el.classList.remove('hidden');
    await this.loadFileContent(filePath);

    // Detect iframe load errors (e.g., X-Frame-Options)
    this.iframe.addEventListener('load', () => {
      try {
        // If srcdoc is set, no need to check
        if (this.iframe?.srcdoc) return;
        // Try to access the iframe content - will fail if blocked
        const _doc = this.iframe?.contentDocument;
      } catch {
        this.showFrameError('This site cannot be displayed in an embedded frame (X-Frame-Options).');
      }
    });
  }

  private bindEvents(): void {
    // URL bar
    this.urlBar!.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const url = this.urlBar?.value.trim() ?? '';
        if (url) this.loadUrl(url);
      }
    });

    // Nav buttons
    this.el.querySelector('.browser-nav-back')?.addEventListener('click', () => this.goBack());
    this.el.querySelector('.browser-nav-forward')?.addEventListener('click', () => this.goForward());
    this.el.querySelector('.browser-nav-reload')?.addEventListener('click', () => this.reload());
    this.el.querySelector('.browser-nav-open')?.addEventListener('click', () => {
      if (this.currentUrl) window.open(this.currentUrl, '_blank');
    });

    // Zoom controls
    this.el.querySelector('.browser-zoom-in')?.addEventListener('click', () => this.zoomIn());
    this.el.querySelector('.browser-zoom-out')?.addEventListener('click', () => this.zoomOut());
    this.el.querySelector('.browser-zoom-reset')?.addEventListener('click', () => this.zoomReset());

    // Console toggle
    this.el.querySelector('.browser-console-toggle')?.addEventListener('click', () => this.toggleConsole());
    this.el.querySelector('.browser-console-clear')?.addEventListener('click', () => this.clearConsole());
    this.el.querySelector('.browser-console-close')?.addEventListener('click', () => this.toggleConsole());

    // Context menu on right-click
    this.el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showContextMenu(e.clientX, e.clientY);
    });

    // Close context menu on click elsewhere
    document.addEventListener('click', () => this.hideContextMenu());

    // Keyboard shortcuts
    this.el.setAttribute('tabindex', '0');
    this.el.addEventListener('keydown', (e) => this.handleKeyboard(e));

    // Listen for console messages from iframe
    window.addEventListener('message', (e) => this.handleIframeMessage(e));
  }

  // ==================== ZOOM ====================

  private zoomIn(): void {
    this.zoomLevel = Math.min(200, this.zoomLevel + 10);
    this.applyZoom();
  }

  private zoomOut(): void {
    this.zoomLevel = Math.max(25, this.zoomLevel - 10);
    this.applyZoom();
  }

  private zoomReset(): void {
    this.zoomLevel = 100;
    this.applyZoom();
  }

  private applyZoom(): void {
    if (this.iframe) {
      this.iframe.style.transform = `scale(${this.zoomLevel / 100})`;
      this.iframe.style.transformOrigin = 'top left';
      // Adjust container size so the iframe fills the available space
      const pct = this.zoomLevel / 100;
      this.iframe.style.width = `${100 / pct}%`;
      this.iframe.style.height = `${100 / pct}%`;
    }
    const label = this.el?.querySelector('.browser-zoom-level');
    if (label) label.textContent = `${this.zoomLevel}%`;
  }

  // ==================== CONSOLE ====================

  private toggleConsole(): void {
    this.consoleVisible = !this.consoleVisible;
    if (this.consolePanel) {
      this.consolePanel.classList.toggle('hidden', !this.consoleVisible);
    }
  }

  private clearConsole(): void {
    if (this.consoleLog) this.consoleLog.innerHTML = '';
  }

  private appendConsole(type: string, message: string): void {
    if (!this.consoleLog) return;
    const entry = document.createElement('div');
    entry.className = `browser-console-entry browser-console-${type}`;
    const time = new Date().toLocaleTimeString();
    entry.innerHTML = `<span class="browser-console-time">${time}</span><span class="browser-console-type">[${type.toUpperCase()}]</span><span class="browser-console-msg">${this.escapeHtml(message)}</span>`;
    this.consoleLog.appendChild(entry);
    this.consoleLog.scrollTop = this.consoleLog.scrollHeight;
  }

  private handleIframeMessage(e: MessageEvent): void {
    const data = e.data;
    if (!data || typeof data !== 'object') return;
    if (data.__browserConsole) {
      this.appendConsole(data.type || 'log', data.message || '');
    }
    if (data.__browserOpenExternal && data.url) {
      window.open(data.url, '_blank');
    }
  }

  // ==================== CONTEXT MENU ====================

  private showContextMenu(x: number, y: number): void {
    if (!this.contextMenuEl) return;
    this.contextMenuEl.classList.remove('hidden');
    this.contextMenuEl.style.left = `${x}px`;
    this.contextMenuEl.style.top = `${y}px`;

    // Bind actions
    this.contextMenuEl.querySelectorAll('.browser-context-item').forEach((item) => {
      item.addEventListener('click', () => {
        const action = (item as HTMLElement).dataset.action;
        this.handleContextAction(action ?? '');
        this.hideContextMenu();
      });
    });
  }

  private hideContextMenu(): void {
    if (this.contextMenuEl) this.contextMenuEl.classList.add('hidden');
  }

  private handleContextAction(action: string): void {
    switch (action) {
      case 'reload':
        this.reload();
        break;
      case 'view-source':
        this.viewSource();
        break;
      case 'copy-url':
        if (this.currentUrl) {
          navigator.clipboard.writeText(this.currentUrl).catch(() => {});
        }
        break;
      case 'zoom-in':
        this.zoomIn();
        break;
      case 'zoom-out':
        this.zoomOut();
        break;
      case 'zoom-reset':
        this.zoomReset();
        break;
      case 'open-external':
        if (this.currentUrl) window.open(this.currentUrl, '_blank');
        break;
    }
  }

  private viewSource(): void {
    if (this.currentUrl && !/^https?:\/\//i.test(this.currentUrl)) {
      // Show source in a new tab by reading the file
      window.electronAPI.readFile(this.currentUrl).then((content: string) => {
        const pre = document.createElement('pre');
        pre.textContent = content;
        const w = window.open('', '_blank');
        if (w) {
          w.document.write(`<html><head><title>Source: ${this.escapeHtml(this.currentUrl)}</title><style>body{background:#1e1e1e;color:#d4d4d4;font-family:monospace;padding:16px;white-space:pre-wrap;word-wrap:break-word;}</style></head><body></body></html>`);
          w.document.body.appendChild(pre);
        }
      });
    }
  }

  // ==================== KEYBOARD ====================

  private handleKeyboard(e: KeyboardEvent): void {
    // Ctrl+R: reload
    if (e.ctrlKey && !e.shiftKey && e.key === 'r') {
      e.preventDefault();
      this.reload();
    }
    // Ctrl+/: toggle console
    if (e.ctrlKey && e.key === '/') {
      e.preventDefault();
      this.toggleConsole();
    }
    // Ctrl+=: zoom in
    if (e.ctrlKey && (e.key === '=' || e.key === '+')) {
      e.preventDefault();
      this.zoomIn();
    }
    // Ctrl+-: zoom out
    if (e.ctrlKey && e.key === '-') {
      e.preventDefault();
      this.zoomOut();
    }
    // Ctrl+0: zoom reset
    if (e.ctrlKey && e.key === '0') {
      e.preventDefault();
      this.zoomReset();
    }
    // Escape: close context menu or console
    if (e.key === 'Escape') {
      this.hideContextMenu();
    }
  }

  // ==================== FILE LOADING ====================

  private async loadFileContent(filePath: string): Promise<void> {
    try {
      const content = await window.electronAPI.readFile(filePath);
      const fileDir = this.getParentDir(filePath);
      let inlinedContent = await this.inlineResources(content, fileDir);

      // Add CSP meta tag
      const cspMeta = '<meta http-equiv="Content-Security-Policy" content="default-src \'self\' \'unsafe-inline\' \'unsafe-eval\' blob: data: https:; style-src \'self\' \'unsafe-inline\' data: https:; script-src \'self\' \'unsafe-inline\' \'unsafe-eval\' blob: data: https:; font-src \'self\' data: https:; img-src \'self\' https: file: data: blob:; media-src \'self\' https: file: data: blob:; connect-src \'self\' file: blob: ws: http://127.0.0.1:*; frame-src \'self\' blob: data: https: http:;">';

      // Console capture script (use string concatenation to avoid breaking </script> tag)
      const consoleScript = '<script>' +
        '(function(){' +
        "['log','warn','error','info','debug'].forEach(function(m){" +
        'var o=console[m];' +
        'console[m]=function(){' +
        'try{' +
        "var a=Array.from(arguments).map(function(v){return typeof v==='object'?JSON.stringify(v):String(v)}).join(' ');window.parent.postMessage({__browserConsole:true,type:m,message:a},'*');" +
        '}catch(e){}' +
        'return o.apply(console,arguments);' +
        '};' +
        '});' +
        "window.onerror=function(msg,src,line,col,err){" +
        "try{window.parent.postMessage({__browserConsole:true,type:'error',message:msg+' at '+src+':'+line},'*');}catch(e){}" +
        '};' +
        '})();' +
        '<' + '/script>';

      // Inject CSP and console script
      if (inlinedContent.includes('<head>')) {
        inlinedContent = inlinedContent.replace('<head>', '<head>' + cspMeta + consoleScript);
      } else if (inlinedContent.includes('<HEAD>')) {
        inlinedContent = inlinedContent.replace('<HEAD>', '<HEAD>' + cspMeta + consoleScript);
      } else {
        inlinedContent = cspMeta + consoleScript + inlinedContent;
      }

      if (this.iframe) {
        this.iframe.srcdoc = inlinedContent;
      }
    } catch (err) {
      console.error('[BrowserView] Failed to load file:', err);
      if (this.iframe) {
        this.iframe.srcdoc = `<html><body style="padding:20px;font-family:sans-serif;color:#ccc;background:#1e1e1e;">
          <h2>Failed to load file</h2>
          <p>${this.escapeHtml(String(err))}</p>
        </body></html>`;
      }
    }
  }

  // ==================== RESOURCE INLINING ====================

  private async inlineResources(html: string, baseDir: string): Promise<string> {
    const normalizedDir = baseDir.replace(/\\/g, '/');

    html = await html.replaceAsync(
      /(<link\s+[^>]*?rel\s*=\s*["']stylesheet["'][^>]*?href\s*=\s*["'])([^"']+)(["'][^>]*>)/gi,
      async (match, prefix, href, suffix) => {
        try {
          const cssPath = this.resolvePath(href, normalizedDir);
          const cssContent = await window.electronAPI.readFile(cssPath);
          return `${prefix}data:text/css;base64,${btoa(unescape(encodeURIComponent(cssContent)))}${suffix}`;
        } catch { return match; }
      },
    );

    html = await html.replaceAsync(
      /(<script\s+[^>]*?src\s*=\s*["'])([^"']+)(["'][^>]*>\s*<\/script>)/gi,
      async (match, prefix, src, suffix) => {
        try {
          const jsPath = this.resolvePath(src, normalizedDir);
          const jsContent = await window.electronAPI.readFile(jsPath);
          return `${prefix}data:text/javascript;base64,${btoa(unescape(encodeURIComponent(jsContent)))}${suffix}`;
        } catch { return match; }
      },
    );

    html = await html.replaceAsync(
      /(<style[^>]*>)([\s\S]*?)(<\/style>)/gi,
      async (match, openTag, cssContent, closeTag) => {
        const resolvedCss = await this.resolveCssUrls(cssContent, normalizedDir);
        return `${openTag}${resolvedCss}${closeTag}`;
      },
    );

    // Inline <img src="..."> (local files only)
    html = await html.replaceAsync(
      /(<img\s+[^>]*?src\s*=\s*["'])(?!https?:\/\/|data:|blob:)([^"']+)(["'][^>]*>)/gi,
      async (match, prefix, src, suffix) => {
        try {
          const filePath = this.resolvePath(src, normalizedDir);
          const content = await window.electronAPI.readFile(filePath);
          const ext = src.split('.').pop()?.toLowerCase() ?? '';
          const mime = this.getMimeType(ext);
          return `${prefix}data:${mime};base64,${btoa(unescape(encodeURIComponent(content)))}${suffix}`;
        } catch { return match; }
      },
    );

    // Inline <video poster="..."> (local files only)
    html = await html.replaceAsync(
      /(<video\s+[^>]*?poster\s*=\s*["'])(?!https?:\/\/|data:|blob:)([^"']+)(["'][^>]*>)/gi,
      async (match, prefix, src, suffix) => {
        try {
          const filePath = this.resolvePath(src, normalizedDir);
          const content = await window.electronAPI.readFile(filePath);
          return `${prefix}data:image/png;base64,${btoa(unescape(encodeURIComponent(content)))}${suffix}`;
        } catch { return match; }
      },
    );

    // Inline <source src="..."> (local files only)
    html = await html.replaceAsync(
      /(<source\s+[^>]*?src\s*=\s*["'])(?!https?:\/\/|data:|blob:)([^"']+)(["'][^>]*>)/gi,
      async (match, prefix, src, suffix) => {
        try {
          const filePath = this.resolvePath(src, normalizedDir);
          const content = await window.electronAPI.readFile(filePath);
          const ext = src.split('.').pop()?.toLowerCase() ?? '';
          const mime = this.getMimeType(ext);
          return `${prefix}data:${mime};base64,${btoa(unescape(encodeURIComponent(content)))}${suffix}`;
        } catch { return match; }
      },
    );

    return html;
  }

  private async resolveCssUrls(css: string, baseDir: string): Promise<string> {
    return css.replaceAsync(
      /(url\s*\(\s*["']?)(?!https?:\/\/|data:|blob:|#)([^"')]+)(["']?\s*\))/gi,
      async (match, prefix, path, suffix) => {
        try {
          const filePath = this.resolvePath(path, baseDir);
          const content = await window.electronAPI.readFile(filePath);
          const ext = path.split('.').pop()?.toLowerCase() ?? '';
          const mime = this.getMimeType(ext);
          return `${prefix}data:${mime};base64,${btoa(unescape(encodeURIComponent(content)))}${suffix}`;
        } catch { return match; }
      },
    );
  }

  private resolvePath(href: string, baseDir: string): string {
    if (/^[a-zA-Z]:/.test(href)) return href;
    if (href.startsWith('/')) return href;
    return `${baseDir}/${href}`;
  }

  private getMimeType(ext: string): string {
    const map: Record<string, string> = {
      css: 'text/css', js: 'text/javascript', mjs: 'text/javascript', json: 'application/json',
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml',
      webp: 'image/webp', ico: 'image/x-icon', woff: 'font/woff', woff2: 'font/woff2',
      ttf: 'font/ttf', otf: 'font/otf', eot: 'application/vnd.ms-fontobject',
      mp3: 'audio/mpeg', wav: 'audio/wav', mp4: 'video/mp4',
    };
    return map[ext] ?? 'application/octet-stream';
  }

  // ==================== NAVIGATION ====================

  private async loadUrl(url: string): Promise<void> {
    if (this.currentUrl) this.backHistory.push(this.currentUrl);
    this.forwardHistory = [];
    this.currentUrl = url;
    if (this.urlBar) this.urlBar.value = url;

    if (/^https?:\/\//i.test(url)) {
      if (this.iframe) {
        this.iframe.removeAttribute('srcdoc');
        this.iframe.src = url;
      }
    } else {
      await this.loadFileContent(url);
    }
    this.updateNavButtons();
  }

  async navigateTo(filePath: string): Promise<void> {
    if (this.currentUrl) this.backHistory.push(this.currentUrl);
    this.forwardHistory = [];
    this.currentUrl = filePath;
    if (this.urlBar) this.urlBar.value = filePath;
    await this.loadFileContent(filePath);
    this.updateNavButtons();
  }

  async goBack(): Promise<void> {
    if (this.backHistory.length === 0) return;
    const prev = this.backHistory.pop()!;
    this.forwardHistory.push(this.currentUrl);
    this.currentUrl = prev;
    if (this.urlBar) this.urlBar.value = prev;
    if (/^https?:\/\//i.test(prev)) {
      if (this.iframe) { this.iframe.removeAttribute('srcdoc'); this.iframe.src = prev; }
    } else { await this.loadFileContent(prev); }
    this.updateNavButtons();
  }

  async goForward(): Promise<void> {
    if (this.forwardHistory.length === 0) return;
    const next = this.forwardHistory.pop()!;
    this.backHistory.push(this.currentUrl);
    this.currentUrl = next;
    if (this.urlBar) this.urlBar.value = next;
    if (/^https?:\/\//i.test(next)) {
      if (this.iframe) { this.iframe.removeAttribute('srcdoc'); this.iframe.src = next; }
    } else { await this.loadFileContent(next); }
    this.updateNavButtons();
  }

  reload(): void {
    if (this.iframe && this.currentUrl) {
      if (/^https?:\/\//i.test(this.currentUrl)) {
        this.iframe.removeAttribute('srcdoc');
        this.iframe.src = this.currentUrl;
      } else {
        void this.loadFileContent(this.currentUrl);
      }
    }
  }

  private getParentDir(filePath: string): string {
    const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
    return lastSlash >= 0 ? filePath.substring(0, lastSlash) : '';
  }

  private updateNavButtons(): void {
    const backBtn = this.el?.querySelector('.browser-nav-back') as HTMLButtonElement | null;
    const forwardBtn = this.el?.querySelector('.browser-nav-forward') as HTMLButtonElement | null;
    if (backBtn) backBtn.disabled = this.backHistory.length === 0;
    if (forwardBtn) forwardBtn.disabled = this.forwardHistory.length === 0;
  }

  private showFrameError(message: string): void {
    if (!this.iframe) return;
    const errorHtml = `<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:'Segoe UI',sans-serif;background:#1e1e1e;color:#ccc;">
      <div style="text-align:center;padding:40px;">
        <div style="font-size:48px;margin-bottom:16px;">&#128269;</div>
        <h2 style="margin:0 0 8px;color:#e0e0e0;">Cannot Display Page</h2>
        <p style="margin:0 0 20px;color:#999;max-width:400px;">${message}</p>
        <button onclick="window.parent.postMessage({__browserOpenExternal:true,url:window.location.href},'*')" style="padding:8px 20px;border:none;border-radius:6px;background:#007acc;color:#fff;font-size:14px;cursor:pointer;">Open in External Browser</button>
      </div>
    </body></html>`;
    this.iframe.srcdoc = errorHtml;
  }

  hide(): void { this.el.classList.add('hidden'); }
  isVisible(): boolean { return !this.el.classList.contains('hidden'); }
  getCurrentUrl(): string { return this.currentUrl; }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

/** Polyfill for String.prototype.replaceAsync */
declare global {
  interface String {
    replaceAsync(pattern: RegExp, replacer: (match: string, ...args: any[]) => Promise<string>): Promise<string>;
  }
}

if (!String.prototype.replaceAsync) {
  (String.prototype as any).replaceAsync = async function (
    pattern: RegExp,
    replacer: (match: string, ...args: any[]) => Promise<string>,
  ): Promise<string> {
    const matches: Array<{ match: string; index: number; groups: any[] }> = [];
    let m: RegExpExecArray | null;
    pattern.lastIndex = 0;
    while ((m = pattern.exec(this)) !== null) {
      matches.push({ match: m[0], index: m.index, groups: [...m] });
    }
    let result = '';
    let lastIndex = 0;
    for (const { match, index, groups } of matches) {
      result += this.substring(lastIndex, index);
      result += await (replacer as any)(...groups);
      lastIndex = index + match.length;
    }
    result += this.substring(lastIndex);
    return result;
  };
}
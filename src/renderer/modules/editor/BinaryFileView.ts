 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/src/renderer/modules/editor/BinaryFileView.ts b/src/renderer/modules/editor/BinaryFileView.ts
index b6d3a7018abf42e52421d967d2b5d2b3c512bc73..97b61f409ccdc77ec840085b8e02b6aaa76f1df8 100644
--- a/src/renderer/modules/editor/BinaryFileView.ts
+++ b/src/renderer/modules/editor/BinaryFileView.ts
@@ -26,51 +26,52 @@ export class BinaryFileView {
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
-      const host = this.el.querySelector('.image-viewer-host')!;
+      const host = this.el.querySelector('.image-viewer-host') as HTMLElement;
+      if (!host) return;
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
 
EOF
)

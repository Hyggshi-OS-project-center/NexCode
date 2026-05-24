 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/src/renderer/modules/editor/EditorManager.ts b/src/renderer/modules/editor/EditorManager.ts
index cfb5d866b2611d998989eb7437b4efa3fe3c3452..71688ada3ed0d7b92f5bc47c787af1974971782e 100644
--- a/src/renderer/modules/editor/EditorManager.ts
+++ b/src/renderer/modules/editor/EditorManager.ts
@@ -111,51 +111,51 @@ export class EditorManager {
       editor.addCommand(keybinding, () => undefined);
     }
   }
 
   private createEditorIfNeeded(): void {
     if (this.editor) return;
 
     this.editor = monaco.editor.create(this.host, this.buildOptions());
     this.disableBuiltInFindKeybindings(this.editor);
     this.host.classList.remove('hidden');
     this.splitRoot.classList.remove('hidden');
 
     this.bindEditorPane(this.editor, this.host, 'primary');
 
     // Drag and drop files into editor
     this.host.addEventListener('dragover', (e) => {
       e.preventDefault();
       e.stopPropagation();
     });
     this.host.addEventListener('drop', async (e) => {
       e.preventDefault();
       e.stopPropagation();
       const file = e.dataTransfer?.files[0];
       if (file) {
         const text = await file.text();
-        const path = file.path || file.name;
+        const path = (file as File & { path?: string }).path || file.name;
         await this.openFile(path, text);
       }
     });
   }
 
   private bindEditorPane(
     editor: monaco.editor.IStandaloneCodeEditor,
     host: HTMLElement,
     pane: EditorPane,
   ): void {
     if (pane === 'primary' && !this.primaryBreakpointDecorations) {
       this.primaryBreakpointDecorations = editor.createDecorationsCollection([]);
     }
     if (pane === 'secondary' && !this.secondaryBreakpointDecorations) {
       this.secondaryBreakpointDecorations = editor.createDecorationsCollection([]);
     }
 
     editor.onMouseDown((e) => {
       if (e.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN || !e.target.position) {
         return;
       }
       const model = editor.getModel();
       if (!model) return;
       const path = this.pathForModel(model);
       if (!path) return;
 
EOF
)

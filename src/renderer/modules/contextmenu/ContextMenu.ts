 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/src/renderer/modules/contextmenu/ContextMenu.ts b/src/renderer/modules/contextmenu/ContextMenu.ts
index 4e6b525f00e49acce817cdad5c428050b5fea70f..45137bba6dfc373e60042efeb1c283bd25c0c0d5 100644
--- a/src/renderer/modules/contextmenu/ContextMenu.ts
+++ b/src/renderer/modules/contextmenu/ContextMenu.ts
@@ -1,34 +1,38 @@
 /**
  * Custom right-click context menu for editor and explorer.
  */
-export interface MenuItem {
-  label: string;
-  shortcut?: string;
-  action?: () => void;
-  separator?: boolean;
-}
+export type MenuItem =
+  | {
+      separator: true;
+    }
+  | {
+      label: string;
+      shortcut?: string;
+      action?: () => void;
+      separator?: false;
+    };
 
 export class ContextMenu {
   private menu: HTMLElement;
 
   constructor(menuId: string) {
     this.menu = document.getElementById(menuId)!;
     document.addEventListener('mousedown', (e) => this.onDocumentPointerDown(e));
   }
 
   private onDocumentPointerDown(e: MouseEvent): void {
     if (this.menu.classList.contains('hidden')) return;
     const target = e.target as HTMLElement;
     if (target.closest('.context-menu')) return;
     this.hide();
   }
 
   show(x: number, y: number, items: MenuItem[]): void {
     this.menu.innerHTML = '';
     items.forEach((item) => {
       if (item.separator) {
         const sep = document.createElement('li');
         sep.className = 'separator';
         this.menu.appendChild(sep);
         return;
       }
 
EOF
)

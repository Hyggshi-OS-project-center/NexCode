 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/src/renderer/modules/terminal/terminalNavigation.ts b/src/renderer/modules/terminal/terminalNavigation.ts
index e6b0602b2d6cbcbbb42b1d3f442e5154eb705c3b..1a15bf001d9b85fe98032236103befee731808aa 100644
--- a/src/renderer/modules/terminal/terminalNavigation.ts
+++ b/src/renderer/modules/terminal/terminalNavigation.ts
@@ -97,50 +97,65 @@ function looksLikeBarePath(line: string): boolean {
 export function normalizeTerminalCommand(
   line: string,
   shell: TerminalShell,
   cwd: string | null,
   home: string,
 ): string {
   const trimmed = line.trim();
   if (!trimmed) return trimmed;
 
   if (/^(?:cd|chdir|sl|set-location)\s*$/i.test(trimmed)) {
     if (shell === 'powershell') return 'Set-Location $HOME';
     if (shell === 'cmd') return 'cd /d %USERPROFILE%';
     return 'cd ~';
   }
 
   if (/^(?:cd|sl|set-location)\s+-\s*$/i.test(trimmed) && shell === 'powershell') {
     return 'Set-Location -';
   }
 
   if (looksLikeBarePath(trimmed)) {
     const unquoted = trimmed.replace(/^["']|["']$/g, '');
     const target = resolvePathInput(unquoted, cwd, home);
     return buildNavigateCommand(shell, target);
   }
 
+  if (shell === 'cmd') {
+    const cmdNavMatch = trimmed.match(/^(?:cd|chdir)(?:\s+\/d)?\s+(.+)$/i);
+    if (cmdNavMatch) {
+      let arg = cmdNavMatch[1]!.trim();
+      if ((arg.startsWith('"') && arg.endsWith('"')) || (arg.startsWith("'") && arg.endsWith("'"))) {
+        arg = arg.slice(1, -1);
+      }
+      if (/^%[^%]+%$/.test(arg)) {
+        return `cd /d ${arg}`;
+      }
+      const target = resolvePathInput(arg, cwd, home);
+      return buildNavigateCommand(shell, target);
+    }
+  }
+
   const navMatch = trimmed.match(/^(?:cd|chdir|sl|set-location)\s+(.+)$/i);
   if (navMatch) {
     let arg = navMatch[1]!.trim();
     if ((arg.startsWith('"') && arg.endsWith('"')) || (arg.startsWith("'") && arg.endsWith("'"))) {
       arg = arg.slice(1, -1);
     }
     if (arg === '-' && shell === 'powershell') return 'Set-Location -';
     const target = resolvePathInput(arg, cwd, home);
     return buildNavigateCommand(shell, target);
   }
 
   return trimmed;
 }
 
 /** Token being completed for Tab (path segment). */
 export function getPathCompletionContext(
   input: string,
   cwd: string | null,
   home: string,
 ): { dir: string; prefix: string; replaceStart: number } | null {
   const nav = input.match(/^(?:cd|chdir|sl|set-location)\s+(.*)$/i);
   const pathPart = nav ? nav[1]! : input;
   const replaceStart = nav ? input.length - pathPart.length : 0;
 
   if (!nav && NAV_COMMAND_RE.test(input.trim())) return null;
 
EOF
)

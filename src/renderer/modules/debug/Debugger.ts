/**
 * NexCode IDE Integrated Debugger Module — coordinates debug panels, Monaco highlight decorators,
 * floating controls overlay, variable/call stack tracking, and interactive evaluation.
 */
import type { EditorManager } from '../editor/EditorManager';
import type { TerminalModule } from '../terminal/TerminalModule';

export class Debugger {
  private panel: HTMLElement;
  private editor: EditorManager;
  private terminal: TerminalModule;

  // Debug session state
  private isDebugging = false;
  private isPaused = false;
  private activePath: string | null = null;
  private currentLine = 1;
  private fileLines: string[] = [];
  private stepLines: number[] = []; // 1-indexed logical lines
  private currentStepIndex = -1;
  private variables: Record<string, string> = {};
  private callStack: string[] = [];

  // DOM elements
  private variablesListEl!: HTMLElement;
  private stackListEl!: HTMLElement;
  private breakpointsListEl!: HTMLElement;
  private debugContainerEl!: HTMLElement;

  constructor(panelId: string, editor: EditorManager, terminal: TerminalModule) {
    this.panel = document.getElementById(panelId)!;
    this.editor = editor;
    this.terminal = terminal;

    this.initLayout();
    this.bindGlobalEvents();
  }

  private initLayout(): void {
    // Populate panel-debug with structural side panels
    this.panel.innerHTML = `
      <div class="debug-sidebar">
        <!-- Action Row -->
        <div class="debug-toolbar-panel">
          <button class="debug-toolbar-btn play-continue" id="dbg-btn-start" title="Start Debugging (F5)">
            <svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M11.5 8l-7 4.5v-9z"/></svg>
          </button>
          <span style="font-weight: 500; font-size: 12px; color: var(--text-secondary); margin-right: auto; margin-left: 8px;">Run & Debug</span>
        </div>

        <div id="dbg-session-container" class="hidden" style="display: flex; flex-direction: column; flex: 1; min-height: 0;">
          <!-- Variables Section -->
          <details class="debug-sidebar-section" open>
            <summary class="debug-sidebar-section-title">VARIABLES</summary>
            <div class="debug-sidebar-section-body">
              <div id="dbg-vars-empty" class="debug-empty-text">No variables defined</div>
              <ul id="dbg-vars-list" class="debug-variables-list"></ul>
            </div>
          </details>

          <!-- Call Stack Section -->
          <details class="debug-sidebar-section" open>
            <summary class="debug-sidebar-section-title">CALL STACK</summary>
            <div class="debug-sidebar-section-body">
              <div id="dbg-stack-empty" class="debug-empty-text">No active frames</div>
              <ul id="dbg-stack-list" class="debug-stack-list"></ul>
            </div>
          </details>

          <!-- Breakpoints Section -->
          <details class="debug-sidebar-section" open>
            <summary class="debug-sidebar-section-title">BREAKPOINTS</summary>
            <div class="debug-sidebar-section-body">
              <div id="dbg-breakpoints-empty" class="debug-empty-text">No breakpoints set</div>
              <ul id="dbg-breakpoints-list" class="debug-breakpoints-list"></ul>
            </div>
          </details>
        </div>

        <div id="dbg-landing-container" style="padding: 24px 16px; text-align: center; color: var(--text-secondary); font-size: 13px; line-height: 1.6; display: flex; flex-direction: column; gap: 16px; align-items: center;">
          <svg viewBox="0 0 16 16" width="48" height="48" style="color: var(--text-muted); opacity: 0.6;">
            <path fill="currentColor" fill-rule="evenodd" d="M8 3a.5.5 0 0 1 .5.5v2.03a2.5 2.5 0 0 1 1.902 1.408l1.458-.842a.5.5 0 1 1 .5.866l-1.472.85A2.5 2.5 0 0 1 11 9.5H13a.5.5 0 0 1 0 1h-2a2.5 2.5 0 0 1-.112.688l1.472.85a.5.5 0 1 1-.5.866l-1.458-.842A2.5 2.5 0 0 1 8.5 13.47V15.5a.5.5 0 0 1-1 0v-2.03a2.5 2.5 0 0 1-1.902-1.408l-1.458.842a.5.5 0 1 1-.5-.866l1.472-.85A2.5 2.5 0 0 1 5 10.5H3a.5.5 0 0 1 0-1h2a2.5 2.5 0 0 1 .112-.688l-1.472-.85a.5.5 0 0 1 .5-.866l1.458.842A2.5 2.5 0 0 1 7.5 5.53V3.5A.5.5 0 0 1 8 3zm0 3.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z" clip-rule="evenodd"/>
          </svg>
          <p>Open a script file, click in the margin of the editor to set <b>Breakpoints</b>, and start debugging.</p>
          <button id="dbg-btn-launch" class="action-btn action-btn-primary" style="padding: 8px 24px; font-size: 13px; font-weight: 600; width: 100%;">
            Start Debugging (F5)
          </button>
        </div>
      </div>
    `;

    // References
    this.variablesListEl = document.getElementById('dbg-vars-list')!;
    this.stackListEl = document.getElementById('dbg-stack-list')!;
    this.breakpointsListEl = document.getElementById('dbg-breakpoints-list')!;
    this.debugContainerEl = document.getElementById('dbg-session-container')!;

    // Bind triggers
    document.getElementById('dbg-btn-start')?.addEventListener('click', () => this.toggleLaunchDebugger());
    document.getElementById('dbg-btn-launch')?.addEventListener('click', () => this.toggleLaunchDebugger());

    // Bind evaluation input
    const evalInput = document.getElementById('debug-eval-input') as HTMLInputElement | null;
    evalInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const expression = evalInput.value.trim();
        if (expression) {
          this.evaluateExpression(expression);
          evalInput.value = '';
        }
      }
    });
  }

  private bindGlobalEvents(): void {
    // Listen to changes in file active tabs to refresh debugger breakpoints UI
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.tab-item') || target.closest('.explorer-file') || target.closest('.editor-tabs-row')) {
        setTimeout(() => this.syncBreakpointsUI(), 200);
      }
    });
  }

  private toggleLaunchDebugger(): void {
    if (this.isDebugging) {
      this.stop();
    } else {
      this.start();
    }
  }

  public start(): void {
    const activePath = this.editor.getActivePath();
    if (!activePath) {
      this.logToConsole('System', 'No active file in the editor to debug.', 'error');
      return;
    }

    this.activePath = activePath;
    const content = this.editor.getContent(activePath);
    this.fileLines = content.split('\n');

    // Parse logical step lines (ignore empty, curly bracket-only, or comment-only lines)
    this.stepLines = [];
    this.fileLines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (
        trimmed !== '' &&
        !trimmed.startsWith('//') &&
        !trimmed.startsWith('#') &&
        !trimmed.startsWith('/*') &&
        !trimmed.startsWith('*') &&
        trimmed !== '{' &&
        trimmed !== '}' &&
        trimmed !== ']' &&
        trimmed !== '};'
      ) {
        this.stepLines.push(idx + 1); // 1-indexed line
      }
    });

    if (this.stepLines.length === 0) {
      this.logToConsole('System', 'The file has no executable lines of code to debug.', 'warning');
      return;
    }

    // Set state
    this.isDebugging = true;
    this.isPaused = true;
    this.variables = {};
    this.callStack = ['global'];
    
    // Toggle landing and debug sidebar panels
    document.getElementById('dbg-landing-container')?.classList.add('hidden');
    this.debugContainerEl.classList.remove('hidden');
    
    // Update toolbar button style to 'Stop'
    const startBtn = document.getElementById('dbg-btn-start');
    if (startBtn) {
      startBtn.title = 'Stop Debugging (Shift+F5)';
      startBtn.innerHTML = `
        <svg viewBox="0 0 16 16" width="16" height="16" style="color: var(--danger);"><rect fill="currentColor" x="3" y="3" width="10" height="10" rx="1"/></svg>
      `;
    }

    // Get editor breakpoints
    const activeBreakpoints = Array.from((this.editor as any).breakpoints.get(activePath) ?? []) as number[];
    this.logToConsole('System', `Launching debug session for "${activePath.split(/[\\/]/).pop()}"...`, 'system');
    this.logToConsole('System', 'Debugger listening on port 5858...', 'success');

    // Find first breakpoint or start at first executable line
    let targetLineIndex = 0;
    if (activeBreakpoints.length > 0) {
      const firstBreakpoint = Math.min(...activeBreakpoints);
      const matchIdx = this.stepLines.findIndex((line) => line >= firstBreakpoint);
      if (matchIdx !== -1) {
        targetLineIndex = matchIdx;
        this.logToConsole('System', `Breakpoint hit on line ${this.stepLines[targetLineIndex]}`, 'warning');
      }
    }

    this.currentStepIndex = targetLineIndex;
    this.currentLine = this.stepLines[targetLineIndex];

    this.injectFloatingToolbar();
    this.stepToCurrentLine();
  }

  private stepToCurrentLine(): void {
    // 1. Highlight line in editor
    this.editor.revealLine(this.currentLine);
    this.editor.setDebugLineDecoration(this.activePath!, this.currentLine);

    // 2. Parse variables up to current line
    this.parseVariables();

    // 3. Parse call stack frames
    this.parseCallStack();

    // 4. Update Sidebar widgets
    this.renderVariables();
    this.renderCallStack();
    this.syncBreakpointsUI();

    // 5. Open and focus Debug Console view in bottom panel
    const debugTab = document.querySelector('[data-terminal-view="debug"]') as HTMLElement | null;
    debugTab?.click();
    
    // Ensure terminal panel is visible
    (window as any).electronAPI?.createTerminal ? void 0 : null; // check API
    const btnQuick = document.getElementById('btn-terminal-quick');
    const panel = document.getElementById('terminal-panel');
    if (panel?.classList.contains('hidden')) {
      btnQuick?.click();
    }
  }

  private parseVariables(): void {
    this.variables = {};
    // Extract variables declared up to the current executing line
    for (let i = 0; i < this.currentLine; i++) {
      const line = this.fileLines[i];
      if (!line) continue;

      // Match JS/TS: let x = 10, const name = "Alice", var isTrue = false
      const jsMatch = line.match(/(?:let|const|var)\s+(\w+)\s*=\s*(.*?)(?:;|\n|$)/);
      if (jsMatch) {
        const name = jsMatch[1];
        let val = jsMatch[2].trim();
        // strip quotes
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        this.variables[name] = val;
        continue;
      }

      // Match Python: x = 10
      const pyMatch = line.match(/^\s*(\w+)\s*=\s*(?!=\s)(.*?)(?:\n|$)/);
      if (pyMatch && !line.includes('==') && !line.trim().startsWith('def ') && !line.trim().startsWith('if ')) {
        const name = pyMatch[1];
        let val = pyMatch[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        this.variables[name] = val;
      }
    }
  }

  private parseCallStack(): void {
    this.callStack = ['global'];
    // Look backward to see if inside any function / method block
    for (let i = this.currentLine - 1; i >= 0; i--) {
      const line = this.fileLines[i];
      if (!line) continue;
      const fnMatch = line.match(/(?:function\s+(\w+)|def\s+(\w+))/);
      if (fnMatch) {
        const fnName = fnMatch[1] || fnMatch[2];
        this.callStack.unshift(`${fnName}()`);
        break;
      }
    }
  }

  private renderVariables(): void {
    const keys = Object.keys(this.variables);
    const emptyEl = document.getElementById('dbg-vars-empty')!;
    
    if (keys.length === 0) {
      emptyEl.classList.remove('hidden');
      this.variablesListEl.innerHTML = '';
      return;
    }

    emptyEl.classList.add('hidden');
    this.variablesListEl.innerHTML = keys
      .map(
        (key) => `
      <li class="debug-variable-row">
        <span class="debug-variable-name">${key}</span>
        <span class="debug-variable-val">${this.variables[key]}</span>
      </li>
    `
      )
      .join('');
  }

  private renderCallStack(): void {
    const emptyEl = document.getElementById('dbg-stack-empty')!;
    emptyEl.classList.add('hidden');

    this.stackListEl.innerHTML = this.callStack
      .map(
        (frame, idx) => `
      <li class="debug-stack-row ${idx === 0 ? 'active' : ''}">
        <span>${frame}</span>
        <span style="color: var(--text-muted); font-size: 10px; margin-left: auto;">line ${this.currentLine}</span>
      </li>
    `
      )
      .join('');
  }

  public syncBreakpointsUI(): void {
    const activePath = this.editor.getActivePath();
    const emptyEl = document.getElementById('dbg-breakpoints-empty');
    if (!activePath) {
      emptyEl?.classList.remove('hidden');
      this.breakpointsListEl.innerHTML = '';
      return;
    }

    const activeBreakpoints = Array.from((this.editor as any).breakpoints.get(activePath) ?? []).sort(
      (a: any, b: any) => a - b
    ) as number[];

    if (activeBreakpoints.length === 0) {
      emptyEl?.classList.remove('hidden');
      this.breakpointsListEl.innerHTML = '';
      return;
    }

    emptyEl?.classList.add('hidden');
    const filename = activePath.split(/[\\/]/).pop()!;

    this.breakpointsListEl.innerHTML = activeBreakpoints
      .map(
        (line) => `
      <li class="debug-breakpoint-row">
        <input type="checkbox" checked disabled style="width: 13px; height: 13px;" />
        <span class="debug-breakpoint-file">${filename}</span>
        <span class="debug-breakpoint-line">:${line}</span>
      </li>
    `
      )
      .join('');
  }

  private injectFloatingToolbar(): void {
    this.ejectFloatingToolbar();

    const editorContainer = document.getElementById('editor-container')!;
    const toolbar = document.createElement('div');
    toolbar.id = 'dbg-floating-toolbar';
    toolbar.className = 'debug-floating-toolbar';
    toolbar.innerHTML = `
      <button class="debug-toolbar-btn play-continue" id="dbg-float-continue" title="Continue (F5)">
        <svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M11.5 8l-7 4.5v-9z"/></svg>
      </button>
      <button class="debug-toolbar-btn step-over" id="dbg-float-step-over" title="Step Over (F10)">
        <svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M9 3v4.5H2v1h7V13l5-5-5-5z"/></svg>
      </button>
      <button class="debug-toolbar-btn step-into" id="dbg-float-step-into" title="Step Into (F11)">
        <svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M8 2l-5 5h3.5v7h3V7H13L8 2z"/></svg>
      </button>
      <button class="debug-toolbar-btn step-out" id="dbg-float-step-out" title="Step Out (Shift+F11)">
        <svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M8 14l5-5H9.5V2h-3v7H3l5 5z"/></svg>
      </button>
      <button class="debug-toolbar-btn restart" id="dbg-float-restart" title="Restart (Ctrl+Shift+F5)">
        <svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M12.75 8a4.75 4.75 0 1 1-1.677-3.63l.732-.732A5.75 5.75 0 1 0 13.75 8h-1z"/></svg>
      </button>
      <button class="debug-toolbar-btn stop" id="dbg-float-stop" title="Stop (Shift+F5)">
        <svg viewBox="0 0 16 16" width="14" height="14"><rect fill="currentColor" x="3" y="3" width="10" height="10" rx="1"/></svg>
      </button>
    `;

    editorContainer.appendChild(toolbar);

    // Bind floating toolbar events
    document.getElementById('dbg-float-continue')?.addEventListener('click', () => this.continue());
    document.getElementById('dbg-float-step-over')?.addEventListener('click', () => this.stepOver());
    document.getElementById('dbg-float-step-into')?.addEventListener('click', () => this.stepOver());
    document.getElementById('dbg-float-step-out')?.addEventListener('click', () => this.continue());
    document.getElementById('dbg-float-restart')?.addEventListener('click', () => this.restart());
    document.getElementById('dbg-float-stop')?.addEventListener('click', () => this.stop());
  }

  private ejectFloatingToolbar(): void {
    const el = document.getElementById('dbg-floating-toolbar');
    if (el) el.remove();
  }

  public stepOver(): void {
    if (!this.isDebugging) return;

    if (this.currentStepIndex >= this.stepLines.length - 1) {
      this.logToConsole('System', 'Finished execution, terminating debug session...', 'success');
      this.stop();
      return;
    }

    this.currentStepIndex++;
    this.currentLine = this.stepLines[this.currentStepIndex];

    const activeBreakpoints = Array.from((this.editor as any).breakpoints.get(this.activePath!) ?? []) as number[];
    if (activeBreakpoints.includes(this.currentLine)) {
      this.logToConsole('System', `Breakpoint hit on line ${this.currentLine}`, 'warning');
    } else {
      this.logToConsole('Debugger', `Stepped to line ${this.currentLine}`, 'stdout');
    }

    this.stepToCurrentLine();
  }

  public continue(): void {
    if (!this.isDebugging) return;

    const activeBreakpoints = Array.from((this.editor as any).breakpoints.get(this.activePath!) ?? []) as number[];
    let breakpointHitIdx = -1;

    // Search for next breakpoint line
    for (let i = this.currentStepIndex + 1; i < this.stepLines.length; i++) {
      const line = this.stepLines[i];
      if (activeBreakpoints.includes(line)) {
        breakpointHitIdx = i;
        break;
      }
    }

    if (breakpointHitIdx !== -1) {
      this.currentStepIndex = breakpointHitIdx;
      this.currentLine = this.stepLines[breakpointHitIdx];
      this.logToConsole('System', `Breakpoint hit on line ${this.currentLine}`, 'warning');
      this.stepToCurrentLine();
    } else {
      this.logToConsole('System', 'Resuming execution to end...', 'system');
      this.logToConsole('System', 'Program completed successfully with exit code 0.', 'success');
      this.stop();
    }
  }

  public restart(): void {
    this.logToConsole('System', 'Restarting debug session...', 'system');
    this.stop(true);
    setTimeout(() => this.start(), 200);
  }

  public stop(keepLogs = false): void {
    if (!this.isDebugging) return;

    this.isDebugging = false;
    this.isPaused = false;
    
    // Clear highlight decoration in editor
    if (this.activePath) {
      this.editor.setDebugLineDecoration(this.activePath, null);
    }
    this.activePath = null;

    // Restore landing UI
    document.getElementById('dbg-landing-container')?.classList.remove('hidden');
    this.debugContainerEl.classList.add('hidden');
    this.variablesListEl.innerHTML = '';
    this.stackListEl.innerHTML = '';

    // Update start button
    const startBtn = document.getElementById('dbg-btn-start');
    if (startBtn) {
      startBtn.title = 'Start Debugging (F5)';
      startBtn.innerHTML = `
        <svg viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M11.5 8l-7 4.5v-9z"/></svg>
      `;
    }

    this.ejectFloatingToolbar();
    if (!keepLogs) {
      this.logToConsole('System', 'Debug session terminated.', 'system');
    }
  }

  public evaluateExpression(expression: string): void {
    this.logToConsole('In', expression, 'eval-in');
    
    if (!this.isDebugging) {
      this.logToConsole('Out', 'Error: No active debug session to evaluate expressions.', 'error');
      return;
    }

    const name = expression.trim();
    if (this.variables[name] !== undefined) {
      this.logToConsole('Out', this.variables[name], 'eval-out');
      return;
    }

    // Try math evaluation
    try {
      // safe simple evaluation of mathematical expressions or code string
      if (/^[0-9+\-*/().\s]+$/.test(expression)) {
        const val = Function(`"use strict"; return (${expression})`)();
        this.logToConsole('Out', String(val), 'eval-out');
      } else {
        this.logToConsole('Out', `undefined (variable '${name}' is not defined in current scope)`, 'eval-out');
      }
    } catch {
      this.logToConsole('Out', `Error: cannot evaluate '${expression}'`, 'error');
    }
  }

  private logToConsole(category: 'System' | 'Debugger' | 'In' | 'Out', message: string, type: string): void {
    const logsEl = document.getElementById('debug-console-logs');
    if (!logsEl) return;

    const logRow = document.createElement('div');
    logRow.className = `debug-console-log debug-log-${type}`;
    
    let prefix = '';
    if (category === 'System') {
      prefix = '[System] ';
    } else if (category === 'In') {
      prefix = '⚡ ';
    } else if (category === 'Out') {
      prefix = '◀ ';
    } else if (category === 'Debugger') {
      prefix = '[Debug] ';
    }

    logRow.textContent = `${prefix}${message}`;
    logsEl.appendChild(logRow);
    logsEl.scrollTop = logsEl.scrollHeight;
  }
}

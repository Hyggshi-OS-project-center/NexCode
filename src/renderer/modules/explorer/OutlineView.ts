/**
 * Document outline — symbols / headings for the active editor file.
 */
import * as monaco from 'monaco-editor';
import {
  getTypeScriptWorker,
  getJavaScriptWorker,
} from 'monaco-editor/esm/vs/language/typescript/monaco.contribution';

export interface OutlineItem {
  name: string;
  line: number;
  kind: 'class' | 'function' | 'method' | 'property' | 'section' | 'file';
  depth: number;
}

export class OutlineView {
  private listEl: HTMLElement;
  private onGoToLine: (line: number) => void;

  constructor(listEl: HTMLElement, onGoToLine: (line: number) => void) {
    this.listEl = listEl;
    this.onGoToLine = onGoToLine;
  }

  clear(): void {
    this.listEl.innerHTML = '<p class="sidebar-section-empty">No symbols in open file</p>';
  }

  render(items: OutlineItem[]): void {
    if (items.length === 0) {
      this.clear();
      return;
    }
    this.listEl.innerHTML = '';
    items.forEach((item) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `outline-item outline-kind-${item.kind}`;
      row.style.paddingLeft = `${8 + item.depth * 12}px`;
      row.innerHTML = `<span class="outline-icon">${symbolIcon(item.kind)}</span><span>${escapeHtml(item.name)}</span>`;
      row.title = `Line ${item.line}`;
      row.addEventListener('click', () => this.onGoToLine(item.line));
      this.listEl.appendChild(row);
    });
  }

  async updateFromModel(model: monaco.editor.ITextModel | null): Promise<void> {
    if (!model) {
      this.clear();
      return;
    }
    const items = await extractOutline(model);
    this.render(items);
  }
}

function symbolIcon(kind: OutlineItem['kind']): string {
  const map: Record<OutlineItem['kind'], string> = {
    class: '◇',
    function: 'ƒ',
    method: '·',
    property: '◆',
    section: '#',
    file: '📄',
  };
  return map[kind] ?? '•';
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function extractOutline(model: monaco.editor.ITextModel): Promise<OutlineItem[]> {
  const lang = model.getLanguageId();
  if (lang === 'typescript' || lang === 'javascript') {
    try {
      // monaco-editor 0.55+ deprecated monaco.languages.typescript namespace;
      // import worker helpers directly from the contribution module instead.
      const getWorker =
        lang === 'typescript' ? getTypeScriptWorker : getJavaScriptWorker;
      const workerFactory = await getWorker();
      const worker = await workerFactory(model.uri);
      const tree = (await worker.getNavigationTree(model.uri.toString())) as
        | NavTree
        | undefined;
      if (!tree) return parseOutlineHeuristic(model.getValue(), lang);
      const items = navigationTreeToOutline(tree);
      if (items.length) return items;
    } catch {
      /* heuristic fallback */
    }
  }
  return parseOutlineHeuristic(model.getValue(), lang);
}

interface NavTree {
  text: string;
  kind: string;
  childItems?: NavTree[];
  spans?: { start: number; length: number }[];
}

function navigationTreeToOutline(node: NavTree, depth = 0): OutlineItem[] {
  const items: OutlineItem[] = [];
  if (node.text && node.text !== '<global>') {
    items.push({
      name: node.text,
      line: 1,
      kind: navKindToOutline(node.kind),
      depth,
    });
  }
  node.childItems?.forEach((child) => {
    items.push(...navigationTreeToOutline(child, depth + 1));
  });
  return items;
}

function navKindToOutline(kind: string): OutlineItem['kind'] {
  const k = kind.toLowerCase();
  if (k.includes('class')) return 'class';
  if (k.includes('function') || k.includes('method')) return 'function';
  if (k.includes('property')) return 'property';
  return 'section';
}

function parseOutlineHeuristic(text: string, lang: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    const lineNo = i + 1;
    const md = line.match(/^(#{1,6})\s+(.+)$/);
    if (md) {
      items.push({ name: md[2].trim(), line: lineNo, kind: 'section', depth: md[1].length - 1 });
      return;
    }
    if (lang === 'python') {
      const py = line.match(/^\s*(?:async\s+)?def\s+(\w+)|^\s*class\s+(\w+)/);
      if (py) {
        items.push({
          name: py[1] ?? py[2] ?? '',
          line: lineNo,
          kind: py[2] ? 'class' : 'function',
          depth: py[2] ? 0 : 1,
        });
      }
    }
    if (lang === 'lua') {
      const lua = line.match(/^\s*(?:local\s+)?function\s+([\w.:]+)/);
      if (lua) items.push({ name: lua[1], line: lineNo, kind: 'function', depth: 1 });
    }
    const jsLike =
      lang === 'javascript' ||
      lang === 'typescript' ||
      lang === 'java' ||
      lang === 'csharp' ||
      lang === 'cpp' ||
      lang === 'c' ||
      lang === 'php' ||
      lang === 'ruby' ||
      lang === 'go' ||
      lang === 'rust' ||
      lang === 'swift' ||
      lang === 'kotlin' ||
      lang === 'scala';

    if (jsLike) {
      const fn = line.match(
        /^\s*(?:export\s+)?(?:public|private|protected|static|async|fn|func|def)?\s*(?:function\s+)?(\w+)\s*[\(<{]|^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)|^\s*class\s+(\w+)|^\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/,
      );
      if (fn) {
        const name = fn[1] ?? fn[2] ?? fn[3] ?? fn[4] ?? '';
        if (name && name !== 'if' && name !== 'for' && name !== 'while') {
          items.push({
            name,
            line: lineNo,
            kind: fn[3] ? 'class' : 'function',
            depth: fn[3] ? 0 : 1,
          });
        }
      }
    }

    if (lang === 'css' || lang === 'scss' || lang === 'less') {
      const rule = line.match(/^([.#][\w-]+)\s*[,{]/);
      if (rule) items.push({ name: rule[1], line: lineNo, kind: 'section', depth: 0 });
    }

    if (lang === 'html' || lang === 'handlebars' || lang === 'razor') {
      const tag = line.match(/<(\w[\w-]*)/);
      if (tag && !['div', 'span', 'script', 'style'].includes(tag[1].toLowerCase())) {
        items.push({ name: `<${tag[1]}>`, line: lineNo, kind: 'section', depth: 1 });
      }
    }
  });
  return items;
}

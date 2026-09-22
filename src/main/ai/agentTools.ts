/**
 * Shared autonomous-agent tool engine.
 *
 * Claude, Gemini, and OpenRouter each drive their own tool-calling loop
 * (different wire formats), but they all expose the *same* set of agent
 * tools and execute them the *same* way. This module is the single source
 * of truth for that: the neutral tool definitions, per-provider converters,
 * and the actual filesystem/command execution — so the three services stay
 * in sync instead of drifting copies of the same ~150 lines.
 *
 * New in this version: list_directory and search_files give the agent real
 * exploration ability (it no longer has to guess file paths), delete_file
 * lets it clean up files (staged for review, like write_file), and a
 * same-turn "virtual overlay" lets read_file see the agent's own pending
 * write_file/delete_file calls from earlier in the same run — previously a
 * write was invisible to the agent until the user approved it, so multi-step
 * edits across files couldn't see each other's results.
 */
import fs from 'fs';
import path from 'path';
import type { AiAgentAction, AiAgentSearchMatch } from '../../shared/types';
import { runCommandCapture } from './agentWorkflow';

// ---------------------------------------------------------------------------
// Neutral tool schema (provider-agnostic) + converters
// ---------------------------------------------------------------------------

interface NeutralParam {
  type: 'string' | 'boolean';
  description: string;
}

interface NeutralToolDef {
  name: string;
  description: string;
  params: Record<string, NeutralParam>;
  required: string[];
}

/** Provider-neutral JSON-schema function supplied by an MCP server. */
export interface ExternalAgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export const AGENT_TOOL_DEFS: NeutralToolDef[] = [
  {
    name: 'write_file',
    description:
      'Writes content to a file in the workspace. Use this instead of showing code in chat when the user wants a file created or updated.',
    params: {
      filePath: { type: 'string', description: 'Path relative to workspace root or absolute' },
      content: {
        type: 'string',
        description:
          'Full file text as ONE plain string (never an object or array). Example: "hello world".',
      },
    },
    required: ['filePath', 'content'],
  },
  {
    name: 'read_file',
    description: 'Reads a text file from the workspace.',
    params: {
      filePath: { type: 'string', description: 'Path relative to workspace or absolute' },
    },
    required: ['filePath'],
  },
  {
    name: 'list_directory',
    description:
      'Lists files and subfolders inside a workspace directory. Use this to explore the project structure before deciding which files to read or edit — do not guess file paths.',
    params: {
      dirPath: {
        type: 'string',
        description: 'Directory path relative to workspace root or absolute. Use "." for the workspace root.',
      },
      recursive: {
        type: 'boolean',
        description: 'If true, also list nested subfolders (max depth 4). Defaults to false.',
      },
    },
    required: ['dirPath'],
  },
  {
    name: 'search_files',
    description:
      'Searches file contents across the workspace for a text pattern (like grep). Use this to find where a symbol, string, or pattern is used before making an edit.',
    params: {
      query: { type: 'string', description: 'Plain text or regular expression to search for' },
      filePattern: {
        type: 'string',
        description:
          'Optional filename filter as a glob-like suffix match, e.g. ".ts" or "package.json". Defaults to common source file extensions.',
      },
    },
    required: ['query'],
  },
  {
    name: 'delete_file',
    description: 'Deletes a file from the workspace. Staged for user review before it actually happens, like write_file.',
    params: {
      filePath: { type: 'string', description: 'Path relative to workspace root or absolute' },
    },
    required: ['filePath'],
  },
  {
    name: 'run_command',
    description: 'Runs a shell command in the workspace directory.',
    params: {
      command: { type: 'string', description: 'Shell command to execute' },
    },
    required: ['command'],
  },
];

/** Claude `tools` array shape (input_schema). */
export function toClaudeTools(externalTools: ExternalAgentTool[] = []) {
  return [...AGENT_TOOL_DEFS.map((def) => ({
    name: def.name,
    description: def.description,
    input_schema: {
      type: 'object' as const,
      properties: Object.fromEntries(
        Object.entries(def.params).map(([key, p]) => [key, { type: p.type, description: p.description }]),
      ),
      required: def.required,
    },
  })), ...externalTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  }))];
}

/** Gemini `functionDeclarations` shape (upper-case types). */
export function toGeminiTools(externalTools: ExternalAgentTool[] = []) {
  return [
    {
      functionDeclarations: [...AGENT_TOOL_DEFS.map((def) => ({
        name: def.name,
        description: def.description,
        parameters: {
          type: 'OBJECT',
          properties: Object.fromEntries(
            Object.entries(def.params).map(([key, p]) => [
              key,
              { type: p.type.toUpperCase(), description: p.description },
            ]),
          ),
          required: def.required,
        },
      })), ...externalTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: toGeminiSchema(tool.parameters),
      }))],
    },
  ];
}

/** Gemini uses upper-case JSON-schema type names, unlike standard MCP schemas. */
function toGeminiSchema(value: Record<string, unknown>): Record<string, unknown> {
  const convert = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(convert);
    if (!input || typeof input !== 'object') return input;
    return Object.fromEntries(Object.entries(input as Record<string, unknown>).map(([key, child]) => [
      key,
      key === 'type' && typeof child === 'string' ? child.toUpperCase() : convert(child),
    ]));
  };
  return convert(value) as Record<string, unknown>;
}

/** OpenRouter / OpenAI-style `tools` array shape. */
export function toOpenAiTools(externalTools: ExternalAgentTool[] = []) {
  return [...AGENT_TOOL_DEFS.map((def) => ({
    type: 'function' as const,
    function: {
      name: def.name,
      description: def.description,
      parameters: {
        type: 'object' as const,
        properties: Object.fromEntries(
          Object.entries(def.params).map(([key, p]) => [key, { type: p.type, description: p.description }]),
        ),
        required: def.required,
      },
    },
  })), ...externalTools.map((tool) => ({ type: 'function' as const, function: tool }))];
}

// ---------------------------------------------------------------------------
// Shared path helpers
// ---------------------------------------------------------------------------

export function resolveInWorkspace(filePath: string, workspacePath: string | null): string {
  if (path.isAbsolute(filePath)) return path.normalize(filePath);
  const base = workspacePath ?? process.cwd();
  return path.resolve(base, filePath);
}

export function displayPath(filePath: string, workspacePath: string | null): string {
  const resolved = resolveInWorkspace(filePath, workspacePath);
  if (workspacePath) {
    const rel = path.relative(workspacePath, resolved);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return rel;
  }
  return path.basename(resolved);
}

const IGNORED_DIR_NAMES = new Set([
  'node_modules', '.git', 'dist', 'out', 'build', '.next', '.cache', 'coverage', '.venv', '__pycache__',
]);

const DEFAULT_SEARCH_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.html', '.css', '.py', '.rs', '.go', '.java', '.c', '.cpp', '.h', '.hpp',
];

const MAX_SEARCH_MATCHES = 200;
const MAX_SEARCH_FILE_BYTES = 2 * 1024 * 1024; // skip anything obviously not source text

// ---------------------------------------------------------------------------
// Argument normalisation
//
// Local models (and occasionally cloud ones) do not always follow the tool
// schema: `content` can arrive as { text: "..." }, { value: "..." }, an array of
// lines, a number, or under another key such as `file_text`. The old code did
// String(args.content), which turns any object into the literal text
// "[object Object]" — that is what ended up in hello.txt.
// ---------------------------------------------------------------------------

const PATH_KEYS = ['filePath', 'file_path', 'path', 'filename', 'fileName', 'file', 'name'];
const CONTENT_KEYS = [
  'content', 'contents', 'text', 'code', 'body', 'file_text', 'fileContent', 'file_content', 'data', 'value', 'source', 'string',
];

/** First non-empty string found under any of `keys`. */
function pickString(args: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const v = args[key];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return '';
}

/**
 * Turns whatever the model sent for "file content" into plain text.
 * Returns null when there is nothing usable (missing / null / undefined).
 */
export function coerceToText(value: unknown, depth = 0): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (depth > 4) return null;

  if (Array.isArray(value)) {
    const parts = value.map((item) => coerceToText(item, depth + 1));
    if (parts.every((p): p is string => p !== null)) return parts.join('\n');
    return JSON.stringify(value, null, 2);
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of CONTENT_KEYS) {
      if (key in obj) {
        const inner = coerceToText(obj[key], depth + 1);
        if (inner !== null) return inner;
      }
    }
    // Unknown shape: keep the data (as JSON) instead of "[object Object]".
    return JSON.stringify(value, null, 2);
  }
  return null;
}

/** Removes a ```lang ... ``` wrapper only when it wraps the WHOLE text. */
function stripWrappingCodeFence(text: string): string {
  const m = text.match(/^\s*```[\w+-]*[ \t]*\r?\n([\s\S]*?)\r?\n?```\s*$/);
  return m ? m[1] : text;
}

/**
 * Per-run state shared across every tool call made during a single agent
 * loop. `pendingFiles` is the "virtual overlay": once the agent stages a
 * write_file or delete_file, later read_file/list_directory calls in the
 * *same* run see that pending state instead of stale disk content, even
 * though nothing is actually written to disk until the user approves it in
 * the diff review UI.
 */
export class AgentRunState {
  readonly actions: AiAgentAction[] = [];
  /** path -> pending content, or null if the file is staged for deletion */
  private readonly pendingFiles = new Map<string, string | null>();

  constructor(readonly workspacePath: string | null) { }

  private async readWithOverlay(resolved: string): Promise<string> {
    if (this.pendingFiles.has(resolved)) {
      const pending = this.pendingFiles.get(resolved) ?? null;
      if (pending === null) throw new Error(`ENOENT: file was deleted earlier in this run: ${resolved}`);
      return pending;
    }
    return fs.promises.readFile(resolved, 'utf-8');
  }

  async writeFile(filePath: string, content: string): Promise<{ result: string }> {
    const resolved = resolveInWorkspace(filePath, this.workspacePath);
    let originalContent = '';
    try {
      originalContent = await this.readWithOverlay(resolved);
    } catch {
      /* file does not exist yet */
    }
    this.pendingFiles.set(resolved, content);
    this.actions.push({
      type: 'write_file',
      path: resolved,
      content,
      originalContent,
      label: `Wrote file \`${displayPath(filePath, this.workspacePath)}\``,
    });
    return { result: `Prepared ${resolved} for diff review.` };
  }

  async readFile(filePath: string): Promise<{ result: string }> {
    const resolved = resolveInWorkspace(filePath, this.workspacePath);
    const content = await this.readWithOverlay(resolved);
    this.actions.push({
      type: 'read_file',
      path: resolved,
      label: `Read file \`${displayPath(filePath, this.workspacePath)}\``,
    });
    return { result: content };
  }

  async deleteFile(filePath: string): Promise<{ result: string }> {
    const resolved = resolveInWorkspace(filePath, this.workspacePath);
    let originalContent = '';
    try {
      originalContent = await this.readWithOverlay(resolved);
    } catch {
      /* nothing to show in the diff, but still allow staging the delete */
    }
    this.pendingFiles.set(resolved, null);
    this.actions.push({
      type: 'delete_file',
      path: resolved,
      originalContent,
      isDelete: true,
      label: `Delete file \`${displayPath(filePath, this.workspacePath)}\``,
    });
    return { result: `Staged deletion of ${resolved} for review.` };
  }

  async listDirectory(dirPath: string, recursive: boolean): Promise<{ result: string }> {
    const resolved = resolveInWorkspace(dirPath, this.workspacePath);
    const entries = await this.walkDirectory(resolved, recursive ? 4 : 1);
    this.actions.push({
      type: 'list_directory',
      path: resolved,
      entries,
      label: `Listed directory \`${displayPath(dirPath, this.workspacePath)}\` (${entries.length} entries)`,
    });
    return { result: entries.length > 0 ? entries.join('\n') : '(empty directory)' };
  }

  private async walkDirectory(dir: string, depth: number, prefix = ''): Promise<string[]> {
    let dirents: fs.Dirent[];
    try {
      dirents = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (err) {
      throw new Error(`Cannot list directory ${dir}: ${err instanceof Error ? err.message : String(err)}`);
    }

    const results: string[] = [];
    for (const entry of dirents.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.') && entry.name !== '.gitignore' && entry.name !== '.env.example') continue;
      const relName = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        if (IGNORED_DIR_NAMES.has(entry.name)) continue;
        results.push(`${relName}/`);
        if (depth > 1) {
          const nested = await this.walkDirectory(path.join(dir, entry.name), depth - 1, relName);
          results.push(...nested);
        }
      } else {
        results.push(relName);
      }
    }
    return results;
  }

  async searchFiles(query: string, filePattern?: string): Promise<{ result: string }> {
    const root = this.workspacePath ?? process.cwd();
    let regex: RegExp;
    try {
      regex = new RegExp(query, 'i');
    } catch {
      // Not a valid regex — search for it as a literal string instead.
      regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }

    const matches: AiAgentSearchMatch[] = [];
    await this.searchDirectory(root, regex, filePattern, matches);

    this.actions.push({
      type: 'search_files',
      path: root,
      matches,
      label: `Searched for \`${query}\` (${matches.length} match${matches.length === 1 ? '' : 'es'})`,
    });

    if (matches.length === 0) return { result: 'No matches found.' };
    const rel = (p: string) => displayPath(p, this.workspacePath);
    return {
      result: matches.map((m) => `${rel(m.path)}:${m.line}: ${m.text}`).join('\n'),
    };
  }

  private async searchDirectory(
    dir: string,
    regex: RegExp,
    filePattern: string | undefined,
    matches: AiAgentSearchMatch[],
  ): Promise<void> {
    if (matches.length >= MAX_SEARCH_MATCHES) return;

    let dirents: fs.Dirent[];
    try {
      dirents = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of dirents) {
      if (matches.length >= MAX_SEARCH_MATCHES) return;
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (IGNORED_DIR_NAMES.has(entry.name)) continue;
        await this.searchDirectory(full, regex, filePattern, matches);
        continue;
      }

      if (filePattern ? !entry.name.endsWith(filePattern) : !DEFAULT_SEARCH_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
        continue;
      }

      try {
        const stat = await fs.promises.stat(full);
        if (stat.size > MAX_SEARCH_FILE_BYTES) continue;
        const content = this.pendingFiles.has(full) ? this.pendingFiles.get(full) : await fs.promises.readFile(full, 'utf-8');
        if (content === null || content === undefined) continue;
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i])) {
            matches.push({ path: full, line: i + 1, text: lines[i].trim().slice(0, 300) });
            if (matches.length >= MAX_SEARCH_MATCHES) break;
          }
        }
      } catch {
        /* unreadable file (binary, permissions, race) — skip it */
      }
    }
  }

  async runCommand(command: string): Promise<{ result: { code: number; output: string } }> {
    const cwd = this.workspacePath ?? process.cwd();
    const result = await runCommandCapture(command, cwd);
    this.actions.push({
      type: 'run_command',
      command,
      label: `Ran command \`${command}\``,
    });
    return {
      result: {
        code: result.code,
        output:
          result.output ||
          (result.code === 0 ? 'Command completed without output.' : 'Command failed without output.'),
      },
    };
  }
}

/**
 * Executes one tool call by name against the shared run state. Every
 * provider service calls this from its own loop instead of reimplementing
 * the same switch statement.
 */
export async function executeAgentTool(
  name: string,
  args: Record<string, unknown>,
  state: AgentRunState,
): Promise<{ result?: unknown; error?: string }> {
  try {
    switch (name) {
      case 'write_file': {
        const filePath = pickString(args, PATH_KEYS);
        if (!filePath) {
          return { error: 'write_file needs a "filePath" argument (a string path, e.g. "hello.txt").' };
        }

        // Find the content under any of the keys models commonly use.
        let content: string | null = null;
        for (const key of CONTENT_KEYS) {
          if (key in args) {
            content = coerceToText(args[key]);
            if (content !== null) break;
          }
        }
        if (content === null) {
          // Tell the model instead of silently staging an empty file, so it can retry.
          return {
            error:
              'write_file needs a "content" argument: the full file text as ONE plain string. ' +
              'Call write_file again, e.g. {"filePath":"hello.txt","content":"hello world"}.',
          };
        }

        content = stripWrappingCodeFence(content);
        if (content.trim() === '[object Object]') {
          return {
            error:
              'The content you sent was an object, not text ("[object Object]"). ' +
              'Call write_file again with "content" set to the plain file text as a string.',
          };
        }
        return await state.writeFile(filePath, content);
      }
      case 'read_file':
        return await state.readFile(pickString(args, PATH_KEYS));
      case 'delete_file':
        return await state.deleteFile(pickString(args, PATH_KEYS));
      case 'list_directory':
        return await state.listDirectory(String(args.dirPath ?? '.'), Boolean(args.recursive));
      case 'search_files':
        return await state.searchFiles(String(args.query ?? ''), args.filePattern ? String(args.filePattern) : undefined);
      case 'run_command':
        return await state.runCommand(String(args.command ?? ''));
      default:
        return { error: `Unknown function: ${name}` };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** Shared system-prompt fragment describing the exploration + edit workflow. */
export const AGENT_WORKFLOW_INSTRUCTIONS = [
  'Explore before you edit: use list_directory and search_files to find the relevant files instead of guessing paths.',
  'When the user asks you to create or change files, you MUST call write_file; do not only paste code in chat.',
  'write_file arguments: "filePath" is a string path and "content" is the complete file text as ONE plain string (never an object, never an array).',
  'If changing the active file or selected code, call write_file with the active file path and the full updated file content.',
  'Use delete_file only when the user explicitly asks to remove a file.',
  'Workflow: inspect files when needed, write the full updated file, run command checks when useful, read errors, and fix the code until validation passes or no reliable local check exists. Keep using tools while the task is incomplete; only give the final answer once the requested work is complete.',
  'After every write_file result, review validation output. If validation failed, you MUST fix the reported errors with another write_file before giving a final answer.',
  'You may call run_command to execute local command prompts for builds, tests, linting, type checks, and diagnostics. Prefer targeted checks over broad unrelated commands.',
  'After write_file succeeds, briefly confirm what you did in plain language, then stop unless another tool result shows that more work is required.',
  'Be concise and proactive.',
].join('\n');

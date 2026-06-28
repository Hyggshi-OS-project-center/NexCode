/**
 * Claude API service — autonomous agent with file and terminal tools.
 * Uses Anthropic's Messages API.
 */
import https from 'https';
import fs from 'fs';
import path from 'path';
import type { AiAgentAction, AiChatMessage, AiChatResult, AiEditorContext } from '../../shared/types';
import type { ListedModel } from './geminiService';
import { runCommandCapture } from './agentWorkflow';

const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-20250514';
const CLAUDE_HOST = 'api.anthropic.com';
const CLAUDE_PATH = '/v1/messages';
const CLAUDE_VERSION = '2023-06-01';

// ---------------------------------------------------------------------------
// Dynamic model listing via OpenRouter (Claude models on OpenRouter)
// ---------------------------------------------------------------------------

/**
 * Fetches available Claude models via the OpenRouter models API.
 * This is a fallback-friendly approach — Anthropic doesn't expose a public
 * models endpoint, but OpenRouter lists all Claude models it supports.
 */
export async function listClaudeModels(): Promise<ListedModel[]> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://nexcode.local',
    'X-OpenRouter-Title': 'NexCode IDE',
  };

  try {
    const raw = await httpsGetWithHeaders('openrouter.ai', '/api/v1/models', headers);
    const data = JSON.parse(raw) as { data?: { id: string; name: string }[] };
    if (data.data) {
      return data.data
        .filter((m) => m.id.toLowerCase().startsWith('anthropic/'))
        .map((m) => ({
          value: m.id,
          label: m.name || m.id.replace(/^anthropic\//, ''),
          supportsImages: true,
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
    }
  } catch {
    // fall through to fallback list
  }

  // Fallback list if OpenRouter is unreachable
  return [
    { value: 'anthropic/claude-opus-4-20250514', label: 'Claude Opus 4', supportsImages: true },
    { value: 'anthropic/claude-sonnet-4-20250514', label: 'Claude Sonnet 4', supportsImages: true },
    { value: 'anthropic/claude-haiku-4-20250514', label: 'Claude Haiku 4', supportsImages: true },
  ];
}

// ---------------------------------------------------------------------------
// Chat (tool-based agent)
// ---------------------------------------------------------------------------

interface ClaudeContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | ClaudeContentBlock[];
}

interface ClaudeToolSpec {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
}

interface ClaudeResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: ClaudeContentBlock[];
  model: string;
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | null;
  stop_sequence: string | null;
  usage: { input_tokens: number; output_tokens: number };
  error?: { type: string; message: string };
}

const CLAUDE_TOOLS: ClaudeToolSpec[] = [
  {
    name: 'write_file',
    description:
      'Writes content to a file in the workspace. Use this instead of showing code in chat when the user wants a file created or updated.',
    input_schema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path relative to workspace root or absolute',
        },
        content: { type: 'string', description: 'Full file text content' },
      },
      required: ['filePath', 'content'],
    },
  },
  {
    name: 'read_file',
    description: 'Reads a text file from the workspace.',
    input_schema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path relative to workspace or absolute' },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'run_command',
    description: 'Runs a shell command in the workspace directory.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
      },
      required: ['command'],
    },
  },
];

function resolveInWorkspace(filePath: string, workspacePath: string | null): string {
  if (path.isAbsolute(filePath)) return path.normalize(filePath);
  const base = workspacePath ?? process.cwd();
  return path.resolve(base, filePath);
}

function displayPath(filePath: string, workspacePath: string | null): string {
  const resolved = resolveInWorkspace(filePath, workspacePath);
  if (workspacePath) {
    const rel = path.relative(workspacePath, resolved);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return rel;
  }
  return path.basename(resolved);
}

function toClaudeContent(message: AiChatMessage): string | ClaudeContentBlock[] {
  const parts: ClaudeContentBlock[] = [];
  if (message.text) parts.push({ type: 'text', text: message.text });

  for (const attachment of message.attachments ?? []) {
    if (attachment.kind === 'image' && attachment.dataUrl) {
      // Claude supports base64 images: data:image/jpeg;base64,...
      // We send them as text blocks since Claude can handle it
      parts.push({
        type: 'text',
        text: `[Image: ${attachment.name} (${attachment.mimeType})]\n${attachment.dataUrl}`,
      });
    } else if (attachment.content) {
      parts.push({
        type: 'text',
        text: `[Attached file: ${attachment.name}${attachment.truncated ? ' (truncated)' : ''}]\n${attachment.content}`,
      });
    }
  }

  if (parts.length === 0) return '';
  if (parts.length === 1 && parts[0]?.type === 'text') return parts[0].text ?? '';
  return parts;
}

export async function chatWithClaude(
  apiKey: string,
  model: string,
  messages: AiChatMessage[],
  workspacePath: string | null,
  editorContext: AiEditorContext | null = null,
): Promise<AiChatResult> {
  if (!apiKey?.trim()) {
    return {
      error: 'No Claude API key configured. Open Settings → AI and add your Claude API key.',
    };
  }

  const selectedModel = model.trim() || DEFAULT_CLAUDE_MODEL;

  const workspaceHint = workspacePath
    ? `Current workspace folder: ${workspacePath}. Resolve relative paths against this folder.`
    : 'No workspace folder is open. Ask the user to open a folder, or use absolute paths.';
  const editorHint = formatEditorContext(editorContext);

  const systemPrompt = [
    `You are an autonomous AI Agent in NexCode IDE with Copilot-style editor control. ${workspaceHint}`,
    editorHint,
    'When the user asks you to create or change files, you MUST call write_file; do not only paste code in chat.',
    'When the user asks to fix, refactor, explain, continue, or add code without naming a file, use the active editor context.',
    'If changing the active file or selected code, call write_file with the active file path and the full updated file content.',
    'Workflow: inspect files when needed, write the full updated file, run command checks when useful, read errors, and fix the code until validation passes or no reliable local check exists.',
    'After every write_file result, review validation output. If validation failed, you MUST fix the reported errors with another write_file before giving a final answer.',
    'You may call run_command to execute local command prompts for builds, tests, linting, type checks, and diagnostics. Prefer targeted checks over broad unrelated commands.',
    'After write_file succeeds, briefly confirm what you did in plain language.',
    'Be concise and proactive.',
  ]
    .filter(Boolean)
    .join('\n');

  const claudeMessages: ClaudeMessage[] = messages.map((m) => ({
    role: m.role === 'model' ? 'assistant' : 'user',
    content: toClaudeContent(m),
  }));

  const actions: AiAgentAction[] = [];
  let iteration = 0;
  const maxIterations = 10;

  while (iteration < maxIterations) {
    iteration++;

    const body = JSON.stringify({
      model: selectedModel,
      max_tokens: 8192,
      system: systemPrompt,
      messages: claudeMessages,
      tools: CLAUDE_TOOLS,
    });

    const json = await makeRequestWithRetry(apiKey, body, 3);
    if (json.error) {
      if (actions.length > 0) return completedActionsFallback(actions);
      return {
        error: `Claude API error: ${json.error.message ?? 'Unknown error'} (code ${json.error.type ?? '?'})`,
        actions: actions.length > 0 ? actions : undefined,
      };
    }

    const response = json as ClaudeResponse;
    if (!response.content?.length) {
      if (actions.length > 0) return completedActionsFallback(actions);
      return {
        error: 'No response from Claude. Try rephrasing your question.',
        actions: actions.length > 0 ? actions : undefined,
      };
    }

    // Check for tool_use blocks
    const toolUseBlocks = response.content.filter((block) => block.type === 'tool_use');
    const textBlocks = response.content.filter((block) => block.type === 'text');

    if (toolUseBlocks.length > 0) {
      // Add assistant response with tool calls to message history
      claudeMessages.push({
        role: 'assistant',
        content: response.content,
      });

      // Run each tool call
      const toolResults: ClaudeContentBlock[] = [];
      for (const toolBlock of toolUseBlocks) {
        const { result, error } = await runClaudeToolCall(
          toolBlock.name ?? '',
          (toolBlock.input ?? {}) as Record<string, string>,
          workspacePath,
          actions,
        );
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolBlock.id ?? '',
          content: error ?? JSON.stringify(result ?? {}),
        });
      }

      // Send tool results back
      claudeMessages.push({
        role: 'user',
        content: toolResults,
      });
      continue;
    }

    // Return text response
    const text = textBlocks.map((b) => b.text ?? '').join('\n').trim();
    if (text) {
      return { text, actions: actions.length > 0 ? actions : undefined };
    }

    if (actions.length > 0) return completedActionsFallback(actions);
    return { error: 'Received an empty or unsupported response from Claude.', actions };
  }

  if (actions.length > 0) return completedActionsFallback(actions);
  return {
    error: 'Agent stopped after reaching maximum iterations (10).',
    actions: actions.length > 0 ? actions : undefined,
  };
}

function completedActionsFallback(actions: AiAgentAction[]): AiChatResult {
  const labels = actions.map((a) => a.label.replace(/`/g, '')).join(', ');
  return { text: `Done. ${labels}.`, actions };
}

async function runClaudeToolCall(
  name: string,
  args: Record<string, string>,
  workspacePath: string | null,
  actions: AiAgentAction[],
): Promise<{ result?: unknown; error?: string }> {
  try {
    if (name === 'write_file') {
      const resolved = resolveInWorkspace(args.filePath, workspacePath);
      let originalContent = '';
      try {
        originalContent = await fs.promises.readFile(resolved, 'utf-8');
      } catch { /* file does not exist yet */ }
      const newContent = args.content ?? '';
      actions.push({
        type: 'write_file',
        path: resolved,
        content: newContent,
        originalContent,
        label: `Wrote file \`${displayPath(args.filePath, workspacePath)}\``,
      });
      return { result: `Prepared ${resolved} for diff review.` };
    }

    if (name === 'read_file') {
      const resolved = resolveInWorkspace(args.filePath, workspacePath);
      const content = await fs.promises.readFile(resolved, 'utf-8');
      actions.push({
        type: 'read_file',
        path: resolved,
        label: `Read file \`${displayPath(args.filePath, workspacePath)}\``,
      });
      return { result: content };
    }

    if (name === 'run_command') {
      const cwd = workspacePath ?? process.cwd();
      const result = await runCommandCapture(args.command, cwd);
      actions.push({
        type: 'run_command',
        command: args.command,
        label: `Ran command \`${args.command}\``,
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

    return { error: `Unknown function: ${name}` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

function formatEditorContext(context: AiEditorContext | null): string {
  if (!context?.activeFilePath) return '';

  const lines = [
    `Active editor file: ${context.activeFilePath}`,
    `Language: ${context.languageId ?? 'unknown'}`,
  ];

  if (context.cursor) {
    lines.push(`Cursor: line ${context.cursor.lineNumber}, column ${context.cursor.column}`);
  }

  if (context.selection && context.selectedText) {
    lines.push(
      `Selection: ${context.selection.startLineNumber}:${context.selection.startColumn}-${context.selection.endLineNumber}:${context.selection.endColumn}`,
      `Selected text${context.selectedTextTruncated ? ' (truncated)' : ''}:`,
      context.selectedText,
    );
  }

  if (context.content) {
    lines.push(
      `Active file content${context.contentTruncated ? ' (truncated)' : ''}:`,
      context.content,
    );
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function httpsGetWithHeaders(
  hostname: string,
  urlPath: string,
  headers: Record<string, string>,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname, path: urlPath, method: 'GET', headers, timeout: 30_000 },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.end();
  });
}

async function makeRequestWithRetry(
  apiKey: string,
  body: string,
  maxRetries: number,
): Promise<ClaudeResponse & { error?: { type: string; message: string } }> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await new Promise<ClaudeResponse & { error?: { type: string; message: string } }>(
        (resolve, reject) => {
          const req = https.request(
            {
              hostname: CLAUDE_HOST,
              path: CLAUDE_PATH,
              method: 'POST',
              headers: {
                'x-api-key': apiKey,
                'anthropic-version': CLAUDE_VERSION,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
              },
              timeout: 180_000,
            },
            (res) => {
              const chunks: Buffer[] = [];
              res.on('data', (chunk: Buffer) => chunks.push(chunk));
              res.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf-8');
                try {
                  const json = JSON.parse(raw) as ClaudeResponse & { error?: { type: string; message: string } };
                  if (res.statusCode && res.statusCode >= 400) {
                    resolve({
                      id: '',
                      type: 'message',
                      role: 'assistant',
                      content: [],
                      model: '',
                      stop_reason: null,
                      stop_sequence: null,
                      usage: { input_tokens: 0, output_tokens: 0 },
                      error: {
                        type: String(res.statusCode),
                        message: json.error?.message ?? raw.slice(0, 300),
                      },
                    });
                    return;
                  }
                  resolve(json);
                } catch {
                  resolve({
                    id: '',
                    type: 'message',
                    role: 'assistant',
                    content: [],
                    model: '',
                    stop_reason: null,
                    stop_sequence: null,
                    usage: { input_tokens: 0, output_tokens: 0 },
                    error: {
                      type: 'parse_error',
                      message: `Failed to parse Claude response: ${raw.slice(0, 200)}`,
                    },
                  });
                }
              });
            },
          );

          req.on('error', (err) => reject(err));
          req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timed out'));
          });

          req.write(body);
          req.end();
        },
      );

      if (response.error && isRetryableError(response.error.type)) {
        throw new Error(`${response.error.message} (type ${response.error.type})`);
      }

      return response;
    } catch (err) {
      if (attempt === maxRetries) {
        return {
          id: '',
          type: 'message',
          role: 'assistant',
          content: [],
          model: '',
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 0, output_tokens: 0 },
          error: {
            type: 'retry_exhausted',
            message: `Request failed after ${maxRetries} retries: ${
              err instanceof Error ? err.message : 'Unknown error'
            }`,
          },
        };
      }
      const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
      await new Promise((res) => setTimeout(res, delay));
    }
  }
  return {
    id: '',
    type: 'message',
    role: 'assistant',
    content: [],
    model: '',
    stop_reason: null,
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 },
    error: { type: 'retry_exhausted', message: 'Max retries exceeded' },
  };
}

function isRetryableError(type: string): boolean {
  return type === '429' || type === '408' || type === '409' || type === '425' || type === '500' || type === '502' || type === '503';
}
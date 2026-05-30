/**
 * OpenRouter API service: OpenAI-compatible autonomous agent with file and terminal tools.
 */
import https from 'https';
import fs from 'fs';
import path from 'path';
import type { AiAgentAction, AiChatMessage, AiChatResult, AiEditorContext } from '../../shared/types';
import { runCommandCapture, validateWrittenFile } from './agentWorkflow';

const OPENROUTER_HOST = 'openrouter.ai';
const OPENROUTER_PATH = '/api/v1/chat/completions';
const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4o-mini';
const KNOWN_OPENROUTER_IMAGE_MODELS = new Set([
  'openai/gpt-4o-mini',
  'openai/gpt-4.1-mini',
  'openai/gpt-4.1',
  'anthropic/claude-3.5-sonnet',
  'google/gemini-2.0-flash-001',
]);

interface OpenRouterToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | OpenRouterMessagePart[] | null;
  tool_calls?: OpenRouterToolCall[];
  tool_call_id?: string;
  name?: string;
}

type OpenRouterMessagePart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

interface OpenRouterResponse {
  choices?: {
    message?: OpenRouterMessage;
    finish_reason?: string;
  }[];
  error?: { message?: string; code?: number };
}

const OPENROUTER_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'write_file',
      description:
        'Writes content to a file in the workspace. Use this instead of showing code in chat when the user wants a file created or updated.',
      parameters: {
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
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Reads a text file from the workspace.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Path relative to workspace or absolute' },
        },
        required: ['filePath'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Runs a shell command in the workspace directory.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to execute' },
        },
        required: ['command'],
      },
    },
  },
] as const;

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

function toOpenRouterContent(message: AiChatMessage): string | OpenRouterMessagePart[] {
  const parts: OpenRouterMessagePart[] = [];
  if (message.text) parts.push({ type: 'text', text: message.text });

  for (const attachment of message.attachments ?? []) {
    if (attachment.kind === 'image' && attachment.dataUrl) {
      parts.push({ type: 'image_url', image_url: { url: attachment.dataUrl } });
    } else if (attachment.content) {
      parts.push({
        type: 'text',
        text: `[Attached file: ${attachment.name}${attachment.truncated ? ' (truncated)' : ''}]\n${attachment.content}`,
      });
    }
  }

  if (parts.length === 0) return message.text;
  if (parts.length === 1 && parts[0]?.type === 'text') return parts[0].text;
  return parts;
}

export async function chatWithOpenRouter(
  apiKey: string,
  model: string,
  messages: AiChatMessage[],
  workspacePath: string | null,
  editorContext: AiEditorContext | null = null,
): Promise<AiChatResult> {
  if (!apiKey?.trim()) {
    return { error: 'No OpenRouter API key configured. Open Settings -> AI and add your OpenRouter API key.' };
  }

  const selectedModel = model.trim() || DEFAULT_OPENROUTER_MODEL;
  if (messages.some(hasImageAttachment) && !openRouterModelSupportsImages(selectedModel)) {
    return {
      error:
        `The selected OpenRouter model (${selectedModel}) does not support image input. ` +
        'Choose a vision model such as openai/gpt-4o-mini, openai/gpt-4.1-mini, anthropic/claude-3.5-sonnet, or google/gemini-2.0-flash-001.',
    };
  }

  const cwd = workspacePath ?? process.cwd();
  const workspaceHint = workspacePath
    ? `Current workspace folder: ${workspacePath}. Resolve relative paths against this folder.`
    : 'No workspace folder is open. Ask the user to open a folder, or use absolute paths.';
  const editorHint = formatEditorContext(editorContext);

  const openRouterMessages: OpenRouterMessage[] = [
    {
      role: 'system',
      content: [
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
      ].filter(Boolean).join('\n'),
    },
    ...messages.map<OpenRouterMessage>((m) => ({
      role: m.role === 'model' ? 'assistant' : 'user',
      content: toOpenRouterContent(m),
    })),
  ];

  const actions: AiAgentAction[] = [];
  let iteration = 0;
  const maxIterations = 10;
  let validationFailed = false;

  while (iteration < maxIterations) {
    iteration++;

    const body = JSON.stringify({
      model: selectedModel,
      messages: openRouterMessages,
      tools: OPENROUTER_TOOLS,
      temperature: 0.2,
      top_p: 0.95,
      max_tokens: 8192,
    });

    const json = await makeRequestWithRetry(apiKey, body, 3);
    if (json.error) {
      if (actions.length > 0) return completedActionsFallback(actions);
      return {
        error: `OpenRouter API error: ${json.error.message ?? 'Unknown error'} (code ${json.error.code ?? '?'})`,
        actions: actions.length > 0 ? actions : undefined,
      };
    }

    const message = json.choices?.[0]?.message;
    if (!message) {
      if (actions.length > 0) return completedActionsFallback(actions);
      const reason = json.choices?.[0]?.finish_reason;
      return {
        error: `No response from OpenRouter${reason ? ` (${reason})` : ''}. Try rephrasing your question.`,
        actions: actions.length > 0 ? actions : undefined,
      };
    }

    if (message.tool_calls?.length) {
      openRouterMessages.push({
        role: 'assistant',
        content: message.content ?? null,
        tool_calls: message.tool_calls,
      });

      for (const toolCall of message.tool_calls) {
        const { result, error, validationFailed: toolValidationFailed } = await runToolCall(
          toolCall,
          workspacePath,
          cwd,
          actions,
        );
        if (toolValidationFailed !== undefined) validationFailed = toolValidationFailed;
        openRouterMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
          content: JSON.stringify(error ? { error } : { result }),
        });
      }
      continue;
    }

    if (typeof message.content === 'string' && message.content.trim()) {
      if (validationFailed) {
        openRouterMessages.push({
          role: 'user',
          content:
            'The latest code validation is still failing. Do not finish yet. Read the validation output, fix the code with write_file, and continue until the check passes.',
        });
        continue;
      }
      return { text: message.content.trim(), actions: actions.length > 0 ? actions : undefined };
    }

    if (actions.length > 0) return completedActionsFallback(actions);
    return { error: 'Received an empty or unsupported response from OpenRouter.', actions };
  }

  if (actions.length > 0) return completedActionsFallback(actions);
  return {
    error: 'Agent stopped after reaching maximum iterations (10).',
    actions: actions.length > 0 ? actions : undefined,
  };
}

function completedActionsFallback(actions: AiAgentAction[]): AiChatResult {
  const labels = actions.map((action) => action.label.replace(/`/g, '')).join(', ');
  return {
    text: `Done. ${labels}.`,
    actions,
  };
}

function hasImageAttachment(message: AiChatMessage): boolean {
  return message.attachments?.some((attachment) => attachment.kind === 'image' && Boolean(attachment.dataUrl)) ?? false;
}

function openRouterModelSupportsImages(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  if (KNOWN_OPENROUTER_IMAGE_MODELS.has(normalized)) return true;

  return [
    'gpt-4o',
    'gpt-4.1',
    'claude-3',
    'claude-sonnet-4',
    'claude-opus-4',
    'gemini',
    'qwen-vl',
    'llava',
    'pixtral',
    'vision',
  ].some((marker) => normalized.includes(marker));
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
    lines.push(`Active file content${context.contentTruncated ? ' (truncated)' : ''}:`, context.content);
  }

  return lines.join('\n');
}

async function runToolCall(
  toolCall: OpenRouterToolCall,
  workspacePath: string | null,
  cwd: string,
  actions: AiAgentAction[],
): Promise<{ result?: unknown; error?: string; validationFailed?: boolean }> {
  let args: Record<string, string>;
  try {
    args = JSON.parse(toolCall.function.arguments || '{}') as Record<string, string>;
  } catch {
    return { error: `Invalid tool arguments for ${toolCall.function.name}` };
  }

  try {
    if (toolCall.function.name === 'write_file') {
      const resolved = resolveInWorkspace(args.filePath, workspacePath);
      await fs.promises.mkdir(path.dirname(resolved), { recursive: true });
      await fs.promises.writeFile(resolved, args.content ?? '', 'utf-8');
      actions.push({
        type: 'write_file',
        path: resolved,
        label: `Wrote file \`${displayPath(args.filePath, workspacePath)}\``,
      });
      const validation = await validateWrittenFile(resolved, workspacePath, cwd, actions);
      return {
        result: validation
          ? {
              write: `Successfully wrote ${resolved}`,
              validation,
              nextStep: validation.ok
                ? 'Validation passed. You may now summarize the change.'
                : 'Validation failed. Fix the reported errors with another write_file before giving a final answer.',
            }
          : `Successfully wrote ${resolved}. No automatic validation command was available for this file type.`,
        validationFailed: validation?.ok === false,
      };
    }

    if (toolCall.function.name === 'read_file') {
      const resolved = resolveInWorkspace(args.filePath, workspacePath);
      const content = await fs.promises.readFile(resolved, 'utf-8');
      actions.push({
        type: 'read_file',
        path: resolved,
        label: `Read file \`${displayPath(args.filePath, workspacePath)}\``,
      });
      return { result: content };
    }

    if (toolCall.function.name === 'run_command') {
      const result = await runCommandCapture(args.command, cwd);
      actions.push({
        type: 'run_command',
        command: args.command,
        label: `Ran command \`${args.command}\``,
      });
      return {
        result: {
          code: result.code,
          output: result.output || (result.code === 0 ? 'Command completed without output.' : 'Command failed without output.'),
        },
      };
    }

    return { error: `Unknown function: ${toolCall.function.name}` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function makeRequestWithRetry(apiKey: string, body: string, maxRetries: number): Promise<OpenRouterResponse> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await new Promise<OpenRouterResponse>((resolve, reject) => {
        const req = https.request(
          {
            hostname: OPENROUTER_HOST,
            path: OPENROUTER_PATH,
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body),
              'HTTP-Referer': 'https://nexcode.local',
              'X-OpenRouter-Title': 'NexCode IDE',
            },
            timeout: 180_000,
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk: Buffer) => chunks.push(chunk));
            res.on('end', () => {
              const raw = Buffer.concat(chunks).toString('utf-8');
              try {
                const json = JSON.parse(raw) as OpenRouterResponse;
                if (res.statusCode && res.statusCode >= 400) {
                  resolve({
                    error: {
                      message: json.error?.message ?? raw.slice(0, 300),
                      code: json.error?.code ?? res.statusCode,
                    },
                  });
                  return;
                }
                resolve(json);
              } catch {
                resolve({ error: { message: `Failed to parse OpenRouter response: ${raw.slice(0, 200)}` } });
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
      });

      if (response.error && isRetryableOpenRouterError(response.error.code)) {
        throw new Error(`${response.error.message} (code ${response.error.code})`);
      }

      return response;
    } catch (err) {
      if (attempt === maxRetries) {
        return {
          error: {
            message: `Request failed after ${maxRetries} retries: ${err instanceof Error ? err.message : 'Unknown error'}`,
          },
        };
      }
      const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
      await new Promise((res) => setTimeout(res, delay));
    }
  }
  return { error: { message: 'Max retries exceeded' } };
}

function isRetryableOpenRouterError(code: number | undefined): boolean {
  if (!code) return false;
  return code === 408 || code === 409 || code === 425 || code === 429 || code >= 500;
}

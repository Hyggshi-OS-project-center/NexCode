/**
 * Claude API service — autonomous agent with file and terminal tools.
 * Uses Anthropic's Messages API, streaming by default.
 */
import https from 'https';
import type { AiAgentAction, AiChatMessage, AiChatResult, AiEditorContext } from '../../shared/types';
import type { ListedModel } from './geminiService';
import type { McpSession } from './mcpService';
import { AGENT_WORKFLOW_INSTRUCTIONS, AgentRunState, executeAgentTool, toClaudeTools } from './agentTools';
import {
  AiAbortError,
  isAbortError,
  requestSse,
  throwIfAborted,
  type AiStreamCallbacks,
} from './streaming';

const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-20250514';
const CLAUDE_HOST = 'api.anthropic.com';
const CLAUDE_ORIGIN = `https://${CLAUDE_HOST}`;
const CLAUDE_PATH = '/v1/messages';
const CLAUDE_VERSION = '2023-06-01';

/**
 * Model ids are stored in settings and may have been saved by an older build
 * that listed Claude models through OpenRouter, so they look like
 * `anthropic/claude-sonnet-4-20250514`. The Anthropic API rejects that prefix,
 * which made every request fail with "model not found" — strip it here so old
 * settings keep working.
 */
export function normalizeClaudeModel(model: string): string {
  const trimmed = (model ?? '').trim();
  if (!trimmed) return DEFAULT_CLAUDE_MODEL;
  return trimmed.replace(/^anthropic\//i, '');
}

// ---------------------------------------------------------------------------
// Dynamic model listing
// ---------------------------------------------------------------------------

interface ClaudeModelEntry {
  id: string;
  display_name?: string;
  type?: string;
}

interface ClaudeModelsResponse {
  data?: ClaudeModelEntry[];
  has_more?: boolean;
  last_id?: string | null;
  error?: { type?: string; message?: string };
}

/**
 * Fetches available Claude models from Anthropic's own models endpoint.
 *
 * The previous implementation asked OpenRouter instead, which returns ids
 * namespaced as `anthropic/...` — those are valid on OpenRouter but not on
 * api.anthropic.com, so picking any model from the dropdown broke the chat.
 */
export async function listClaudeModels(apiKey: string): Promise<ListedModel[]> {
  if (!apiKey?.trim()) return fallbackClaudeModels();

  const headers: Record<string, string> = {
    'x-api-key': apiKey,
    'anthropic-version': CLAUDE_VERSION,
    'Content-Type': 'application/json',
  };

  try {
    const collected: ClaudeModelEntry[] = [];
    let afterId: string | null = null;

    // The endpoint pages at 20 by default; ask for the maximum and follow cursors.
    do {
      const query = `?limit=100${afterId ? `&after_id=${encodeURIComponent(afterId)}` : ''}`;
      const raw: string = await httpsGetWithHeaders(CLAUDE_HOST, `/v1/models${query}`, headers);
      const data = JSON.parse(raw) as ClaudeModelsResponse;
      if (data.error) throw new Error(data.error.message ?? 'Unknown error');
      if (data.data?.length) collected.push(...data.data);
      afterId = data.has_more ? (data.last_id ?? null) : null;
    } while (afterId);

    if (collected.length === 0) return fallbackClaudeModels();

    return collected
      .filter((m) => Boolean(m.id))
      .map((m) => ({
        value: m.id,
        label: m.display_name || m.id,
        supportsImages: true,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  } catch {
    return fallbackClaudeModels();
  }
}

/** Used when the key is missing or Anthropic is unreachable. */
function fallbackClaudeModels(): ListedModel[] {
  return [
    { value: 'claude-opus-4-20250514', label: 'Claude Opus 4', supportsImages: true },
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', supportsImages: true },
    { value: 'claude-3-5-haiku-20241022', label: 'Claude Haiku 3.5', supportsImages: true },
  ];
}

// ---------------------------------------------------------------------------
// Wire types
// ---------------------------------------------------------------------------

interface ClaudeImageSource {
  type: 'base64';
  media_type: string;
  data: string;
}

interface ClaudeContentBlock {
  type: 'text' | 'tool_use' | 'tool_result' | 'image';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  source?: ClaudeImageSource;
  is_error?: boolean;
}

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | ClaudeContentBlock[];
}

interface ClaudeToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

interface ClaudeApiError {
  type: string;
  message: string;
}

/** One completed assistant turn, however it was transported. */
interface ClaudeTurn {
  content: ClaudeContentBlock[];
  stopReason: string | null;
  error?: ClaudeApiError;
}


/** Media types Anthropic accepts for image blocks. */
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

function splitDataUrl(dataUrl: string): { mediaType: string | null; data: string } {
  const match = /^data:([^;,]+)(?:;[^,]*)*,(.*)$/s.exec(dataUrl);
  if (!match) return { mediaType: null, data: dataUrl };
  return { mediaType: match[1] || null, data: match[2] ?? '' };
}

/**
 * Builds the content blocks for one user turn.
 *
 * Images used to be inlined as `[Image: ...]\ndata:image/png;base64,...` inside
 * a *text* block — Claude cannot see an image sent that way, and the base64
 * blob burned a large part of the context window for nothing. They are proper
 * image blocks now.
 */
function toClaudeContent(message: AiChatMessage): string | ClaudeContentBlock[] {
  const parts: ClaudeContentBlock[] = [];
  if (message.text) parts.push({ type: 'text', text: message.text });

  for (const attachment of message.attachments ?? []) {
    if (attachment.kind === 'image' && attachment.dataUrl) {
      const { mediaType, data } = splitDataUrl(attachment.dataUrl);
      const resolved = mediaType ?? attachment.mimeType;
      if (data && SUPPORTED_IMAGE_TYPES.has(resolved)) {
        parts.push({ type: 'image', source: { type: 'base64', media_type: resolved, data } });
      } else {
        parts.push({
          type: 'text',
          text: `[Image "${attachment.name}" was skipped: ${resolved || 'unknown type'} is not a format Claude can read. Use JPEG, PNG, GIF or WebP.]`,
        });
      }
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

// ---------------------------------------------------------------------------
// Chat (tool-based agent)
// ---------------------------------------------------------------------------

export async function chatWithClaude(
  apiKey: string,
  model: string,
  messages: AiChatMessage[],
  workspacePath: string | null,
  editorContext: AiEditorContext | null = null,
  callbacks: AiStreamCallbacks = {},
  mcpSession: McpSession | null = null,
): Promise<AiChatResult> {
  if (!apiKey?.trim()) {
    return {
      error: 'No Claude API key configured. Open Settings → AI and add your Claude API key.',
    };
  }

  const selectedModel = normalizeClaudeModel(model);

  const workspaceHint = workspacePath
    ? `Current workspace folder: ${workspacePath}. Resolve relative paths against this folder.`
    : 'No workspace folder is open. Ask the user to open a folder, or use absolute paths.';
  const editorHint = formatEditorContext(editorContext);

  const systemPrompt = [
    `You are an autonomous AI Agent in NexCode IDE with Copilot-style editor control. ${workspaceHint}`,
    editorHint,
    'When the user asks to fix, refactor, explain, continue, or add code without naming a file, use the active editor context.',
    AGENT_WORKFLOW_INSTRUCTIONS,
  ]
    .filter(Boolean)
    .join('\n');

  const claudeMessages: ClaudeMessage[] = messages.map((m) => ({
    role: m.role === 'model' ? 'assistant' : 'user',
    content: toClaudeContent(m),
  }));

  const runState = new AgentRunState(workspacePath);
  const tools: ClaudeToolSpec[] = toClaudeTools((mcpSession?.openAiTools ?? []).map((tool) => tool.function));
  const actions = runState.actions;
  const transcript: string[] = [];
  let iteration = 0;
  const maxIterations = 10;

  try {
    while (iteration < maxIterations) {
      iteration++;
      throwIfAborted(callbacks.signal);

      const body = JSON.stringify({
        model: selectedModel,
        max_tokens: 8192,
        system: systemPrompt,
        messages: claudeMessages,
        tools,
        ...(callbacks.onDelta ? { stream: true } : {}),
      });

      const turn = callbacks.onDelta
        ? await streamTurn(apiKey, body, transcript, callbacks)
        : await makeRequestWithRetry(apiKey, body, 3, callbacks.signal);

      if (turn.error) {
        if (transcript.length > 0) return { text: transcript.join('').trim(), actions: orUndefined(actions) };
        if (actions.length > 0) return completedActionsFallback(actions);
        return {
          error: `Claude API error: ${turn.error.message ?? 'Unknown error'} (code ${turn.error.type ?? '?'})`,
          actions: orUndefined(actions),
        };
      }

      if (!turn.content.length) {
        if (transcript.length > 0) return { text: transcript.join('').trim(), actions: orUndefined(actions) };
        if (actions.length > 0) return completedActionsFallback(actions);
        return {
          error: 'No response from Claude. Try rephrasing your question.',
          actions: orUndefined(actions),
        };
      }

      const toolUseBlocks = turn.content.filter((block) => block.type === 'tool_use');
      const textBlocks = turn.content.filter((block) => block.type === 'text');

      if (toolUseBlocks.length > 0) {
        claudeMessages.push({ role: 'assistant', content: turn.content });

        const toolResults: ClaudeContentBlock[] = [];
        for (const toolBlock of toolUseBlocks) {
          throwIfAborted(callbacks.signal);
          const toolName = toolBlock.name ?? '';
          callbacks.onStatus?.({ label: `Running ${toolName}`, kind: 'thinking', status: 'running' });

          const toolArgs = (toolBlock.input ?? {}) as Record<string, unknown>;
          const { result, error } = toolName.startsWith('mcp__') && mcpSession
            ? await mcpSession.call(toolName, toolArgs)
            : await executeAgentTool(toolName, toolArgs, runState);

          callbacks.onStatus?.({
            label: error ? `${toolName} failed: ${error}` : `${toolName} completed`,
            kind: 'thinking',
            status: error ? 'failed' : 'done',
          });

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolBlock.id ?? '',
            content: error ?? JSON.stringify(result ?? {}),
            ...(error ? { is_error: true } : {}),
          });
        }

        claudeMessages.push({ role: 'user', content: toolResults });
        continue;
      }

      // Final turn: plain text.
      const text = textBlocks.map((b) => b.text ?? '').join('\n').trim();
      if (callbacks.onDelta) {
        // Text was already streamed to the caller as it arrived.
        const full = transcript.join('').trim();
        if (full) return { text: full, actions: orUndefined(actions) };
      } else if (text) {
        return { text, actions: orUndefined(actions) };
      }

      if (actions.length > 0) return completedActionsFallback(actions);
      return { error: 'Received an empty or unsupported response from Claude.', actions };
    }
  } catch (err) {
    if (isAbortError(err)) {
      const partial = transcript.join('').trim();
      return partial
        ? { text: partial, actions: orUndefined(actions) }
        : { error: 'Cancelled.', actions: orUndefined(actions) };
    }
    return {
      error: `Claude request failed: ${err instanceof Error ? err.message : String(err)}`,
      actions: orUndefined(actions),
    };
  }

  if (transcript.length > 0) return { text: transcript.join('').trim(), actions: orUndefined(actions) };
  if (actions.length > 0) return completedActionsFallback(actions);
  return {
    error: 'Agent stopped after reaching maximum iterations (10).',
    actions: orUndefined(actions),
  };
}

function orUndefined(actions: AiAgentAction[]): AiAgentAction[] | undefined {
  return actions.length > 0 ? actions : undefined;
}

function completedActionsFallback(actions: AiAgentAction[]): AiChatResult {
  const labels = actions.map((a) => a.label.replace(/`/g, '')).join(', ');
  return { text: `Done. ${labels}.`, actions };
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
// Streaming turn
// ---------------------------------------------------------------------------

interface ClaudeStreamEvent {
  type: string;
  index?: number;
  content_block?: { type: string; id?: string; name?: string; text?: string };
  delta?: {
    type?: string;
    text?: string;
    partial_json?: string;
    stop_reason?: string;
  };
  error?: ClaudeApiError;
}

/**
 * Runs one assistant turn over SSE, forwarding text to `callbacks.onDelta`
 * the instant each fragment arrives and reassembling tool calls (whose JSON
 * arguments come in as a stream of `partial_json` fragments).
 */
async function streamTurn(
  apiKey: string,
  body: string,
  transcript: string[],
  callbacks: AiStreamCallbacks,
): Promise<ClaudeTurn> {
  // Blocks are keyed by index; tool_use arguments accumulate as raw JSON text.
  const blocks = new Map<number, { block: ClaudeContentBlock; json: string }>();
  let stopReason: string | null = null;
  let streamError: ClaudeApiError | undefined;
  let wroteThisTurn = false;

  const result = await requestSse({
    url: `${CLAUDE_ORIGIN}${CLAUDE_PATH}`,
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': CLAUDE_VERSION,
      'Content-Type': 'application/json',
    },
    body,
    timeoutMs: 180_000,
    signal: callbacks.signal,
    onData: (payload) => {
      let event: ClaudeStreamEvent;
      try {
        event = JSON.parse(payload) as ClaudeStreamEvent;
      } catch {
        return;
      }

      switch (event.type) {
        case 'error':
          streamError = event.error ?? { type: 'stream_error', message: 'Stream failed' };
          break;

        case 'content_block_start': {
          if (event.index === undefined || !event.content_block) break;
          const kind = event.content_block.type;
          if (kind === 'text') {
            blocks.set(event.index, { block: { type: 'text', text: '' }, json: '' });
          } else if (kind === 'tool_use') {
            blocks.set(event.index, {
              block: { type: 'tool_use', id: event.content_block.id, name: event.content_block.name, input: {} },
              json: '',
            });
            callbacks.onStatus?.({
              label: `Preparing ${event.content_block.name ?? 'tool call'}`,
              kind: 'thinking',
              status: 'running',
            });
          }
          break;
        }

        case 'content_block_delta': {
          if (event.index === undefined) break;
          const entry = blocks.get(event.index);
          if (!entry) break;

          if (event.delta?.type === 'text_delta' && event.delta.text) {
            entry.block.text = (entry.block.text ?? '') + event.delta.text;
            // Separate narration from a previous turn so they don't run together.
            if (!wroteThisTurn && transcript.length > 0) {
              transcript.push('\n\n');
              callbacks.onDelta?.('\n\n');
            }
            wroteThisTurn = true;
            transcript.push(event.delta.text);
            callbacks.onDelta?.(event.delta.text);
          } else if (event.delta?.type === 'input_json_delta' && event.delta.partial_json) {
            entry.json += event.delta.partial_json;
          }
          break;
        }

        case 'content_block_stop': {
          if (event.index === undefined) break;
          const entry = blocks.get(event.index);
          if (entry?.block.type === 'tool_use') {
            try {
              entry.block.input = entry.json ? (JSON.parse(entry.json) as Record<string, unknown>) : {};
            } catch {
              entry.block.input = {};
            }
          }
          break;
        }

        case 'message_delta':
          if (event.delta?.stop_reason) stopReason = event.delta.stop_reason;
          break;

        default:
          break;
      }
    },
  });

  if (result.errorBody !== null) {
    return { content: [], stopReason: null, error: parseErrorBody(result.status, result.errorBody) };
  }
  if (streamError) {
    return { content: [], stopReason: null, error: streamError };
  }

  const content = [...blocks.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, entry]) => entry.block)
    .filter((block) => block.type !== 'text' || (block.text ?? '').length > 0);

  return { content, stopReason };
}

function parseErrorBody(status: number, raw: string): ClaudeApiError {
  try {
    const parsed = JSON.parse(raw) as { error?: { type?: string; message?: string } };
    return {
      type: parsed.error?.type ?? String(status),
      message: parsed.error?.message ?? raw.slice(0, 300),
    };
  } catch {
    return { type: String(status), message: raw.slice(0, 300) || `HTTP ${status}` };
  }
}

// ---------------------------------------------------------------------------
// HTTP helpers (non-streaming path)
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
        res.on('error', reject);
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
  signal?: AbortSignal,
): Promise<ClaudeTurn> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    throwIfAborted(signal);
    try {
      const response = await new Promise<ClaudeTurn>((resolve, reject) => {
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
              if (res.statusCode && res.statusCode >= 400) {
                resolve({ content: [], stopReason: null, error: parseErrorBody(res.statusCode, raw) });
                return;
              }
              try {
                const json = JSON.parse(raw) as {
                  content?: ClaudeContentBlock[];
                  stop_reason?: string | null;
                };
                resolve({ content: json.content ?? [], stopReason: json.stop_reason ?? null });
              } catch {
                resolve({
                  content: [],
                  stopReason: null,
                  error: {
                    type: 'parse_error',
                    message: `Failed to parse Claude response: ${raw.slice(0, 200)}`,
                  },
                });
              }
            });
            res.on('error', reject);
          },
        );

        const onAbort = () => {
          req.destroy();
          reject(new AiAbortError());
        };
        signal?.addEventListener('abort', onAbort, { once: true });

        req.on('error', (err) => reject(err));
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Request timed out'));
        });

        req.write(body);
        req.end();
      });

      if (response.error && isRetryableError(response.error.type)) {
        throw new Error(`${response.error.message} (type ${response.error.type})`);
      }

      return response;
    } catch (err) {
      if (isAbortError(err)) throw err;
      if (attempt === maxRetries) {
        return {
          content: [],
          stopReason: null,
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
    content: [],
    stopReason: null,
    error: { type: 'retry_exhausted', message: 'Max retries exceeded' },
  };
}

function isRetryableError(type: string): boolean {
  return ['429', '408', '409', '425', '500', '502', '503', '529', 'overloaded_error'].includes(type);
}

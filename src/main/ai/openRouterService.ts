/**
 * OpenRouter API service: OpenAI-compatible autonomous agent with file and terminal tools.
 */
import https from 'https';
import type { AiAgentAction, AiChatMessage, AiChatResult, AiEditorContext } from '../../shared/types';
import { AGENT_WORKFLOW_INSTRUCTIONS, AgentRunState, executeAgentTool, toOpenAiTools } from './agentTools';
import type { ListedModel } from './geminiService';
import type { McpSession } from './mcpService';
import {
  AiAbortError,
  isAbortError,
  requestSse,
  throwIfAborted,
  ToolCallAccumulator,
  type AiStreamCallbacks,
} from './streaming';

const OPENROUTER_HOST = 'openrouter.ai';
const OPENROUTER_PATH = '/api/v1/chat/completions';
const OPENROUTER_MODELS_PATH = '/api/v1/models';
const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4o-mini';

// ---------------------------------------------------------------------------
// Dynamic model listing
// ---------------------------------------------------------------------------

interface OpenRouterModelEntry {
  id: string;
  name: string;
  architecture?: {
    modality?: string;               // e.g. "text+image->text"
    input_modalities?: string[];     // e.g. ["text", "image"]
    output_modalities?: string[];
  };
  pricing?: {
    prompt?: string;
    completion?: string;
  };
  context_length?: number;
}

interface OpenRouterModelsListResponse {
  data?: OpenRouterModelEntry[];
  error?: { message?: string; code?: number };
}

/**
 * Fetches available OpenRouter models from the API.
 * Intended to be called from the main process and exposed via IPC so the
 * API key never reaches the renderer.
 *
 * An unauthenticated request still works but returns fewer models;
 * passing the API key gives the full list including private/beta models.
 */
export async function listOpenRouterModels(apiKey?: string): Promise<ListedModel[]> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://nexcode.local',
    'X-OpenRouter-Title': 'NexCode IDE',
  };
  if (apiKey?.trim()) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const raw = await httpsGetWithHeaders(OPENROUTER_HOST, OPENROUTER_MODELS_PATH, headers);
  const data = JSON.parse(raw) as OpenRouterModelsListResponse;

  if (data.error) {
    throw new Error(
      `OpenRouter models API error: ${data.error.message ?? 'Unknown'} (code ${data.error.code ?? '?'})`,
    );
  }

  if (!data.data?.length) {
    throw new Error('OpenRouter returned an empty models list.');
  }

  return data.data
    .filter((m) => m.id && m.name)
    .map((m): ListedModel => {
      const modality = m.architecture?.modality ?? '';
      const inputModalities = m.architecture?.input_modalities ?? [];
      const supportsImages =
        modality.includes('image') ||
        inputModalities.includes('image') ||
        inputModalities.includes('file') ||
        openRouterModelIdSupportsImages(m.id);

      const isFree =
        m.pricing?.prompt === '0' ||
        m.pricing?.prompt === '0.0' ||
        m.id.endsWith(':free');

      const label = isFree ? `${m.name} (free)` : m.name;

      return { value: m.id, label, supportsImages };
    })
    // Vision models first, then alphabetical
    .sort((a, b) => {
      if (a.supportsImages && !b.supportsImages) return -1;
      if (!a.supportsImages && b.supportsImages) return 1;
      return a.label.localeCompare(b.label);
    });
}

// ---------------------------------------------------------------------------
// OpenRouter chat
// ---------------------------------------------------------------------------

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

  // `message.text` may be undefined for an attachment-only turn; the API
  // rejects `content: undefined`, so fall back to an empty string.
  if (parts.length === 0) return message.text ?? '';
  if (parts.length === 1 && parts[0]?.type === 'text') return parts[0].text;
  return parts;
}

export async function chatWithOpenRouter(
  apiKey: string,
  model: string,
  messages: AiChatMessage[],
  workspacePath: string | null,
  editorContext: AiEditorContext | null = null,
  /** Optional: pass the cached model list so image-support check is authoritative */
  modelCache?: ListedModel[],
  callbacks: AiStreamCallbacks = {},
  mcpSession: McpSession | null = null,
): Promise<AiChatResult> {
  if (!apiKey?.trim()) {
    return {
      error: 'No OpenRouter API key configured. Open Settings → AI and add your OpenRouter API key.',
    };
  }

  const selectedModel = model.trim() || DEFAULT_OPENROUTER_MODEL;

  if (messages.some(hasImageAttachment)) {
    const supportsImages = modelCache
      ? (modelCache.find((m) => m.value === selectedModel)?.supportsImages ?? openRouterModelIdSupportsImages(selectedModel))
      : openRouterModelIdSupportsImages(selectedModel);

    if (!supportsImages) {
      return {
        error:
          `The selected OpenRouter model (${selectedModel}) does not support image input. ` +
          'Choose a vision model such as openai/gpt-4o-mini, anthropic/claude-3.5-sonnet, or google/gemini-2.0-flash-001.',
      };
    }
  }

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
        'When the user asks to fix, refactor, explain, continue, or add code without naming a file, use the active editor context.',
        AGENT_WORKFLOW_INSTRUCTIONS,
      ]
        .filter(Boolean)
        .join('\n'),
    },
    ...messages.map<OpenRouterMessage>((m) => ({
      role: m.role === 'model' ? 'assistant' : 'user',
      content: toOpenRouterContent(m),
    })),
  ];

  const runState = new AgentRunState(workspacePath);
  const tools = toOpenAiTools((mcpSession?.openAiTools ?? []).map((tool) => tool.function));
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
        messages: openRouterMessages,
        tools,
        temperature: 0.2,
        top_p: 0.95,
        max_tokens: 8192,
        ...(callbacks.onDelta ? { stream: true } : {}),
      });

      const json = callbacks.onDelta
        ? await streamTurn(apiKey, body, transcript, callbacks)
        : await makeRequestWithRetry(apiKey, body, 3, callbacks.signal);

      if (json.error) {
        if (transcript.length > 0) return { text: transcript.join('').trim(), actions: orUndefined(actions) };
        if (actions.length > 0) return completedActionsFallback(actions);
        return {
          error: `OpenRouter API error: ${json.error.message ?? 'Unknown error'} (code ${json.error.code ?? '?'})`,
          actions: orUndefined(actions),
        };
      }

      const message = json.choices?.[0]?.message;
      if (!message) {
        if (transcript.length > 0) return { text: transcript.join('').trim(), actions: orUndefined(actions) };
        if (actions.length > 0) return completedActionsFallback(actions);
        const reason = json.choices?.[0]?.finish_reason;
        return {
          error: `No response from OpenRouter${reason ? ` (${reason})` : ''}. Try rephrasing your question.`,
          actions: orUndefined(actions),
        };
      }

      if (message.tool_calls?.length) {
        openRouterMessages.push({
          role: 'assistant',
          content: message.content ?? null,
          tool_calls: message.tool_calls,
        });

        for (const toolCall of message.tool_calls) {
          throwIfAborted(callbacks.signal);
          callbacks.onStatus?.({
            label: `Running ${toolCall.function.name}`,
            kind: 'thinking',
            status: 'running',
          });

          let parsedArgs: Record<string, unknown> | null;
          try {
            parsedArgs = JSON.parse(toolCall.function.arguments || '{}') as Record<string, unknown>;
          } catch {
            parsedArgs = null;
          }
          const { result, error } =
            parsedArgs === null
              ? { result: undefined, error: `Invalid tool arguments for ${toolCall.function.name}` }
              : toolCall.function.name.startsWith('mcp__') && mcpSession
                ? await mcpSession.call(toolCall.function.name, parsedArgs)
                : await executeAgentTool(toolCall.function.name, parsedArgs, runState);

          callbacks.onStatus?.({
            label: error ? `${toolCall.function.name} failed: ${error}` : `${toolCall.function.name} completed`,
            kind: 'thinking',
            status: error ? 'failed' : 'done',
          });

          openRouterMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: JSON.stringify(error ? { error } : { result }),
          });
        }
        continue;
      }

      if (callbacks.onDelta) {
        const full = transcript.join('').trim();
        if (full) return { text: full, actions: orUndefined(actions) };
      } else if (typeof message.content === 'string' && message.content.trim()) {
        return { text: message.content.trim(), actions: orUndefined(actions) };
      }

      if (actions.length > 0) return completedActionsFallback(actions);
      return { error: 'Received an empty or unsupported response from OpenRouter.', actions };
    }
  } catch (err) {
    if (isAbortError(err)) {
      const partial = transcript.join('').trim();
      return partial
        ? { text: partial, actions: orUndefined(actions) }
        : { error: 'Cancelled.', actions: orUndefined(actions) };
    }
    return {
      error: `OpenRouter request failed: ${err instanceof Error ? err.message : String(err)}`,
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

/**
 * Streamed variant of one OpenAI-compatible turn.
 *
 * Text arrives as `choices[0].delta.content` fragments and is forwarded
 * immediately; tool calls arrive as indexed fragments whose JSON arguments are
 * split across many events, so they are reassembled before the turn is
 * handed back to the agent loop in the same shape a buffered reply has.
 */
export async function streamOpenAiCompatibleTurn(options: {
  url: string;
  headers: Record<string, string>;
  body: string;
  timeoutMs: number;
  transcript: string[];
  callbacks: AiStreamCallbacks;
}): Promise<OpenRouterResponse> {
  const { url, headers, body, timeoutMs, transcript, callbacks } = options;

  const toolCalls = new ToolCallAccumulator();
  let finishReason: string | undefined;
  let streamError: { message?: string; code?: number } | undefined;
  let content = '';
  let wroteThisTurn = false;

  const result = await requestSse({
    url,
    headers,
    body,
    timeoutMs,
    signal: callbacks.signal,
    onData: (payload) => {
      if (payload === '[DONE]') return;

      let chunk: {
        choices?: {
          delta?: {
            content?: string | null;
            tool_calls?: {
              index?: number;
              id?: string;
              function?: { name?: string; arguments?: string };
            }[];
          };
          finish_reason?: string | null;
        }[];
        error?: { message?: string; code?: number };
      };
      try {
        chunk = JSON.parse(payload);
      } catch {
        return;
      }

      if (chunk.error) {
        streamError = chunk.error;
        return;
      }

      const choice = chunk.choices?.[0];
      if (choice?.finish_reason) finishReason = choice.finish_reason;

      const text = choice?.delta?.content;
      if (typeof text === 'string' && text.length > 0) {
        if (!wroteThisTurn && transcript.length > 0) {
          transcript.push('\n\n');
          callbacks.onDelta?.('\n\n');
        }
        wroteThisTurn = true;
        content += text;
        transcript.push(text);
        callbacks.onDelta?.(text);
      }

      for (const [position, fragment] of (choice?.delta?.tool_calls ?? []).entries()) {
        toolCalls.add(fragment.index ?? position, {
          id: fragment.id,
          name: fragment.function?.name,
          args: fragment.function?.arguments,
        });
      }
    },
  });

  if (result.errorBody !== null) {
    try {
      const parsed = JSON.parse(result.errorBody) as OpenRouterResponse;
      return { error: parsed.error ?? { message: result.errorBody.slice(0, 300), code: result.status } };
    } catch {
      return { error: { message: result.errorBody.slice(0, 300) || `HTTP ${result.status}`, code: result.status } };
    }
  }

  if (streamError) return { error: streamError };

  const collected = toolCalls.toArray();
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content: content || null,
          ...(collected.length > 0
            ? {
                tool_calls: collected.map((call) => ({
                  id: call.id,
                  type: 'function' as const,
                  function: { name: call.name, arguments: call.args || '{}' },
                })),
              }
            : {}),
        },
        finish_reason: finishReason,
      },
    ],
  };
}

function streamTurn(
  apiKey: string,
  body: string,
  transcript: string[],
  callbacks: AiStreamCallbacks,
): Promise<OpenRouterResponse> {
  return streamOpenAiCompatibleTurn({
    url: `https://${OPENROUTER_HOST}${OPENROUTER_PATH}`,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://nexcode.local',
      'X-OpenRouter-Title': 'NexCode IDE',
    },
    body,
    timeoutMs: 180_000,
    transcript,
    callbacks,
  });
}

export function completedActionsFallback(actions: AiAgentAction[]): AiChatResult {
  const labels = actions.map((a) => a.label.replace(/`/g, '')).join(', ');
  return { text: `Done. ${labels}.`, actions };
}

export function hasImageAttachment(message: AiChatMessage): boolean {
  return (
    message.attachments?.some((a) => a.kind === 'image' && Boolean(a.dataUrl)) ?? false
  );
}

/**
 * Heuristic fallback: checks the model id string for known vision-capable patterns.
 * Used when the dynamic model cache is unavailable.
 */
function openRouterModelIdSupportsImages(model: string): boolean {
  const n = model.trim().toLowerCase();
  return [
    'gpt-4o',
    'gpt-4.1',
    'gpt-4v',
    'gpt-5',
    'claude-3',
    'claude-sonnet-4',
    'claude-opus-4',
    'claude-haiku-4',
    'gemini',
    'qwen-vl',
    'llava',
    'pixtral',
    'vision',
    'mimo',
    'minimax',
    'kimi-k',
    'nemotron',
  ].some((marker) => n.includes(marker));
}

export function formatEditorContext(context: AiEditorContext | null): string {
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
  signal?: AbortSignal,
): Promise<OpenRouterResponse> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    throwIfAborted(signal);
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
                resolve({
                  error: {
                    message: `Failed to parse OpenRouter response: ${raw.slice(0, 200)}`,
                  },
                });
              }
            });
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

      if (response.error && isRetryableOpenRouterError(response.error.code)) {
        throw new Error(`${response.error.message} (code ${response.error.code})`);
      }

      return response;
    } catch (err) {
      if (isAbortError(err)) throw err;
      if (attempt === maxRetries) {
        return {
          error: {
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
  return { error: { message: 'Max retries exceeded' } };
}

function isRetryableOpenRouterError(code: number | undefined): boolean {
  if (!code) return false;
  return code === 408 || code === 409 || code === 425 || code === 429 || code >= 500;
}

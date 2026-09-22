/**
 * Local AI service — talks to an OpenAI-compatible server running on this machine
 * (Ollama, LM Studio, llama.cpp `llama-server`, Jan, ...).
 *
 * Why an external server instead of embedding a runtime in Electron:
 *  - no native module / model weights added to the NexCode build size
 *  - the model runs in its own process, so a crash or OOM does not take the IDE down
 *  - users keep using the models they already have installed
 *
 * The chat loop mirrors openRouterService (same tools, same AiAgentAction output), so
 * every file change proposed by a local model goes through the exact same diff-review
 * flow in the chat panel as the cloud providers.
 */
import http from 'http';
import https from 'https';
import type { AiChatMessage, AiChatResult, AiEditorContext } from '../../shared/types';
import {
  AGENT_TOOL_DEFS,
  AGENT_WORKFLOW_INSTRUCTIONS,
  AgentRunState,
  executeAgentTool,
  resolveInWorkspace,
  toOpenAiTools,
} from './agentTools';
import type { ListedModel } from './geminiService';
import {
  completedActionsFallback,
  formatEditorContext,
  hasImageAttachment,
  streamOpenAiCompatibleTurn,
} from './openRouterService';
import { isAbortError, throwIfAborted, type AiStreamCallbacks } from './streaming';
import type { McpSession } from './mcpService';

const DEFAULT_LOCAL_BASE_URL = 'http://localhost:11434/v1';

/** Local CPU/iGPU inference can be slow, especially while the model is still loading. */
const CHAT_TIMEOUT_MS = 10 * 60_000;
const MODELS_TIMEOUT_MS = 5_000;
const MAX_ITERATIONS = 10;
/** Keep replies modest: local models usually run with a small context window. */
const MAX_TOKENS = 4096;
const TOOL_RESPONSE_PREVIEW_LENGTH = 300;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LocalToolCall {
  id?: string;
  type?: 'function';
  function: { name: string; arguments: string | Record<string, unknown> };
}

type LocalMessagePart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

interface LocalMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | LocalMessagePart[] | null;
  tool_calls?: LocalToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface LocalResponse {
  choices?: { message?: LocalMessage; finish_reason?: string }[];
  error?: { message?: string; code?: number | string };
}

interface LocalModelsResponse {
  data?: { id?: string }[];
  error?: { message?: string };
}

interface HttpResult {
  status: number;
  raw: string;
}

const LOCAL_TOOLS = toOpenAiTools();

/**
 * Tool-loop diagnostics deliberately include only response metadata and a short
 * escaped preview. Full model replies can contain the user's source files.
 */
function logToolLoop(iteration: number, event: string, details: Record<string, unknown> = {}): void {
  console.info(`[Local AI][tool loop ${iteration + 1}/${MAX_ITERATIONS}] ${event}`, details);
}

function responsePreview(content: string | LocalMessagePart[] | null | undefined): string {
  if (typeof content !== 'string') return content === null ? '<null>' : '<multipart>';
  const compact = content.replace(/\s+/g, ' ').trim();
  return compact.length > TOOL_RESPONSE_PREVIEW_LENGTH
    ? `${compact.slice(0, TOOL_RESPONSE_PREVIEW_LENGTH)}…`
    : compact;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Accepts `localhost:11434`, `http://localhost:11434` or `http://localhost:11434/v1`
 * and returns a normalized base URL ending in `/v1` (no trailing slash).
 */
export function normalizeLocalBaseUrl(raw: string | undefined | null): string {
  let value = (raw ?? '').trim() || DEFAULT_LOCAL_BASE_URL;
  if (!/^https?:\/\//i.test(value)) value = `http://${value}`;

  const url = new URL(value); // throws on garbage — caller reports it
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Local AI server URL must start with http:// or https://');
  }
  const pathname = url.pathname.replace(/\/+$/, '');
  url.pathname = pathname === '' ? '/v1' : pathname;
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/+$/, '');
}

/** Heuristic: ids of common local vision-capable models. */
function localModelIdSupportsImages(model: string): boolean {
  const n = model.trim().toLowerCase();
  return [
    'llava',
    'bakllava',
    'vision',
    '-vl',
    'vl:',
    'minicpm-v',
    'moondream',
    'pixtral',
    'gemma3',
  ].some((marker) => n.includes(marker));
}

function requestLocal(
  method: 'GET' | 'POST',
  urlString: string,
  body: string | null,
  timeoutMs: number,
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const transport = url.protocol === 'https:' ? https : http;
    const headers: Record<string, string | number> = { Accept: 'application/json' };
    if (body !== null) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = transport.request(
      url,
      { method, headers, timeout: timeoutMs },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, raw: Buffer.concat(chunks).toString('utf-8') }),
        );
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    if (body !== null) req.write(body);
    req.end();
  });
}

function describeConnectionError(baseUrl: string, err: unknown): string {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  const message = err instanceof Error ? err.message : String(err);
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'EHOSTUNREACH') {
    return (
      `Cannot reach the local AI server at ${baseUrl}. ` +
      'Start it first (Ollama: `ollama serve`, LM Studio: enable the local server), ' +
      'or fix the URL in Settings → AI.'
    );
  }
  if (message === 'timeout') {
    return (
      `The local AI server at ${baseUrl} did not answer in time. ` +
      'The model may still be loading or is too large for this machine — try a smaller model.'
    );
  }
  return `Local AI request failed: ${message}`;
}

function toLocalContent(message: AiChatMessage, allowImages: boolean): string | LocalMessagePart[] {
  const parts: LocalMessagePart[] = [];
  if (message.text) parts.push({ type: 'text', text: message.text });

  for (const attachment of message.attachments ?? []) {
    if (attachment.kind === 'image' && attachment.dataUrl) {
      if (allowImages) parts.push({ type: 'image_url', image_url: { url: attachment.dataUrl } });
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

/** Ollama / llama.cpp answer 400 with a message like "... does not support tools". */
function isToolsUnsupportedError(status: number, message: string): boolean {
  if (status !== 400 && status !== 422 && status !== 501) return false;
  return /tool|function.?call/i.test(message) && /support|not (available|enabled)|unsupported/i.test(message);
}

function extractErrorMessage(raw: string, json: LocalResponse | null): string {
  const fromJson = json?.error?.message;
  if (typeof fromJson === 'string' && fromJson.trim()) return fromJson.trim();
  // Some servers return { "error": "message" } as a bare string.
  try {
    const parsed = JSON.parse(raw) as { error?: unknown };
    if (typeof parsed.error === 'string') return parsed.error;
  } catch {
    /* fall through */
  }
  return raw.slice(0, 300) || 'Unknown error';
}

// ---------------------------------------------------------------------------
// Model listing
// ---------------------------------------------------------------------------

/**
 * Lists models the local server exposes through `GET {baseUrl}/models`.
 * Throws when the server is unreachable; the IPC handler turns that into an empty list.
 */
export async function listLocalModels(baseUrlRaw: string): Promise<ListedModel[]> {
  const baseUrl = normalizeLocalBaseUrl(baseUrlRaw);
  const { status, raw } = await requestLocal('GET', `${baseUrl}/models`, null, MODELS_TIMEOUT_MS);
  if (status >= 400) throw new Error(`Local AI server returned HTTP ${status}`);

  const data = JSON.parse(raw) as LocalModelsResponse;
  if (data.error) throw new Error(data.error.message ?? 'Local AI server error');

  return (data.data ?? [])
    .map((m) => m.id?.trim() ?? '')
    .filter((id) => id.length > 0 && !/embed|rerank/i.test(id))
    .map((id): ListedModel => ({ value: id, label: id, supportsImages: localModelIdSupportsImages(id) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

const KNOWN_TOOL_NAMES = new Set(AGENT_TOOL_DEFS.map((d) => d.name));

/**
 * Small local models often "call" a tool by writing the call as JSON text instead of using the
 * structured tool_calls field (the server can't parse it). Recognise that and treat it as a tool call.
 * Accepted shapes:
 *   - A ```json fenced block
 *   - A <tool_call>…</tool_call> block
 *   - A bare JSON object/array (starting with { or [)
 *   - A JSON object *embedded* anywhere in the text
 * Each object must be {"name": "...", "arguments"|"parameters"|"args": {...}}.
 *
 * Also handles truncated JSON by trying to complete it before parsing.
 */
function extractTextToolCalls(content: string | LocalMessagePart[] | null): LocalToolCall[] | null {
  if (typeof content !== 'string') return null;
  const trimmed = content.trim();
  if (!trimmed) return null;

  // Collect candidate JSON strings to try, in priority order
  const candidates: string[] = [];

  const tagged = trimmed.match(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/i);
  // Only use fenced block if it appears BEFORE the first { (i.e. it's not an inner fence inside JSON)
  const firstBrace = trimmed.indexOf('{');
  const firstFence = trimmed.indexOf('```');
  const fenced = (firstFence !== -1 && (firstBrace === -1 || firstFence < firstBrace))
    ? trimmed.match(/```(?:json|tool_call)?\s*([\s\S]*?)\s*```/i)
    : null;
  if (tagged?.[1]) candidates.push(tagged[1].trim());
  if (fenced?.[1]) candidates.push(fenced[1].trim());

  // Look for balanced JSON objects anywhere in the response. Slicing from the
  // first "{" is insufficient when a model adds prose after the JSON object.
  candidates.push(...extractJsonObjects(trimmed));
  if (trimmed.startsWith('[')) candidates.push(trimmed);

  for (const rawCandidate of candidates) {
    if (!rawCandidate) continue;

    // Try to parse as-is first, then try completing truncated JSON
    for (const candidate of [rawCandidate, tryCompleteJson(rawCandidate)]) {
      if (!candidate) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(candidate);
      } catch {
        continue;
      }

      const items = Array.isArray(parsed) ? parsed : [parsed];
      const calls: LocalToolCall[] = [];
      let allValid = true;
      for (const item of items) {
        if (!item || typeof item !== 'object') { allValid = false; break; }
        const obj = item as Record<string, unknown>;
        const name = typeof obj.name === 'string' ? obj.name : '';
        // Support multiple argument key names small models use
        const args = obj.arguments ?? obj.parameters ?? obj.args ?? obj.input;
        if (!KNOWN_TOOL_NAMES.has(name)) { allValid = false; break; }
        // If args is missing or invalid, try to salvage inline fields
        let resolvedArgs: Record<string, unknown> | null = null;
        if (typeof args === 'object' && args !== null) {
          resolvedArgs = args as Record<string, unknown>;
        } else if (typeof args === 'string') {
          try { resolvedArgs = JSON.parse(args) as Record<string, unknown>; } catch { /* ignore */ }
        }
        // For write_file, also accept filePath/content as top-level keys
        if (resolvedArgs === null && name === 'write_file') {
          if (typeof obj.filePath === 'string' || typeof obj.content === 'string') {
            resolvedArgs = { filePath: obj.filePath, content: obj.content };
          }
        }
        if (resolvedArgs === null) { allValid = false; break; }
        calls.push({ function: { name, arguments: resolvedArgs } });
      }
      if (allValid && calls.length > 0) return calls;
    }
  }

  // --- Last resort: regex-based extractor for write_file with malformed JSON ---
  // Small models often produce JSON with unescaped inner quotes or literal newlines
  // that make JSON.parse fail. We extract filePath and content directly.
  return extractWriteFileRegex(trimmed);
}

/** Extract complete top-level JSON objects while respecting quoted strings. */
function extractJsonObjects(text: string): string[] {
  const objects: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let index = 0; index < text.length; index++) {
    const ch = text[index];
    if (start === -1) {
      if (ch === '{') {
        start = index;
        depth = 1;
        inString = false;
        escape = false;
      }
      continue;
    }

    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        objects.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }

  // Preserve a final incomplete object for tryCompleteJson / regex recovery.
  if (start !== -1) objects.push(text.slice(start));
  return objects;
}

function extractWriteFileRegex(text: string): LocalToolCall[] | null {
  if (!/write_file/i.test(text)) return null;

  // Extract filePath — simple: value is always a clean path without special chars
  const pathMatch = text.match(/"filePath"\s*:\s*"([^"]+)"/)
    ?? text.match(/'filePath'\s*:\s*'([^']+)'/);
  if (!pathMatch?.[1]) return null;
  const filePath = pathMatch[1];

  // Extract content using a character-level decoder so we handle:
  //  - properly escaped sequences (\n \t \\ \")
  //  - literal newlines (model forgot to escape)
  //  - the content possibly ending before a final " due to truncation
  const contentKey = text.indexOf('"content"');
  if (contentKey === -1) {
    // No content key found — still return a write_file with empty content so the
    // user at least sees the diff review dialog and knows the intent.
    return [{ function: { name: 'write_file', arguments: { filePath, content: '' } } }];
  }

  // Find the opening " of the content value (after the colon)
  const colonIdx = text.indexOf(':', contentKey + '"content"'.length);
  if (colonIdx === -1) return [{ function: { name: 'write_file', arguments: { filePath, content: '' } } }];
  const openQuote = text.indexOf('"', colonIdx + 1);
  if (openQuote === -1) return [{ function: { name: 'write_file', arguments: { filePath, content: '' } } }];

  // Walk character by character to decode the string value
  let i = openQuote + 1;
  let decoded = '';
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\' && i + 1 < text.length) {
      const next = text[i + 1];
      if (next === 'n') decoded += '\n';
      else if (next === 't') decoded += '\t';
      else if (next === 'r') decoded += '\r';
      else if (next === '"') decoded += '"';
      else if (next === '\\') decoded += '\\';
      else decoded += next;
      i += 2;
      continue;
    }
    if (ch === '"') break; // end of string
    decoded += ch;
    i++;
  }

  // Strip wrapping markdown code fences from content if the model added them
  const stripped = decoded.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '');

  return [{ function: { name: 'write_file', arguments: { filePath, content: stripped } } }];
}

/**
 * Attempt to complete a truncated JSON string by counting open brackets/braces
 * and appending the matching closing tokens. Returns the completed string,
 * or null if the input doesn't look like partial JSON.
 */
function tryCompleteJson(s: string): string | null {
  const trimmed = s.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
  const stack: string[] = [];
  let inString = false;
  let escape = false;
  for (const ch of trimmed) {
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }
  if (stack.length === 0) return null; // already balanced or empty
  // Close any open string + remaining brackets
  let completed = trimmed;
  if (inString) completed += '"';
  completed += stack.reverse().join('');
  return completed;
}

/**
 * File-changing calls are identified by tool + resolved path, so "hello.c", "./hello.c" and the absolute
 * path count as the same file; content may differ slightly between repeats.
 */
function textCallSignature(call: LocalToolCall, workspacePath: string | null): string {
  const args = call.function.arguments;
  if ((call.function.name === 'write_file' || call.function.name === 'delete_file') && typeof args === 'object' && args !== null) {
    const rawPath = String((args as Record<string, unknown>).filePath ?? '');
    let resolved = rawPath;
    try {
      resolved = resolveInWorkspace(rawPath, workspacePath);
    } catch {
      /* keep the raw path */
    }
    return `${call.function.name}:${resolved}`;
  }
  return `${call.function.name}:${JSON.stringify(args)}`;
}

/** Auto mode: prefer a coding model if the server has one, otherwise the first model. */
function pickDefaultModel(models: ListedModel[]): string {
  const coder = models.find((m) => /coder|code/i.test(m.value));
  return (coder ?? models[0])?.value ?? '';
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export async function chatWithLocal(
  baseUrlRaw: string,
  model: string,
  messages: AiChatMessage[],
  workspacePath: string | null,
  editorContext: AiEditorContext | null = null,
  callbacks: AiStreamCallbacks = {},
  mcpSession: McpSession | null = null,
): Promise<AiChatResult> {
  let baseUrl: string;
  try {
    baseUrl = normalizeLocalBaseUrl(baseUrlRaw);
  } catch (err) {
    return { error: `Invalid local AI server URL: ${err instanceof Error ? err.message : String(err)}` };
  }

  // No model chosen yet → use the first one the server reports, so "it just works" after `ollama pull`.
  let selectedModel = model.trim();
  if (!selectedModel) {
    try {
      const available = await listLocalModels(baseUrl);
      selectedModel = pickDefaultModel(available);
    } catch (err) {
      return { error: describeConnectionError(baseUrl, err) };
    }
    if (!selectedModel) {
      return {
        error:
          `The local AI server at ${baseUrl} has no models installed. ` +
          'Pull one first (e.g. `ollama pull <model>`), then pick it in Settings → AI.',
      };
    }
  }

  const visionCapable = localModelIdSupportsImages(selectedModel);
  if (messages.some(hasImageAttachment) && !visionCapable) {
    return {
      error:
        `The local model "${selectedModel}" does not look like a vision model, so the image was not sent. ` +
        'Use a vision model (e.g. llava, gemma3, qwen-vl) or remove the image.',
    };
  }

  const workspaceHint = workspacePath
    ? `Current workspace folder: ${workspacePath}. Resolve relative paths against this folder.`
    : 'No workspace folder is open. Ask the user to open a folder, or use absolute paths.';
  const editorHint = formatEditorContext(editorContext);

  const buildSystemPrompt = (withTools: boolean): string =>
    (withTools
      ? [
        `You are an autonomous AI Agent in NexCode IDE with Copilot-style editor control. ${workspaceHint}`,
        editorHint,
        'When the user asks to fix, refactor, explain, continue, or add code without naming a file, use the active editor context.',
        AGENT_WORKFLOW_INSTRUCTIONS,
        'IMPORTANT: When you need to call a tool and your tool_calls field is not working, output ONLY a raw JSON object (no markdown, no explanation) in this exact format:',
        '{"name":"write_file","arguments":{"filePath":"hello.txt","content":"hello world"}}',
        '"content" must always be ONE plain string with the full file text. Escape newlines as \\n and quotes as \\" inside it. Never use an object or array for content.',
        'Use that JSON-only format ONLY for a fallback tool call. After you receive tool results and the task is complete, reply with a concise plain-text final answer (not JSON) and do not make more calls.',
      ]
      : [
        `You are a coding assistant in NexCode IDE. ${workspaceHint}`,
        editorHint,
        'This model cannot edit files directly. Answer in text and show code in fenced code blocks so the user can apply it.',
      ]
    )
      .filter(Boolean)
      .join('\n');

  const history: LocalMessage[] = messages.map<LocalMessage>((m) => ({
    role: m.role === 'model' ? 'assistant' : 'user',
    content: toLocalContent(m, visionCapable),
  }));

  let useTools = true;
  const conversation: LocalMessage[] = [{ role: 'system', content: buildSystemPrompt(true) }, ...history];

  const runState = new AgentRunState(workspacePath);
  const actions = runState.actions;
  const seenTextCalls = new Set<string>();
  const transcript: string[] = [];
  const streaming = Boolean(callbacks.onDelta);
  const availableTools = [...LOCAL_TOOLS, ...(mcpSession?.openAiTools ?? [])];

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    try {
      throwIfAborted(callbacks.signal);
    } catch {
      const partial = transcript.join('').trim();
      return partial
        ? { text: partial, actions: actions.length > 0 ? actions : undefined }
        : { error: 'Cancelled.', actions: actions.length > 0 ? actions : undefined };
    }

    // Stream normal prose even while tools are enabled. A few local models put
    // fallback calls in `content` as a JSON object, so only a response that
    // starts as a JSON object is held back until it can be parsed below. This
    // preserves the ChatGPT/Claude-style live response without flashing raw
    // write_file JSON in the chat.
    const streamThisTurn = streaming;
    let heldToolJson = '';
    const streamState: { mode: 'undecided' | 'visible' | 'held' } = { mode: 'undecided' };
    const streamCallbacks: AiStreamCallbacks = {
      ...callbacks,
      onDelta: (text) => {
        if (streamState.mode === 'visible') {
          callbacks.onDelta?.(text);
          return;
        }

        heldToolJson += text;
        const firstNonWhitespace = heldToolJson.trimStart();
        if (!firstNonWhitespace) return;

        // Local models use either one object or an array of objects for
        // fallback calls. Hold JSON/fenced-tool candidates to avoid exposing
        // them before extractTextToolCalls decides whether they are calls.
        if (
          firstNonWhitespace.startsWith('{') ||
          firstNonWhitespace.startsWith('[') ||
          /^<tool_call>/i.test(firstNonWhitespace) ||
          // The opening fence often arrives in its own SSE fragment, before
          // the `json` language tag, so hold from the first three backticks.
          firstNonWhitespace.startsWith('```')
        ) {
          streamState.mode = 'held';
          return;
        }

        streamState.mode = 'visible';
        callbacks.onDelta?.(heldToolJson);
        heldToolJson = '';
      },
    };
    logToolLoop(iteration, 'requesting model', {
      toolsEnabled: useTools,
      streaming: streamThisTurn,
      conversationMessages: conversation.length,
    });

    const body = JSON.stringify({
      model: selectedModel,
      messages: conversation,
      ...(useTools ? { tools: availableTools } : {}),
      temperature: 0.2,
      top_p: 0.95,
      max_tokens: MAX_TOKENS,
      stream: streamThisTurn,
    });

    let status = 200;
    let raw = '';
    let json: LocalResponse | null = null;
    const transcriptLengthBeforeTurn = transcript.length;

    if (streamThisTurn) {
      // Same OpenAI delta format as OpenRouter, so the parser is shared.
      let streamed: LocalResponse;
      try {
        streamed = (await streamOpenAiCompatibleTurn({
          url: `${baseUrl}/chat/completions`,
          headers: { 'Content-Type': 'application/json' },
          body,
          timeoutMs: CHAT_TIMEOUT_MS,
          transcript,
          callbacks: streamCallbacks,
        })) as LocalResponse;
      } catch (err) {
        if (isAbortError(err)) {
          const partial = transcript.join('').trim();
          return partial
            ? { text: partial, actions: actions.length > 0 ? actions : undefined }
            : { error: 'Cancelled.', actions: actions.length > 0 ? actions : undefined };
        }
        if (actions.length > 0) return completedActionsFallback(actions);
        return { error: describeConnectionError(baseUrl, err) };
      }

      if (streamed.error) {
        status = typeof streamed.error.code === 'number' ? streamed.error.code : 500;
        raw = streamed.error.message ?? '';
        json = streamed;
      } else {
        json = streamed;
      }
    } else {
      try {
        ({ status, raw } = await requestLocal('POST', `${baseUrl}/chat/completions`, body, CHAT_TIMEOUT_MS));
      } catch (err) {
        if (actions.length > 0) return completedActionsFallback(actions);
        return { error: describeConnectionError(baseUrl, err) };
      }

      try {
        json = JSON.parse(raw) as LocalResponse;
      } catch {
        json = null;
      }
    }

    if (status >= 400 || json?.error || !json) {
      const message = extractErrorMessage(raw, json);
      logToolLoop(iteration, 'model request failed', { status, message: message.slice(0, TOOL_RESPONSE_PREVIEW_LENGTH) });

      // The model has no tool-calling support → degrade to plain chat instead of failing.
      if (useTools && isToolsUnsupportedError(status, message)) {
        logToolLoop(iteration, 'server rejected tools; retrying in plain-chat mode');
        useTools = false;
        conversation[0] = { role: 'system', content: buildSystemPrompt(false) };
        iteration--; // this attempt did not consume an agent step
        continue;
      }

      if (actions.length > 0) return completedActionsFallback(actions);
      if (status === 404 && /not found|pull/i.test(message)) {
        return {
          error: `Model "${selectedModel}" is not available on the local server. Pull/load it first, or pick another model in Settings → AI. (${message})`,
        };
      }
      return { error: `Local AI error: ${message}${status ? ` (HTTP ${status})` : ''}` };
    }

    const message = json.choices?.[0]?.message;
    if (!message) {
      if (actions.length > 0) return completedActionsFallback(actions);
      const reason = json.choices?.[0]?.finish_reason;
      return { error: `No response from the local model${reason ? ` (${reason})` : ''}. Try rephrasing your question.` };
    }

    let pendingCalls = message.tool_calls;
    let fromText = false;
    if (useTools && !pendingCalls?.length) {
      const textCalls = extractTextToolCalls(message.content);
      if (textCalls) {
        pendingCalls = textCalls;
        fromText = true;
        // streamOpenAiCompatibleTurn has already accumulated the raw JSON in
        // the transcript. It is protocol data, not user-visible assistant
        // text, so remove this turn before requesting the next model response.
        transcript.splice(transcriptLengthBeforeTurn);
      }
    }

    logToolLoop(iteration, 'received model response', {
      structuredToolCalls: message.tool_calls?.length ?? 0,
      parsedTextToolCalls: fromText ? pendingCalls?.length ?? 0 : 0,
      contentPreview: responsePreview(message.content),
    });

    if (useTools && pendingCalls?.length) {
      if (fromText) {
        // Small models often repeat themselves. Drop duplicate calls inside one reply, and stop the run
        // when a later reply only repeats calls we already executed (otherwise it could loop forever).
        const fresh: LocalToolCall[] = [];
        const inThisReply = new Set<string>();
        for (const call of pendingCalls) {
          const signature = textCallSignature(call, workspacePath);
          if (inThisReply.has(signature)) continue;
          inThisReply.add(signature);
          if (!seenTextCalls.has(signature)) fresh.push(call);
        }
        if (fresh.length === 0) {
          logToolLoop(iteration, 'stopping repeated text tool call', { calls: pendingCalls.length });
          if (actions.length > 0) return completedActionsFallback(actions);
          return { error: 'The local model kept repeating the same tool call. Try a larger model.' };
        }
        for (const signature of inThisReply) seenTextCalls.add(signature);
        pendingCalls = fresh;
      }

      const toolCalls = pendingCalls.map((call, index) => ({
        id: call.id || `call_${iteration}_${index}`,
        type: 'function' as const,
        function: {
          name: call.function.name,
          arguments:
            typeof call.function.arguments === 'string'
              ? call.function.arguments
              : JSON.stringify(call.function.arguments ?? {}),
        },
      }));
      conversation.push({
        role: 'assistant',
        content: fromText ? null : message.content ?? null,
        tool_calls: toolCalls,
      });

      logToolLoop(iteration, 'sending assistant tool-call message to history', {
        source: fromText ? 'raw-json-content' : 'structured-tool-calls',
        tools: toolCalls.map((call) => call.function.name),
      });

      for (const toolCall of toolCalls) {
        let parsedArgs: Record<string, unknown> | null;
        try {
          parsedArgs = JSON.parse(toolCall.function.arguments || '{}') as Record<string, unknown>;
        } catch {
          parsedArgs = null;
        }

        callbacks.onStatus?.({
          label: `Running ${toolCall.function.name}`,
          kind: 'thinking',
          status: 'running',
        });

        const { result, error } = parsedArgs === null
          ? { result: undefined, error: `Invalid tool arguments for ${toolCall.function.name}` }
          : toolCall.function.name.startsWith('mcp__') && mcpSession
            ? await mcpSession.call(toolCall.function.name, parsedArgs)
            : await executeAgentTool(toolCall.function.name, parsedArgs, runState);

        logToolLoop(iteration, 'tool execution completed', {
          tool: toolCall.function.name,
          toolCallId: toolCall.id,
          success: !error,
          resultPreview: error
            ? error.slice(0, TOOL_RESPONSE_PREVIEW_LENGTH)
            : responsePreview(JSON.stringify({ result })),
        });

        callbacks.onStatus?.({
          label: error ? `${toolCall.function.name} failed: ${error}` : `${toolCall.function.name} completed`,
          kind: 'thinking',
          status: error ? 'failed' : 'done',
        });

        conversation.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
          content: JSON.stringify(error ? { error } : { result }),
        });
        logToolLoop(iteration, 'sent tool result to history', {
          tool: toolCall.function.name,
          toolCallId: toolCall.id,
          success: !error,
        });
      }
      continue;
    }

    // A JSON-looking response that was not actually a tool call (for example,
    // the user asked for JSON output) must still reach the chat UI.
    if (streamThisTurn && streamState.mode === 'held' && heldToolJson) {
      callbacks.onDelta?.(heldToolJson);
      heldToolJson = '';
    }

    if (streamThisTurn) {
      const full = transcript.join('').trim();
      if (full) return { text: full, actions: actions.length > 0 ? actions : undefined };
    } else if (typeof message.content === 'string' && message.content.trim()) {
      return { text: message.content.trim(), actions: actions.length > 0 ? actions : undefined };
    }

    if (actions.length > 0) return completedActionsFallback(actions);
    return { error: 'The local model returned an empty response.' };
  }

  if (transcript.length > 0) {
    return { text: transcript.join('').trim(), actions: actions.length > 0 ? actions : undefined };
  }
  if (actions.length > 0) return completedActionsFallback(actions);
  return { error: `Agent stopped after reaching maximum iterations (${MAX_ITERATIONS}).` };
}

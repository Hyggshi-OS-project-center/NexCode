/**
 * Gemini API service — autonomous agent with file and terminal tools.
 */
import https from 'https';
import type { AiAgentAction, AiChatMessage, AiChatResult, AiEditorContext } from '../../shared/types';
import { AGENT_WORKFLOW_INSTRUCTIONS, AgentRunState, executeAgentTool, toGeminiTools } from './agentTools';
import type { McpSession } from './mcpService';
import {
  AiAbortError,
  isAbortError,
  requestSse,
  throwIfAborted,
  type AiStreamCallbacks,
} from './streaming';

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_HOST = 'generativelanguage.googleapis.com';

interface GeminiFunctionCall {
  name: string;
  args: Record<string, string>;
}

interface GeminiPart {
  text?: string;
  functionCall?: GeminiFunctionCall;
  functionResponse?: {
    name: string;
    response: Record<string, unknown>;
  };
  inlineData?: {
    mimeType: string;
    data: string;
  };
  thought?: boolean;
  thoughtSignature?: string;
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

interface GeminiResponse {
  candidates?: {
    content?: GeminiContent;
    finishReason?: string;
  }[];
  error?: { message?: string; code?: number };
}

// Shape returned by the Gemini models list endpoint
interface GeminiModelEntry {
  name: string;           // "models/gemini-2.5-flash"
  displayName: string;
  supportedGenerationMethods?: string[];
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  description?: string;
}

interface GeminiModelsListResponse {
  models?: GeminiModelEntry[];
  nextPageToken?: string;
  error?: { message?: string; code?: number };
}

export interface ListedModel {
  value: string;        // model id ready to pass to the API
  label: string;        // human-readable display name
  supportsImages: boolean;
}


// ---------------------------------------------------------------------------
// Dynamic model listing
// ---------------------------------------------------------------------------

/**
 * Fetches available Gemini models from the API.
 * Call this from the main process and expose via IPC — the API key stays
 * in the secure Node context and never touches the renderer.
 *
 * Returns a sorted array of ListedModel, or throws on network/auth failure.
 */
export async function listGeminiModels(apiKey: string): Promise<ListedModel[]> {
  if (!apiKey?.trim()) {
    throw new Error('No Gemini API key provided.');
  }

  const allModels: GeminiModelEntry[] = [];
  let pageToken: string | undefined;

  // Paginate through all available models
  do {
    const pagePath =
      `/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=200` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');

    const raw = await httpsGet(GEMINI_HOST, pagePath);
    const data = JSON.parse(raw) as GeminiModelsListResponse;

    if (data.error) {
      throw new Error(`Gemini API error: ${data.error.message ?? 'Unknown'} (code ${data.error.code ?? '?'})`);
    }

    if (data.models) allModels.push(...data.models);
    pageToken = data.nextPageToken;
  } while (pageToken);

  return allModels
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => ({
      value: m.name.replace(/^models\//, ''),
      label: m.displayName || m.name.replace(/^models\//, ''),
      supportsImages: true, // All current Gemini generateContent models support vision
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

function toGeminiParts(message: AiChatMessage): GeminiPart[] {
  const parts: GeminiPart[] = [];
  if (message.text) parts.push({ text: message.text });

  for (const attachment of message.attachments ?? []) {
    if (attachment.kind === 'image' && attachment.dataUrl) {
      parts.push({
        inlineData: {
          mimeType: attachment.mimeType,
          data: dataUrlPayload(attachment.dataUrl),
        },
      });
    } else if (attachment.content) {
      parts.push({
        text: `[Attached file: ${attachment.name}${attachment.truncated ? ' (truncated)' : ''}]\n${attachment.content}`,
      });
    }
  }

  return parts.length > 0 ? parts : [{ text: '' }];
}

function dataUrlPayload(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

function normalizeGeminiModel(model: string): string {
  return (model.trim() || DEFAULT_GEMINI_MODEL).replace(/^models\//, '');
}

/**
 * Send a conversation to Gemini; runs an autonomous tool loop until the model replies with text.
 */
export async function chatWithGemini(
  apiKey: string,
  model: string,
  messages: AiChatMessage[],
  workspacePath: string | null,
  editorContext: AiEditorContext | null = null,
  callbacks: AiStreamCallbacks = {},
  mcpSession: McpSession | null = null,
): Promise<AiChatResult> {
  if (!apiKey?.trim()) {
    return { error: 'No API key configured. Open Settings → AI / Gemini and add your API key.' };
  }

  const selectedModel = normalizeGeminiModel(model);
  const contents: GeminiContent[] = messages.map((m) => ({
    role: m.role,
    parts: toGeminiParts(m),
  }));

  const workspaceHint = workspacePath
    ? `Current workspace folder: ${workspacePath}. Resolve relative paths against this folder.`
    : 'No workspace folder is open. Ask the user to open a folder, or use absolute paths.';
  const editorHint = formatEditorContext(editorContext);
  if (editorHint) {
    contents.unshift({
      role: 'user',
      parts: [
        {
          text: `[IDE editor context]\n${editorHint}\nUse this context like Copilot. If the user asks to edit the active file or selection, call write_file with the active file path and the full updated file content.`,
        },
      ],
    });
  }

  const systemInstruction = {
    parts: [
      {
        text: `You are an autonomous AI Agent in NexCode IDE. ${workspaceHint}
${AGENT_WORKFLOW_INSTRUCTIONS}
When the user asks you to lint, inspect, review, or diagnose code, use the active editor context and return concise diagnostics with line numbers, severity, the issue, and a suggested fix. Do not call write_file for lint requests unless the user explicitly asks you to apply the fixes.`,
      },
    ],
  };

  // The key is a query parameter, so it has to be encoded — an unescaped key
  // containing a reserved character silently produced a 400 here.
  const encodedKey = encodeURIComponent(apiKey);
  const generatePath = `/v1beta/models/${encodeURIComponent(selectedModel)}:generateContent?key=${encodedKey}`;
  const streamPath = `/v1beta/models/${encodeURIComponent(selectedModel)}:streamGenerateContent?alt=sse&key=${encodedKey}`;

  const runState = new AgentRunState(workspacePath);
  const tools = toGeminiTools((mcpSession?.openAiTools ?? []).map((tool) => tool.function));
  const actions = runState.actions;
  const transcript: string[] = [];
  let iteration = 0;
  const maxIterations = 10;

  try {
    while (iteration < maxIterations) {
      iteration++;
      throwIfAborted(callbacks.signal);

      const body = JSON.stringify({
        contents,
        tools,
        generationConfig: {
          temperature: 0.2,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 8192,
        },
        systemInstruction,
      });

      const json = callbacks.onDelta
        ? await streamTurn(streamPath, body, transcript, callbacks)
        : await makeRequestWithRetry(generatePath, body, 3, callbacks.signal);

      if (json.error) {
        if (transcript.length > 0) return { text: transcript.join('').trim(), actions: orUndefined(actions) };
        return {
          error: `Gemini API error: ${json.error.message ?? 'Unknown error'} (code ${json.error.code ?? '?'})`,
          actions: orUndefined(actions),
        };
      }

      const candidateContent = json.candidates?.[0]?.content;
      if (!candidateContent?.parts?.length) {
        if (transcript.length > 0) return { text: transcript.join('').trim(), actions: orUndefined(actions) };
        const reason = json.candidates?.[0]?.finishReason;
        return {
          error: `No response from Gemini${reason ? ` (${reason})` : ''}. Try rephrasing your question.`,
          actions: orUndefined(actions),
        };
      }

      // Skip "thought" parts — they are internal reasoning, not an answer.
      const visibleParts = candidateContent.parts.filter((part) => part.thought !== true);

      /*
       * Gemini may return narration *and* one or more function calls in the
       * same turn, e.g. [{text: "Let me check that file"}, {functionCall: …}].
       * The old code took the first part matching `functionCall || text`, so a
       * leading text part made it return early and silently drop every tool
       * call — the agent looked like it answered but never touched a file.
       * Collect all calls instead, and only treat a turn as final when it
       * contains no calls at all.
       */
      const functionCalls = visibleParts
        .map((part) => part.functionCall)
        .filter((call): call is GeminiFunctionCall => Boolean(call));

      if (functionCalls.length > 0) {
        contents.push({ role: 'model', parts: candidateContent.parts });

        const responses: GeminiPart[] = [];
        for (const call of functionCalls) {
          throwIfAborted(callbacks.signal);
          callbacks.onStatus?.({ label: `Running ${call.name}`, kind: 'thinking', status: 'running' });

          const toolArgs = call.args as Record<string, unknown>;
          const { result: functionResult, error: functionError } = call.name.startsWith('mcp__') && mcpSession
            ? await mcpSession.call(call.name, toolArgs)
            : await executeAgentTool(call.name, toolArgs, runState);

          callbacks.onStatus?.({
            label: functionError ? `${call.name} failed: ${functionError}` : `${call.name} completed`,
            kind: 'thinking',
            status: functionError ? 'failed' : 'done',
          });

          responses.push({
            functionResponse: {
              name: call.name,
              response: functionError ? { error: functionError } : { result: functionResult },
            },
          });
        }

        contents.push({ role: 'user', parts: responses });
        continue;
      }

      // No tool calls left — this turn is the answer.
      if (callbacks.onDelta) {
        const full = transcript.join('').trim();
        if (full) return { text: full, actions: orUndefined(actions) };
      } else {
        const text = visibleParts.map((part) => part.text ?? '').join('').trim();
        if (text) return { text, actions: orUndefined(actions) };
      }

      return { error: 'Received an empty or unsupported response from Gemini.', actions };
    }
  } catch (err) {
    if (isAbortError(err)) {
      const partial = transcript.join('').trim();
      return partial
        ? { text: partial, actions: orUndefined(actions) }
        : { error: 'Cancelled.', actions: orUndefined(actions) };
    }
    return {
      error: `Gemini request failed: ${err instanceof Error ? err.message : String(err)}`,
      actions: orUndefined(actions),
    };
  }

  if (transcript.length > 0) return { text: transcript.join('').trim(), actions: orUndefined(actions) };
  return {
    error: 'Agent stopped after reaching maximum iterations (10).',
    actions: orUndefined(actions),
  };
}

function orUndefined(actions: AiAgentAction[]): AiAgentAction[] | undefined {
  return actions.length > 0 ? actions : undefined;
}

/**
 * Runs one turn against `:streamGenerateContent?alt=sse`.
 *
 * Each SSE payload is a partial GenerateContentResponse; text parts are pushed
 * to the caller as they land and the parts are merged back into one candidate
 * so the surrounding agent loop can treat streamed and buffered turns alike.
 */
async function streamTurn(
  urlPath: string,
  body: string,
  transcript: string[],
  callbacks: AiStreamCallbacks,
): Promise<GeminiResponse> {
  const parts: GeminiPart[] = [];
  let finishReason: string | undefined;
  let streamError: { message?: string; code?: number } | undefined;
  let textPart: GeminiPart | null = null;
  let wroteThisTurn = false;

  const result = await requestSse({
    url: `https://${GEMINI_HOST}${urlPath}`,
    headers: { 'Content-Type': 'application/json' },
    body,
    timeoutMs: 180_000,
    signal: callbacks.signal,
    onData: (payload) => {
      let chunk: GeminiResponse;
      try {
        chunk = JSON.parse(payload) as GeminiResponse;
      } catch {
        return;
      }

      if (chunk.error) {
        streamError = chunk.error;
        return;
      }

      const candidate = chunk.candidates?.[0];
      if (candidate?.finishReason) finishReason = candidate.finishReason;

      for (const part of candidate?.content?.parts ?? []) {
        if (part.thought === true) continue;

        if (part.functionCall) {
          parts.push(part);
          callbacks.onStatus?.({
            label: `Preparing ${part.functionCall.name}`,
            kind: 'thinking',
            status: 'running',
          });
          continue;
        }

        if (typeof part.text === 'string' && part.text.length > 0) {
          if (!wroteThisTurn && transcript.length > 0) {
            transcript.push('\n\n');
            callbacks.onDelta?.('\n\n');
          }
          wroteThisTurn = true;
          transcript.push(part.text);
          callbacks.onDelta?.(part.text);

          // Merge consecutive text fragments into a single part.
          if (textPart) {
            textPart.text = (textPart.text ?? '') + part.text;
          } else {
            textPart = { text: part.text };
            parts.push(textPart);
          }
        }
      }
    },
  });

  if (result.errorBody !== null) {
    try {
      const parsed = JSON.parse(result.errorBody) as GeminiResponse;
      return { error: parsed.error ?? { message: result.errorBody.slice(0, 300), code: result.status } };
    } catch {
      return { error: { message: result.errorBody.slice(0, 300) || `HTTP ${result.status}`, code: result.status } };
    }
  }

  if (streamError) return { error: streamError };

  return { candidates: [{ content: { role: 'model', parts }, finishReason }] };
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

/** Simple GET helper used for the models list endpoint. */
function httpsGet(hostname: string, urlPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname, path: urlPath, method: 'GET', timeout: 30_000 },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      },
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    req.end();
  });
}

async function makeRequestWithRetry(
  url: string,
  body: string,
  maxRetries: number,
  signal?: AbortSignal,
): Promise<GeminiResponse> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    throwIfAborted(signal);
    try {
      const response = await new Promise<GeminiResponse>((resolve, reject) => {
        const req = https.request(
          {
            hostname: GEMINI_HOST,
            path: url,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body),
            },
            timeout: 90_000,
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk: Buffer) => chunks.push(chunk));
            res.on('end', () => {
              const raw = Buffer.concat(chunks).toString('utf-8');
              try {
                const json = JSON.parse(raw) as GeminiResponse;
                if (json.error && (json.error.code === 503 || json.error.code === 429)) {
                  reject(new Error(`${json.error.message} (code ${json.error.code})`));
                  return;
                }
                resolve(json);
              } catch {
                resolve({
                  error: {
                    message: `Failed to parse Gemini response: ${raw.slice(0, 200)}`,
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

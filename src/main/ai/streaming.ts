/**
 * Shared streaming transport for the AI providers.
 *
 * Every provider (Claude, Gemini, OpenRouter, local OpenAI-compatible servers)
 * speaks Server-Sent Events for incremental responses, so the framing logic
 * lives here once instead of being copy-pasted four times.
 *
 * The important property for the UI: `onData` is invoked the moment a chunk
 * lands on the socket, not when the response finishes. That is what makes the
 * reply appear token by token instead of all at once.
 */
import http from 'http';
import https from 'https';
import type { AiAgentAction } from '../../shared/types';

/** Raised when the caller aborts a run through its AbortSignal. */
export class AiAbortError extends Error {
  constructor(message = 'Request cancelled') {
    super(message);
    this.name = 'AiAbortError';
  }
}

export function isAbortError(err: unknown): boolean {
  return (
    err instanceof AiAbortError ||
    (err instanceof Error && (err.name === 'AbortError' || err.name === 'AiAbortError'))
  );
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new AiAbortError();
}

/**
 * Callbacks a caller can pass to a chat function to receive live progress.
 * Passing `onDelta` is what switches a provider from buffered to streaming.
 */
export interface AiStreamCallbacks {
  /** Every text fragment, in order, as the model produces it. */
  onDelta?: (text: string) => void;
  /** A step of the agent loop started or finished (tool calls, thinking). */
  onStatus?: (status: {
    label: string;
    kind: AiAgentAction['type'] | 'thinking';
    status: 'running' | 'done' | 'failed';
  }) => void;
  /** Aborts the in-flight HTTP request and stops the agent loop. */
  signal?: AbortSignal;
}

export interface SseRequestOptions {
  /** Full URL, e.g. https://api.anthropic.com/v1/messages */
  url: string;
  method?: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string | null;
  timeoutMs: number;
  signal?: AbortSignal;
  /** Called once per SSE `data:` payload, in arrival order. */
  onData: (payload: string, eventName: string | null) => void;
}

export interface SseResult {
  status: number;
  /** Raw body when the server answered with an HTTP error instead of a stream. */
  errorBody: string | null;
}

/**
 * Performs a streaming request and feeds each SSE payload to `onData`.
 *
 * Resolves with `errorBody` set when the server replied with status >= 400 —
 * error responses are plain JSON, not SSE, so they are buffered whole and
 * handed back for the provider to turn into a readable message.
 */
export function requestSse(options: SseRequestOptions): Promise<SseResult> {
  const { url, method = 'POST', headers, body = null, timeoutMs, signal, onData } = options;

  return new Promise<SseResult>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AiAbortError());
      return;
    }

    const parsed = new URL(url);
    const transport = parsed.protocol === 'http:' ? http : https;

    const finalHeaders: Record<string, string | number> = { Accept: 'text/event-stream', ...headers };
    if (body !== null) {
      finalHeaders['Content-Type'] = finalHeaders['Content-Type'] ?? 'application/json';
      finalHeaders['Content-Length'] = Buffer.byteLength(body);
    }

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const req = transport.request(parsed, { method, headers: finalHeaders, timeout: timeoutMs }, (res) => {
      const status = res.statusCode ?? 0;

      // Errors come back as a normal JSON body — buffer it and report it.
      if (status >= 400) {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () =>
          finish(() => resolve({ status, errorBody: Buffer.concat(chunks).toString('utf-8') })),
        );
        res.on('error', (err) => finish(() => reject(err)));
        return;
      }

      res.setEncoding('utf-8');

      let buffer = '';
      let dataLines: string[] = [];
      let eventName: string | null = null;

      const dispatch = () => {
        if (dataLines.length === 0) {
          eventName = null;
          return;
        }
        const payload = dataLines.join('\n');
        dataLines = [];
        const name = eventName;
        eventName = null;
        onData(payload, name);
      };

      res.on('data', (chunk: string) => {
        if (settled) return;
        buffer += chunk;

        // Split on line boundaries, keeping any trailing partial line buffered.
        let newlineIndex = buffer.indexOf('\n');
        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex).replace(/\r$/, '');
          buffer = buffer.slice(newlineIndex + 1);

          if (line === '') {
            dispatch();
          } else if (line.startsWith(':')) {
            // SSE comment / keep-alive — ignore.
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).replace(/^ /, ''));
          } else if (line.startsWith('event:')) {
            eventName = line.slice(6).trim();
          }

          newlineIndex = buffer.indexOf('\n');
        }
      });

      res.on('end', () => {
        // Some servers end without the trailing blank line.
        if (buffer.trim().startsWith('data:')) {
          dataLines.push(buffer.trim().slice(5).replace(/^ /, ''));
        }
        dispatch();
        finish(() => resolve({ status, errorBody: null }));
      });

      res.on('error', (err) => finish(() => reject(err)));
    });

    const onAbort = () => {
      req.destroy();
      finish(() => reject(new AiAbortError()));
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    function cleanup(): void {
      signal?.removeEventListener('abort', onAbort);
    }

    req.on('error', (err) => finish(() => reject(err)));
    req.on('timeout', () => {
      req.destroy();
      finish(() => reject(new Error('Request timed out')));
    });

    if (body !== null) req.write(body);
    req.end();
  });
}

/**
 * Accumulates OpenAI-style streamed tool calls, which arrive as fragments
 * keyed by index: the name comes in the first fragment, the JSON arguments
 * are split across many.
 */
export class ToolCallAccumulator {
  private byIndex = new Map<number, { id: string; name: string; args: string }>();

  add(index: number, fragment: { id?: string; name?: string; args?: string }): void {
    const existing = this.byIndex.get(index) ?? { id: '', name: '', args: '' };
    if (fragment.id) existing.id = fragment.id;
    if (fragment.name) existing.name = fragment.name;
    if (fragment.args) existing.args += fragment.args;
    this.byIndex.set(index, existing);
  }

  get size(): number {
    return this.byIndex.size;
  }

  /** Returns the completed calls in index order. */
  toArray(): { id: string; name: string; args: string }[] {
    return [...this.byIndex.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([index, call]) => ({
        id: call.id || `call_${index}`,
        name: call.name,
        args: call.args,
      }))
      .filter((call) => call.name.length > 0);
  }
}

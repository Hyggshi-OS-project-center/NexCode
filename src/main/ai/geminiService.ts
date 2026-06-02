/**
 * Gemini API service — autonomous agent with file and terminal tools.
 */
import https from 'https';
import fs from 'fs';
import path from 'path';
import type { AiAgentAction, AiChatMessage, AiChatResult, AiEditorContext } from '../../shared/types';
import { runCommandCapture } from './agentWorkflow';

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

const TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'write_file',
        description:
          'Writes content to a file in the workspace. Use this instead of showing code in chat when the user wants a file created or updated.',
        parameters: {
          type: 'OBJECT',
          properties: {
            filePath: {
              type: 'STRING',
              description: 'Path relative to workspace root or absolute',
            },
            content: { type: 'STRING', description: 'Full file text content' },
          },
          required: ['filePath', 'content'],
        },
      },
      {
        name: 'read_file',
        description: 'Reads a text file from the workspace.',
        parameters: {
          type: 'OBJECT',
          properties: {
            filePath: { type: 'STRING', description: 'Path relative to workspace or absolute' },
          },
          required: ['filePath'],
        },
      },
      {
        name: 'run_command',
        description: 'Runs a shell command in the workspace directory (cmd on Windows).',
        parameters: {
          type: 'OBJECT',
          properties: {
            command: { type: 'STRING', description: 'Shell command to execute' },
          },
          required: ['command'],
        },
      },
    ],
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
When the user asks you to create or change files, you MUST call write_file — do not only paste code in chat.
Workflow: understand the request, inspect files when needed, write the full updated file, run command checks when useful, read errors, and fix the code until validation passes or no reliable local check exists.
After every write_file result, review any validation output. If validation failed, you MUST fix the reported errors with another write_file before giving a final answer.
You may call run_command to execute local command prompts for builds, tests, linting, type checks, and diagnostics. Prefer targeted checks over broad unrelated commands.
When the user asks you to lint, inspect, review, or diagnose code, use the active editor context and return concise diagnostics with line numbers, severity, the issue, and a suggested fix. Do not call write_file for lint requests unless the user explicitly asks you to apply the fixes.
After write_file succeeds, briefly confirm what you did in plain language.
Be concise and proactive.`,
      },
    ],
  };

  const url = `/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`;
  const actions: AiAgentAction[] = [];
  let iteration = 0;
  const maxIterations = 10;

  while (iteration < maxIterations) {
    iteration++;

    const body = JSON.stringify({
      contents,
      tools: TOOLS,
      generationConfig: {
        temperature: 0.2,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 8192,
      },
      systemInstruction,
    });

    const json = await makeRequestWithRetry(url, body, 3);

    if (json.error) {
      return {
        error: `Gemini API error: ${json.error.message ?? 'Unknown error'} (code ${json.error.code ?? '?'})`,
        actions: actions.length > 0 ? actions : undefined,
      };
    }

    const candidateContent = json.candidates?.[0]?.content;
    if (!candidateContent?.parts?.length) {
      const reason = json.candidates?.[0]?.finishReason;
      return {
        error: `No response from Gemini${reason ? ` (${reason})` : ''}. Try rephrasing your question.`,
        actions: actions.length > 0 ? actions : undefined,
      };
    }

    const part = candidateContent.parts.find((candidatePart) => candidatePart.functionCall || candidatePart.text);
    if (!part) {
      return { error: 'Received an empty or unsupported response from Gemini.', actions };
    }

    if (part.functionCall) {
      const call = part.functionCall;
      let functionResult: unknown = null;
      let functionError: string | undefined;

      try {
        if (call.name === 'write_file') {
          const resolved = resolveInWorkspace(call.args.filePath, workspacePath);
          // Read original content (for diff editor review) - do NOT write to disk yet
          let originalContent = '';
          try {
            originalContent = await fs.promises.readFile(resolved, 'utf-8');
          } catch { /* file does not exist yet — originalContent stays '' */ }
          const newContent = call.args.content ?? '';
          actions.push({
            type: 'write_file',
            path: resolved,
            content: newContent,
            originalContent,
            label: `Wrote file \`${displayPath(call.args.filePath, workspacePath)}\``,
          });
          functionResult = `Prepared ${resolved} for diff review.`;
        } else if (call.name === 'read_file') {
          const resolved = resolveInWorkspace(call.args.filePath, workspacePath);
          functionResult = await fs.promises.readFile(resolved, 'utf-8');
          actions.push({
            type: 'read_file',
            path: resolved,
            label: `📖 Read file \`${displayPath(call.args.filePath, workspacePath)}\``,
          });
        } else if (call.name === 'run_command') {
          const cwd = workspacePath ?? process.cwd();
          const result = await runCommandCapture(call.args.command, cwd);
          functionResult = {
            code: result.code,
            output: result.output || (result.code === 0 ? 'Command completed without output.' : 'Command failed without output.'),
          };
          actions.push({
            type: 'run_command',
            command: call.args.command,
            label: `💻 Ran command \`${call.args.command}\``,
          });
        } else {
          functionError = `Unknown function: ${call.name}`;
        }
      } catch (err) {
        functionError = err instanceof Error ? err.message : String(err);
      }

      contents.push({ role: 'model', parts: candidateContent.parts });
      contents.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: call.name,
              response: functionError ? { error: functionError } : { result: functionResult },
            },
          },
        ],
      });
    } else if (part.text) {
      return { text: part.text.trim(), actions: actions.length > 0 ? actions : undefined };
    } else {
      return { error: 'Received an empty or unsupported response from Gemini.', actions };
    }
  }

  return {
    error: 'Agent stopped after reaching maximum iterations (10).',
    actions: actions.length > 0 ? actions : undefined,
  };
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

async function makeRequestWithRetry(url: string, body: string, maxRetries: number): Promise<GeminiResponse> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
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
                resolve({ error: { message: `Failed to parse Gemini response: ${raw.slice(0, 200)}` } });
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
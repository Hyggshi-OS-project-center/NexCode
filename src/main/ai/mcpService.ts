/** Minimal stdio Model Context Protocol client for the Local AI agent. */
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';

interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
}

const REQUEST_TIMEOUT_MS = 30_000;

class McpStdioClient {
  private readonly pending = new Map<number, PendingRequest>();
  private nextId = 1;
  private buffer = '';

  constructor(private readonly child: ChildProcessWithoutNullStreams, readonly name: string) {
    child.stdout.setEncoding('utf-8');
    child.stdout.on('data', (chunk: string) => this.onData(chunk));
    child.once('error', (err) => this.failAll(err));
    child.once('exit', () => this.failAll(new Error(`MCP server "${name}" exited.`)));
  }

  async initialize(): Promise<void> {
    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'NexCode IDE', version: '4.0.0' },
    });
    this.notify('notifications/initialized');
  }

  request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++;
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP ${this.name}.${method} timed out.`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${payload}\n`, 'utf-8');
    });
  }

  private notify(method: string): void {
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method })}\n`, 'utf-8');
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let newline: number;
    while ((newline = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      try {
        const message = JSON.parse(line) as { id?: number; result?: unknown; error?: { message?: string } };
        if (typeof message.id !== 'number') continue;
        const request = this.pending.get(message.id);
        if (!request) continue;
        this.pending.delete(message.id);
        clearTimeout(request.timer);
        if (message.error) request.reject(new Error(message.error.message ?? `MCP ${this.name} request failed.`));
        else request.resolve(message.result);
      } catch {
        // stderr / non-JSON stdout from a misconfigured server is ignored here;
        // the waiting request will return a useful timeout error.
      }
    }
  }

  private failAll(error: Error): void {
    for (const [id, request] of this.pending) {
      this.pending.delete(id);
      clearTimeout(request.timer);
      request.reject(error);
    }
  }

  close(): void {
    this.child.kill();
  }
}

export interface McpSession {
  /** OpenAI-compatible schemas, with collision-safe MCP tool names. */
  readonly openAiTools: { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }[];
  call(toolName: string, args: Record<string, unknown>): Promise<{ result?: string; error?: string }>;
  close(): void;
}

function parseConfig(raw: string): McpServerConfig[] {
  try {
    const parsed = JSON.parse(raw) as { servers?: unknown; mcpServers?: unknown };
    const candidates: unknown[] = Array.isArray(parsed.servers)
      ? parsed.servers
      : parsed.mcpServers && typeof parsed.mcpServers === 'object'
        ? Object.entries(parsed.mcpServers as Record<string, unknown>).map(([name, value]) =>
            value && typeof value === 'object' ? { name, ...(value as Record<string, unknown>) } : value,
          )
        : [];
    return candidates.filter((item): item is McpServerConfig => {
      if (!item || typeof item !== 'object') return false;
      const value = item as Record<string, unknown>;
      return typeof value.name === 'string' && typeof value.command === 'string';
    });
  } catch {
    return [];
  }
}

/** Starts configured stdio MCP servers and lists their tools for one agent run. */
export async function openMcpSession(rawConfig: string): Promise<McpSession | null> {
  const configs = parseConfig(rawConfig);
  if (configs.length === 0) return null;

  const clients: { client: McpStdioClient; tools: Map<string, string> }[] = [];
  const openAiTools: McpSession['openAiTools'] = [];

  for (const config of configs) {
    const child = spawn(config.command, config.args ?? [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...config.env },
      shell: process.platform === 'win32',
    });
    const client = new McpStdioClient(child, config.name);
    try {
      await client.initialize();
      const listed = await client.request('tools/list') as { tools?: McpTool[] };
      const tools = new Map<string, string>();
      for (const tool of listed.tools ?? []) {
        if (!tool?.name) continue;
        const name = `mcp__${config.name}__${tool.name}`.replace(/[^a-zA-Z0-9_-]/g, '_');
        tools.set(name, tool.name);
        openAiTools.push({
          type: 'function',
          function: {
            name,
            description: tool.description || `MCP tool ${tool.name} from ${config.name}`,
            parameters: tool.inputSchema ?? { type: 'object', properties: {} },
          },
        });
      }
      clients.push({ client, tools });
    } catch (error) {
      client.close();
      console.warn(`[MCP] Could not start server "${config.name}":`, error instanceof Error ? error.message : error);
    }
  }

  if (clients.length === 0) return null;
  return {
    openAiTools,
    async call(toolName, args) {
      const entry = clients.find((candidate) => candidate.tools.has(toolName));
      if (!entry) return { error: `Unknown MCP tool: ${toolName}` };
      const originalName = entry.tools.get(toolName)!;
      try {
        const response = await entry.client.request('tools/call', { name: originalName, arguments: args }) as { content?: { type?: string; text?: string }[]; isError?: boolean };
        const text = (response.content ?? []).map((part) => part.text ?? JSON.stringify(part)).join('\n');
        return response.isError ? { error: text || `MCP tool ${toolName} failed.` } : { result: text || '(MCP tool completed.)' };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    },
    close() {
      for (const { client } of clients) client.close();
    },
  };
}

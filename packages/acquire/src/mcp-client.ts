import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { load as loadYaml } from 'js-yaml';

const MAX_MANIFEST_BYTES = 8 * 1024 * 1024;
const MAX_STDIO_BYTES = 32 * 1024 * 1024;

export interface McpTool {
  name: string;
  description?: string;
  /** JSON Schema for the tool's arguments — maps cleanest of all into the canonical shape. */
  inputSchema?: Record<string, unknown>;
}

export interface McpManifest {
  info?: { title?: string; version?: string };
  tools: McpTool[];
}

/** Load an MCP tools manifest from a local file path or an http(s) URL. */
export async function loadMcpManifest(target: string): Promise<McpManifest> {
  let text: string;
  if (/^https?:\/\//i.test(target)) {
    const res = await fetch(target);
    if (!res.ok) throw new Error(`fetch ${target} → HTTP ${res.status}`);
    const declared = Number(res.headers.get('content-length') ?? '0');
    if (declared > MAX_MANIFEST_BYTES) {
      throw new Error(`manifest exceeds ${MAX_MANIFEST_BYTES} bytes`);
    }
    text = await res.text();
  } else {
    if (!existsSync(target)) throw new Error(`manifest not found: ${target}`);
    if (statSync(target).size > MAX_MANIFEST_BYTES) {
      throw new Error(`manifest exceeds ${MAX_MANIFEST_BYTES} bytes`);
    }
    text = await readFile(target, 'utf8');
  }
  if (text.length > MAX_MANIFEST_BYTES) {
    throw new Error(`manifest exceeds ${MAX_MANIFEST_BYTES} bytes`);
  }
  return coerceManifest(parseLoose(text));
}

function parseLoose(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return loadYaml(text);
  }
}

function coerceManifest(data: unknown): McpManifest {
  const obj = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const rawTools = Array.isArray(obj['tools'])
    ? (obj['tools'] as unknown[])
    : Array.isArray(data)
      ? (data as unknown[])
      : [];

  const tools: McpTool[] = [];
  for (const entry of rawTools) {
    if (!entry || typeof entry !== 'object') continue;
    const t = entry as Record<string, unknown>;
    if (typeof t['name'] !== 'string') continue;
    const tool: McpTool = { name: t['name'] };
    if (typeof t['description'] === 'string') tool.description = t['description'];
    const schema = t['inputSchema'] ?? t['input_schema'];
    if (schema && typeof schema === 'object') tool.inputSchema = schema as Record<string, unknown>;
    tools.push(tool);
  }

  const manifest: McpManifest = { tools };
  const info = obj['info'];
  if (info && typeof info === 'object') manifest.info = info as McpManifest['info'];
  return manifest;
}

interface JsonRpcMessage {
  id?: number;
  result?: { tools?: unknown[] };
  error?: unknown;
}

/**
 * Introspect a live stdio MCP server: spawn it, do the JSON-RPC `initialize` handshake, send the
 * `notifications/initialized` notice, then call `tools/list`. MCP's stdio transport is
 * newline-delimited JSON. Pragmatic minimal client — enough to read a tool catalog.
 */
export function introspectStdioServer(command: string, timeoutMs = 10_000): Promise<McpManifest> {
  return new Promise<McpManifest>((resolve, reject) => {
    const child = spawn(command, { shell: true, windowsHide: true });
    let buffer = '';
    let settled = false;

    const finish = (err: Error | null, value?: McpManifest): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      if (err) reject(err);
      else resolve(value as McpManifest);
    };

    const timer = setTimeout(
      () => finish(new Error(`MCP server timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );

    const send = (msg: Record<string, unknown>): void => {
      try {
        child.stdin.write(`${JSON.stringify(msg)}\n`);
      } catch (e) {
        finish(e instanceof Error ? e : new Error(String(e)));
      }
    };

    child.on('error', (e) => finish(e instanceof Error ? e : new Error(String(e))));

    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      // Cap the buffer so a server that streams without newlines can't exhaust memory before the
      // wall-clock timeout fires.
      if (buffer.length > MAX_STDIO_BYTES) {
        finish(new Error('MCP server response exceeded size limit'));
        return;
      }
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        let msg: JsonRpcMessage;
        try {
          msg = JSON.parse(line) as JsonRpcMessage;
        } catch {
          continue;
        }
        if (msg.id === 1 && msg.result) {
          send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
          send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
        } else if (msg.id === 2) {
          if (msg.error) {
            finish(new Error(`tools/list error: ${JSON.stringify(msg.error)}`));
            return;
          }
          const tools = Array.isArray(msg.result?.tools) ? msg.result?.tools : [];
          finish(null, coerceManifest({ tools }));
        }
      }
    });

    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'cn-acquire', version: '0.1.0' },
      },
    });
  });
}

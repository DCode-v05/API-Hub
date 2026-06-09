import type { GeneratedFile } from '@cn/contracts';
import type { PlannedOp, ProjectionPlan } from './plan';
import { DO_NOT_EDIT } from './gen-util';

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  _http: { method: string; path: string; query: string[]; body: string[]; header: string[] };
}

/** Project the IR into a runnable stdio MCP server (one tool per operation). */
export function generateMcpServer(plan: ProjectionPlan): GeneratedFile[] {
  const tools: ToolDef[] = plan.resources
    .flatMap((r) => r.ops)
    .map((op) => ({
      name: op.tool,
      description: op.summary ?? op.description ?? `${op.httpMethod} ${op.path}`,
      inputSchema: inputSchema(op),
      _http: {
        method: op.httpMethod,
        path: op.path,
        query: op.queryParams.map((p) => p.name),
        body: op.bodyParams.map((p) => p.name),
        header: op.headerParams.map((p) => p.name),
      },
    }));

  const manifest = {
    info: { title: plan.title, version: plan.apiVersion },
    tools: tools.map(({ _http, ...t }) => t),
  };

  return [
    { path: 'package.json', content: packageJson(plan) },
    { path: 'tools.json', content: JSON.stringify(manifest, null, 2) + '\n' },
    { path: 'server.mjs', content: serverMjs(plan, tools), executable: true },
    { path: 'README.md', content: readme(plan) },
  ];
}

function inputSchema(op: PlannedOp): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const p of op.params) {
    const schema = jsonSchema(p);
    if (p.description) schema['description'] = p.description;
    properties[p.name] = schema;
    if (p.required) required.push(p.name);
  }
  const result: Record<string, unknown> = { type: 'object', properties };
  if (required.length > 0) result['required'] = required;
  return result;
}

function jsonSchema(p: { type: string; ref?: string }): Record<string, unknown> {
  if (p.ref) return { type: 'object' };
  switch (p.type) {
    case 'string':
      return { type: 'string' };
    case 'datetime':
      return { type: 'string', format: 'date-time' };
    case 'integer':
      return { type: 'integer' };
    case 'number':
      return { type: 'number' };
    case 'boolean':
      return { type: 'boolean' };
    case 'array':
      return { type: 'array' };
    case 'object':
      return { type: 'object' };
    default:
      return {};
  }
}

function packageJson(plan: ProjectionPlan): string {
  return (
    JSON.stringify(
      {
        name: `${plan.slug}-mcp`,
        version: plan.apiVersion,
        description: `${plan.title} MCP server (generated)`,
        type: 'module',
        bin: { [`${plan.slug}-mcp`]: './server.mjs' },
        scripts: { start: 'node server.mjs' },
        engines: { node: '>=18' },
      },
      null,
      2,
    ) + '\n'
  );
}

function readme(plan: ProjectionPlan): string {
  return (
    `# ${plan.title} — MCP server\n\n` +
    `A stdio MCP server exposing ${plan.resources.reduce((n, r) => n + r.ops.length, 0)} tool(s), one per operation.\n\n` +
    `\`\`\`bash\nCN_BASE_URL=${plan.server || 'https://api.example'} CN_TOKEN=... node server.mjs\n\`\`\`\n\n` +
    `Speaks newline-delimited JSON-RPC: \`initialize\` → \`tools/list\` → \`tools/call\`.\n`
  );
}

function serverMjs(plan: ProjectionPlan, tools: ToolDef[]): string {
  return `#!/usr/bin/env node
// ${DO_NOT_EDIT}
// Minimal stdio MCP server (newline-delimited JSON-RPC). No dependencies.

const SERVER_NAME = ${JSON.stringify(`${plan.slug}-mcp`)};
const SERVER_VERSION = ${JSON.stringify(plan.apiVersion)};
const DEFAULT_BASE_URL = ${JSON.stringify(plan.server)};
const TOOLS = ${JSON.stringify(tools, null, 2)};

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\\n');
}

function buildUrl(base, tmpl, args) {
  const path = tmpl.replace(/\\{([^}]+)\\}/g, (_m, n) => encodeURIComponent(String(args[n])));
  return (base || '').replace(/\\/+$/, '') + path;
}

async function callTool(tool, args) {
  const base = process.env.CN_BASE_URL || DEFAULT_BASE_URL;
  if (!base) return { text: 'CN_BASE_URL is not set', isError: true };
  const url = new URL(buildUrl(base, tool._http.path, args));
  for (const q of tool._http.query) if (args[q] !== undefined && args[q] !== null) url.searchParams.set(q, String(args[q]));
  const headers = { 'content-type': 'application/json' };
  for (const h of tool._http.header) if (args[h] !== undefined) headers[h] = String(args[h]);
  if (process.env.CN_TOKEN) headers['authorization'] = 'Bearer ' + process.env.CN_TOKEN;
  let body;
  if (tool._http.body.length > 0) {
    const obj = {};
    for (const b of tool._http.body) if (args[b] !== undefined) obj[b] = args[b];
    body = JSON.stringify(obj);
  }
  const res = await fetch(url, { method: tool._http.method, headers, body });
  const text = await res.text();
  return { text: text || ('HTTP ' + res.status), isError: !res.ok };
}

async function handle(line) {
  let req;
  try { req = JSON.parse(line); } catch { return; }
  const { id, method, params } = req;
  if (method === 'initialize') {
    send({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION } } });
    return;
  }
  if (method === 'notifications/initialized') return;
  if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: TOOLS.map(({ _http, ...t }) => t) } });
    return;
  }
  if (method === 'tools/call') {
    const tool = TOOLS.find((t) => t.name === (params && params.name));
    if (!tool) {
      send({ jsonrpc: '2.0', id, error: { code: -32602, message: 'unknown tool: ' + (params && params.name) } });
      return;
    }
    try {
      const out = await callTool(tool, (params && params.arguments) || {});
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: out.text }], isError: out.isError } });
    } catch (e) {
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: String((e && e.message) || e) }], isError: true } });
    }
    return;
  }
  if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'method not found: ' + method } });
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let i;
  while ((i = buffer.indexOf('\\n')) >= 0) {
    const line = buffer.slice(0, i).trim();
    buffer = buffer.slice(i + 1);
    if (line) handle(line);
  }
});
`;
}

import type { GeneratedFile } from '@cn/contracts';
import type { PlannedOp, PlannedParam, ProjectionPlan } from './plan';
import { DO_NOT_EDIT } from './gen-util';

const JSON_SCHEMA_DIALECT = 'https://json-schema.org/draft/2020-12/schema';

interface ToolAnnotations {
  title: string;
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: ToolAnnotations;
  _http: { method: string; path: string; query: string[]; body: string[]; header: string[] };
}

/**
 * Project the IR into a production MCP server: a tool per operation, with accurate JSON-Schema
 * inputs (referenced models resolved into `$defs`, recursion handled by `$ref`) and behavioural
 * annotations. Ships both transports — stdio (`server.mjs`) and a hostable Streamable-HTTP server
 * (`http-server.mjs` + `Dockerfile`) — plus a `tools.json` manifest. Zero runtime dependencies.
 */
export function generateMcpServer(plan: ProjectionPlan): GeneratedFile[] {
  const schemas = (plan.ir.schemas ?? {}) as Record<string, unknown>;
  const tools: ToolDef[] = plan.resources
    .flatMap((r) => r.ops)
    .map((op) => ({
      name: op.tool,
      description: op.summary ?? op.description ?? `${op.httpMethod} ${op.path}`,
      inputSchema: inputSchema(op, schemas),
      annotations: annotationsFor(op),
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
    { path: 'http-server.mjs', content: httpServerMjs(plan, tools), executable: true },
    { path: 'Dockerfile', content: dockerfile() },
    { path: 'README.md', content: readme(plan) },
  ];
}

/**
 * MCP behavioural hints (per the tool-annotations spec), derived from the HTTP verb so clients can
 * reason about safety: GET/HEAD are read-only; DELETE/PUT/PATCH are destructive; everything that
 * hits a remote API is open-world.
 */
function annotationsFor(op: PlannedOp): ToolAnnotations {
  const m = op.httpMethod.toUpperCase();
  const read = m === 'GET' || m === 'HEAD';
  return {
    title: op.summary ?? titleCase(op.methodName),
    readOnlyHint: read,
    destructiveHint: m === 'DELETE' || m === 'PUT' || m === 'PATCH',
    idempotentHint: read || m === 'PUT' || m === 'DELETE',
    openWorldHint: true,
  };
}

/**
 * A tool's input as a self-contained JSON Schema. Object-typed params that reference a model emit
 * `{$ref:'#/$defs/<Model>'}`, and the transitive closure of referenced models is embedded under
 * `$defs` (with internal `#/components/schemas/*` refs rewritten to `#/$defs/*`). Recursive schemas
 * resolve naturally through the `$ref` cycle rather than being flattened to `{type:'object'}`.
 */
function inputSchema(op: PlannedOp, schemas: Record<string, unknown>): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  const roots: string[] = [];
  for (const p of op.params) {
    properties[p.name] = propertySchema(p, roots);
    if (p.required) required.push(p.name);
  }
  const result: Record<string, unknown> = { $schema: JSON_SCHEMA_DIALECT, type: 'object', properties };
  if (required.length > 0) result['required'] = required;
  result['additionalProperties'] = false;
  const defs = buildDefs(roots, schemas);
  if (Object.keys(defs).length > 0) result['$defs'] = defs;
  return result;
}

function propertySchema(p: PlannedParam, roots: string[]): Record<string, unknown> {
  if (p.ref) {
    roots.push(p.ref);
    return { $ref: `#/$defs/${p.ref}` };
  }
  const schema = scalarSchema(p.type);
  if (p.description) schema['description'] = p.description;
  return schema;
}

function scalarSchema(type: string): Record<string, unknown> {
  switch (type) {
    case 'string': return { type: 'string' };
    case 'datetime': return { type: 'string', format: 'date-time' };
    case 'integer': return { type: 'integer' };
    case 'number': return { type: 'number' };
    case 'boolean': return { type: 'boolean' };
    case 'array': return { type: 'array', items: {} };
    case 'object': return { type: 'object' };
    default: return {};
  }
}

/** BFS the referenced models into a `$defs` map (key-sorted for determinism), rewriting refs. */
function buildDefs(roots: string[], schemas: Record<string, unknown>): Record<string, unknown> {
  const defs: Record<string, unknown> = {};
  const seen = new Set<string>();
  const queue = [...roots];
  while (queue.length > 0) {
    const name = queue.shift()!;
    if (seen.has(name)) continue;
    seen.add(name);
    const raw = schemas[name];
    if (!isObject(raw)) continue;
    const found: string[] = [];
    defs[name] = rewriteRefs(raw, found);
    for (const r of found) if (!seen.has(r)) queue.push(r);
  }
  return sortKeys(defs) as Record<string, unknown>;
}

/** Deep-clone a schema, rewriting `#/components/schemas/X` → `#/$defs/X` and collecting each X. */
function rewriteRefs(node: unknown, found: string[]): unknown {
  if (Array.isArray(node)) return node.map((n) => rewriteRefs(n, found));
  if (isObject(node)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === '$ref' && typeof v === 'string') {
        const name = v.split('/').pop() ?? v;
        found.push(name);
        out[k] = `#/$defs/${name}`;
      } else {
        out[k] = rewriteRefs(v, found);
      }
    }
    return out;
  }
  return node;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (isObject(value)) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value).sort()) out[k] = sortKeys(value[k]);
    return out;
  }
  return value;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function titleCase(s: string): string {
  return s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
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
        scripts: { start: 'node server.mjs', 'start:http': 'node http-server.mjs' },
        engines: { node: '>=18' },
      },
      null,
      2,
    ) + '\n'
  );
}

function readme(plan: ProjectionPlan): string {
  const toolCount = plan.resources.reduce((n, r) => n + r.ops.length, 0);
  const base = plan.server || 'https://api.example';
  return (
    `# ${plan.title} — MCP server\n\n` +
    `Production MCP server exposing **${toolCount} tool(s)** (one per operation), with JSON-Schema\n` +
    `inputs (referenced models resolved into \`$defs\`) and behavioural annotations. Zero dependencies.\n\n` +
    `## Run (stdio — local clients)\n\n` +
    `\`\`\`bash\nCN_BASE_URL=${base} CN_TOKEN=... node server.mjs\n\`\`\`\n\n` +
    `Newline-delimited JSON-RPC: \`initialize\` → \`tools/list\` → \`tools/call\`.\n\n` +
    `## Host (Streamable HTTP — remote clients)\n\n` +
    `\`\`\`bash\nPORT=8000 CN_BASE_URL=${base} CN_TOKEN=... node http-server.mjs\n# → POST http://localhost:8000/mcp   (health: GET /health)\n\`\`\`\n\n` +
    `## Deploy (Docker)\n\n` +
    `\`\`\`bash\ndocker build -t ${plan.slug}-mcp .\ndocker run -p 8000:8000 -e CN_BASE_URL=${base} -e CN_TOKEN=... ${plan.slug}-mcp\n\`\`\`\n\n` +
    `\`tools.json\` is the standalone tool manifest (JSON-Schema 2020-12 inputs + MCP annotations).\n`
  );
}

function dockerfile(): string {
  return (
    `# ${DO_NOT_EDIT}\n` +
    `FROM node:20-alpine\n` +
    `WORKDIR /app\n` +
    `COPY . .\n` +
    `ENV PORT=8000\n` +
    `EXPOSE 8000\n` +
    `CMD ["node", "http-server.mjs"]\n`
  );
}

/** A hostable Streamable-HTTP MCP server (POST /mcp + GET /health), zero dependencies. */
function httpServerMjs(plan: ProjectionPlan, tools: ToolDef[]): string {
  return `#!/usr/bin/env node
// ${DO_NOT_EDIT}
// Streamable-HTTP MCP server (JSON-RPC over POST /mcp). No dependencies. Deployable behind any proxy.
import { createServer } from 'node:http';

const SERVER_NAME = ${JSON.stringify(`${plan.slug}-mcp`)};
const SERVER_VERSION = ${JSON.stringify(plan.apiVersion)};
const DEFAULT_BASE_URL = ${JSON.stringify(plan.server)};
const PORT = Number(process.env.PORT || 8000);
const TOOLS = ${JSON.stringify(tools, null, 2)};

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
  if (tool._http.body.length > 0) { const obj = {}; for (const b of tool._http.body) if (args[b] !== undefined) obj[b] = args[b]; body = JSON.stringify(obj); }
  const res = await fetch(url, { method: tool._http.method, headers, body });
  const text = await res.text();
  return { text: text || ('HTTP ' + res.status), isError: !res.ok };
}
async function dispatch(req) {
  const { id, method, params } = req;
  if (method === 'initialize') return { jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: SERVER_NAME, version: SERVER_VERSION } } };
  if (method === 'notifications/initialized') return null;
  if (method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: TOOLS.map(({ _http, ...t }) => t) } };
  if (method === 'tools/call') {
    const tool = TOOLS.find((t) => t.name === (params && params.name));
    if (!tool) return { jsonrpc: '2.0', id, error: { code: -32602, message: 'unknown tool: ' + (params && params.name) } };
    try { const out = await callTool(tool, (params && params.arguments) || {}); return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: out.text }], isError: out.isError } }; }
    catch (e) { return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: String((e && e.message) || e) }], isError: true } }; }
  }
  if (id !== undefined) return { jsonrpc: '2.0', id, error: { code: -32601, message: 'method not found: ' + method } };
  return null;
}
const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ status: 'ok', server: SERVER_NAME, tools: TOOLS.length })); return; }
  if (req.method !== 'POST' || (req.url || '').split('?')[0] !== '/mcp') { res.writeHead(404, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'POST /mcp or GET /health' })); return; }
  let data = '';
  req.on('data', (c) => { data += c; if (data.length > 8 * 1024 * 1024) req.destroy(); });
  req.on('end', async () => {
    let msg; try { msg = JSON.parse(data); } catch { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } })); return; }
    const out = Array.isArray(msg) ? (await Promise.all(msg.map(dispatch))).filter(Boolean) : await dispatch(msg);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(out == null ? '' : JSON.stringify(out));
  });
});
server.listen(PORT, () => process.stdout.write(SERVER_NAME + ' MCP (HTTP) on :' + PORT + ' — POST /mcp\\n'));
`;
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

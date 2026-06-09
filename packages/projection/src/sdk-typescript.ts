import type { GeneratedFile } from '@cn/contracts';
import { pascalIdent } from './naming';
import { tsType } from './typemap';
import type { PlannedOp, PlannedResource, ProjectionPlan } from './plan';
import { DO_NOT_EDIT, tsKey, tsPathTemplate } from './gen-util';
import { tsDoc } from './idents';

function tsTypeOf(plan: ProjectionPlan, t: { type: string; ref?: string }): string {
  if (t.ref) return plan.modelClassByName.get(t.ref) ?? pascalIdent(t.ref);
  return tsType(t);
}

/** Project the IR into an installable TypeScript SDK package. */
export function generateTypeScriptSdk(plan: ProjectionPlan): GeneratedFile[] {
  const files: GeneratedFile[] = [
    { path: 'package.json', content: packageJson(plan) },
    { path: 'tsconfig.json', content: tsconfig() },
    { path: 'README.md', content: readme(plan) },
    { path: 'src/core/http.ts', content: HTTP_TS },
    { path: 'src/models.ts', content: models(plan) },
    { path: 'src/client.ts', content: client(plan) },
    { path: 'src/index.ts', content: index() },
  ];
  for (const res of plan.resources) {
    files.push({ path: `src/resources/${res.command}.ts`, content: resource(plan, res) });
  }
  return files;
}

function clientClassName(plan: ProjectionPlan): string {
  return pascalIdent(plan.title) + 'Client';
}

function method(plan: ProjectionPlan, op: PlannedOp): string {
  const hasParams = op.params.length > 0;
  const arg = hasParams ? `params: models.${op.paramsType}` : '';
  const ret = op.returnRef ? `models.${tsTypeOf(plan, { type: 'object', ref: op.returnRef })}` : 'unknown';
  const reqLines: string[] = [`method: ${JSON.stringify(op.httpMethod)}`, `path: ${tsPathTemplate(op)}`];
  if (op.queryParams.length > 0) {
    reqLines.push(`query: { ${op.queryParams.map((p) => `${tsKey(p.name)}: params[${JSON.stringify(p.name)}]`).join(', ')} }`);
  }
  if (op.bodyParams.length > 0) {
    reqLines.push(`body: { ${op.bodyParams.map((p) => `${tsKey(p.name)}: params[${JSON.stringify(p.name)}]`).join(', ')} }`);
  }
  if (op.headerParams.length > 0) {
    reqLines.push(`headers: { ${op.headerParams.map((p) => `${tsKey(p.name)}: String(params[${JSON.stringify(p.name)}])`).join(', ')} }`);
  }
  const doc = op.summary ?? op.description;
  const jsdoc = doc ? `  /** ${tsDoc(doc)} */\n` : '';
  return (
    `${jsdoc}  ${op.methodName}(${arg}): Promise<${ret}> {\n` +
    `    return this._http.request<${ret}>({\n` +
    reqLines.map((l) => `      ${l},`).join('\n') +
    `\n    });\n  }`
  );
}

function resource(plan: ProjectionPlan, res: PlannedResource): string {
  return (
    `// ${DO_NOT_EDIT}\n` +
    `import type { HttpClient } from '../core/http';\n` +
    `import type * as models from '../models';\n\n` +
    `export class ${res.className} {\n` +
    `  constructor(private readonly _http: HttpClient) {}\n\n` +
    res.ops.map((op) => method(plan, op)).join('\n\n') +
    `\n}\n`
  );
}

function client(plan: ProjectionPlan): string {
  const imports = plan.resources
    .map((r) => `import { ${r.className} } from './resources/${r.command}';`)
    .join('\n');
  const props = plan.resources.map((r) => `  readonly ${r.prop}: ${r.className};`).join('\n');
  const inits = plan.resources.map((r) => `    this.${r.prop} = new ${r.className}(this._http);`).join('\n');
  return (
    `// ${DO_NOT_EDIT}\n` +
    `import { HttpClient, type ClientOptions } from './core/http';\n` +
    `${imports}\n\n` +
    `export const DEFAULT_BASE_URL = ${JSON.stringify(plan.server)};\n\n` +
    `/** ${plan.title} — generated client. */\n` +
    `export class ${clientClassName(plan)} {\n` +
    `  private readonly _http: HttpClient;\n` +
    `${props}\n\n` +
    `  constructor(options: ClientOptions = {}) {\n` +
    `    this._http = new HttpClient({ baseUrl: options.baseUrl ?? DEFAULT_BASE_URL, token: options.token });\n` +
    `${inits}\n` +
    `  }\n}\n`
  );
}

function index(): string {
  return `// ${DO_NOT_EDIT}\nexport * from './client';\nexport * from './models';\nexport type { ClientOptions } from './core/http';\n`;
}

function models(plan: ProjectionPlan): string {
  const out: string[] = [`// ${DO_NOT_EDIT}`, ''];
  for (const model of plan.models) {
    out.push(`export interface ${model.className} {`);
    for (const f of model.fields) {
      out.push(`  ${tsKey(f.name)}${f.required ? '' : '?'}: ${tsTypeOf(plan, f)};`);
    }
    out.push('}', '');
  }
  for (const res of plan.resources) {
    for (const op of res.ops) {
      if (op.params.length === 0) continue;
      out.push(`export interface ${op.paramsType} {`);
      for (const p of op.params) {
        out.push(`  ${tsKey(p.name)}${p.required ? '' : '?'}: ${tsTypeOf(plan, p)};`);
      }
      out.push('}', '');
    }
  }
  return out.join('\n');
}

function packageJson(plan: ProjectionPlan): string {
  return (
    JSON.stringify(
      {
        name: plan.packageName,
        version: plan.apiVersion,
        description: `${plan.title} TypeScript SDK (generated)`,
        type: 'module',
        main: './src/index.ts',
        types: './src/index.ts',
        scripts: { typecheck: 'tsc --noEmit' },
        devDependencies: { typescript: '^5.4.0' },
        engines: { node: '>=18' },
      },
      null,
      2,
    ) + '\n'
  );
}

function tsconfig(): string {
  return (
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          strict: true,
          skipLibCheck: true,
          noEmit: true,
          lib: ['ES2022', 'DOM'],
        },
        include: ['src'],
      },
      null,
      2,
    ) + '\n'
  );
}

function readme(plan: ProjectionPlan): string {
  const first = plan.resources[0]?.ops[0];
  const example = first
    ? `import { ${clientClassName(plan)} } from '${plan.packageName}';\n\n` +
      `const client = new ${clientClassName(plan)}({ token: process.env.API_TOKEN });\n` +
      `const result = await client.${plan.resources[0]!.prop}.${first.methodName}(${first.params.length ? '{ /* params */ }' : ''});\n`
    : '// no operations';
  return (
    `# ${plan.title} — TypeScript SDK\n\n` +
    `Generated from the connector IR. Base URL: \`${plan.server || '(set baseUrl)'}\`.\n\n` +
    '```ts\n' +
    example +
    '```\n'
  );
}

const HTTP_TS = `// ${DO_NOT_EDIT}
export interface ClientOptions {
  baseUrl?: string;
  token?: string;
}

export interface RequestArgs {
  method: string;
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, string>;
}

export class HttpClient {
  private readonly baseUrl: string;
  private readonly token: string | undefined;

  constructor(opts: { baseUrl: string; token?: string }) {
    this.baseUrl = opts.baseUrl;
    this.token = opts.token;
  }

  async request<T>(args: RequestArgs): Promise<T> {
    if (!this.baseUrl) throw new Error('baseUrl is required (pass it to the client constructor)');
    const url = new URL(this.baseUrl.replace(/\\/+$/, '') + args.path);
    if (args.query) {
      for (const [k, v] of Object.entries(args.query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }
    const headers: Record<string, string> = { 'content-type': 'application/json', ...(args.headers ?? {}) };
    if (this.token) headers['authorization'] = \`Bearer \${this.token}\`;
    const res = await fetch(url, {
      method: args.method,
      headers,
      body: args.body !== undefined ? JSON.stringify(args.body) : undefined,
    });
    if (!res.ok) throw new Error(\`HTTP \${res.status} \${res.statusText}: \${await res.text()}\`);
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
}
`;

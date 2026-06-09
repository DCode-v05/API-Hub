import type { GeneratedFile } from '@cn/contracts';
import { flagName } from './naming';
import { DO_NOT_EDIT } from './gen-util';
import type { ProjectionPlan } from './plan';

interface CommandDef {
  command: string;
  verb: string;
  summary: string;
  method: string;
  path: string;
  flags: { flag: string; wire: string; in: string; required: boolean; type: string }[];
}

/** Project the IR into a runnable CLI (`<bin> <resource> <verb> --flags`). */
export function generateCli(plan: ProjectionPlan): GeneratedFile[] {
  const commands: CommandDef[] = [];
  for (const res of plan.resources) {
    for (const op of res.ops) {
      commands.push({
        command: res.command,
        verb: op.methodName,
        summary: op.summary ?? op.description ?? `${op.httpMethod} ${op.path}`,
        method: op.httpMethod,
        path: op.path,
        flags: op.params.map((p) => ({
          flag: flagName(p.name),
          wire: p.name,
          in: p.in,
          required: p.required,
          type: p.type,
        })),
      });
    }
  }
  return [
    { path: 'package.json', content: packageJson(plan) },
    { path: 'cli.mjs', content: cliMjs(plan, commands), executable: true },
    { path: 'USAGE.md', content: usageDoc(plan, commands) },
    { path: 'README.md', content: readme(plan) },
  ];
}

function packageJson(plan: ProjectionPlan): string {
  return (
    JSON.stringify(
      {
        name: `${plan.slug}-cli`,
        version: plan.apiVersion,
        description: `${plan.title} CLI (generated)`,
        type: 'module',
        bin: { [plan.binName]: './cli.mjs' },
        engines: { node: '>=18' },
      },
      null,
      2,
    ) + '\n'
  );
}

function readme(plan: ProjectionPlan): string {
  return (
    `# ${plan.title} — CLI\n\n` +
    `\`\`\`bash\nexport CN_BASE_URL=${plan.server || 'https://api.example'}\nexport CN_TOKEN=...\nnode cli.mjs --help\n\`\`\`\n\n` +
    `See [USAGE.md](./USAGE.md) for the command list.\n`
  );
}

function usageDoc(plan: ProjectionPlan, commands: CommandDef[]): string {
  const lines = [`# ${plan.binName} — commands`, ''];
  for (const c of commands) {
    const flags = c.flags
      .map((f) => (f.required ? `--${f.flag} <${f.type}>` : `[--${f.flag} <${f.type}>]`))
      .join(' ');
    lines.push(`### \`${plan.binName} ${c.command} ${c.verb} ${flags}\``);
    lines.push(`${c.summary}  (\`${c.method} ${c.path}\`)`, '');
  }
  return lines.join('\n');
}

function cliMjs(plan: ProjectionPlan, commands: CommandDef[]): string {
  return `#!/usr/bin/env node
// ${DO_NOT_EDIT}
import { parseArgs } from 'node:util';

const BIN = ${JSON.stringify(plan.binName)};
const DEFAULT_BASE_URL = ${JSON.stringify(plan.server)};
const COMMANDS = ${JSON.stringify(commands, null, 2)};

function coerce(v, type) {
  if (v === undefined) return undefined;
  if (type === 'number' || type === 'integer') {
    const n = Number(v);
    return Number.isNaN(n) ? v : n;
  }
  return v;
}

function buildUrl(base, tmpl, args) {
  const path = tmpl.replace(/\\{([^}]+)\\}/g, (_m, n) => encodeURIComponent(String(args[n])));
  return (base || '').replace(/\\/+$/, '') + path;
}

function usage() {
  process.stdout.write(BIN + ' — generated CLI\\n\\nUSAGE\\n  ' + BIN + ' <resource> <verb> [--flags]\\n\\nCOMMANDS\\n');
  for (const c of COMMANDS) {
    const flags = c.flags.map((f) => (f.required ? '--' + f.flag + ' <' + f.type + '>' : '[--' + f.flag + ']')).join(' ');
    process.stdout.write('  ' + BIN + ' ' + c.command + ' ' + c.verb + ' ' + flags + '\\n');
  }
  process.stdout.write('\\nAuth/base via env: CN_BASE_URL, CN_TOKEN.\\n');
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') { usage(); return 0; }
  const [command, verb, ...rest] = argv;
  if (!verb || verb === '--help') {
    for (const c of COMMANDS.filter((c) => c.command === command)) {
      process.stdout.write(BIN + ' ' + c.command + ' ' + c.verb + '  — ' + c.summary + '\\n');
    }
    return 0;
  }
  const cmd = COMMANDS.find((c) => c.command === command && c.verb === verb);
  if (!cmd) { process.stderr.write('unknown command: ' + command + ' ' + verb + '\\n\\n'); usage(); return 2; }

  const options = {};
  for (const f of cmd.flags) options[f.flag] = { type: f.type === 'boolean' ? 'boolean' : 'string' };
  let values;
  try { ({ values } = parseArgs({ args: rest, options, allowPositionals: false, strict: true })); }
  catch (e) { process.stderr.write(BIN + ': ' + (e && e.message) + '\\n'); return 2; }

  for (const f of cmd.flags) {
    if (f.required && values[f.flag] === undefined) { process.stderr.write('missing required --' + f.flag + '\\n'); return 2; }
  }

  const pathArgs = {}, query = {}, headers = {}, body = {};
  let hasBody = false;
  for (const f of cmd.flags) {
    if (values[f.flag] === undefined) continue;
    const val = coerce(values[f.flag], f.type);
    if (f.in === 'path') pathArgs[f.wire] = val;
    else if (f.in === 'query') query[f.wire] = val;
    else if (f.in === 'header') headers[f.wire] = String(val);
    else { body[f.wire] = val; hasBody = true; }
  }

  const base = process.env.CN_BASE_URL || DEFAULT_BASE_URL;
  if (!base) { process.stderr.write('set CN_BASE_URL (no default server in the spec)\\n'); return 1; }
  const url = new URL(buildUrl(base, cmd.path, pathArgs));
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
  const h = { 'content-type': 'application/json', ...headers };
  if (process.env.CN_TOKEN) h['authorization'] = 'Bearer ' + process.env.CN_TOKEN;

  const res = await fetch(url, { method: cmd.method, headers: h, body: hasBody ? JSON.stringify(body) : undefined });
  const text = await res.text();
  process.stdout.write(text + '\\n');
  return res.ok ? 0 : 1;
}

main().then((code) => process.exit(code)).catch((e) => { process.stderr.write(String((e && e.message) || e) + '\\n'); process.exit(1); });
`;
}

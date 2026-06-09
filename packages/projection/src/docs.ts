import type { GeneratedFile } from '@cn/contracts';
import { flagName } from './naming';
import { pySafeIdent } from './idents';
import type { PlannedOp, PlannedResource, ProjectionPlan } from './plan';

/** Project the IR into a markdown documentation set. */
export function generateDocs(plan: ProjectionPlan): GeneratedFile[] {
  const files: GeneratedFile[] = [{ path: 'README.md', content: indexMd(plan) }];
  for (const res of plan.resources) {
    files.push({ path: `${res.command}.md`, content: resourceMd(plan, res) });
  }
  return files;
}

function indexMd(plan: ProjectionPlan): string {
  const lines = [
    `# ${plan.title}`,
    '',
    `Version \`${plan.apiVersion}\` · Base URL \`${plan.server || '(none)'}\` · Auth \`${plan.auth}\``,
    '',
    `Generated from the connector IR (\`${plan.ir.hash}\`).`,
    '',
    '## Resources',
    '',
  ];
  for (const res of plan.resources) {
    lines.push(`- [${res.name}](./${res.command}.md) — ${res.ops.length} operation(s)`);
  }
  return lines.join('\n') + '\n';
}

function resourceMd(plan: ProjectionPlan, res: PlannedResource): string {
  const lines = [`# ${res.name}`, ''];
  for (const op of res.ops) {
    lines.push(`## ${op.methodName}`, '');
    if (op.summary) lines.push(op.summary, '');
    if (op.description && op.description !== op.summary) lines.push(op.description, '');
    lines.push('```', `${op.httpMethod} ${op.path}`, '```', '');
    lines.push(...paramsTable(op));
    if (op.returnRef) lines.push('', `**Returns:** \`${op.returnRef}\` (status ${op.successStatus ?? '2xx'})`);
    lines.push('', '### Examples', '', ...examples(plan, res, op), '');
  }
  return lines.join('\n') + '\n';
}

function paramsTable(op: PlannedOp): string[] {
  if (op.params.length === 0) return ['_No parameters._'];
  const rows = op.params.map(
    (p) => `| \`${p.name}\` | ${p.in} | ${p.ref ?? p.type} | ${p.required ? 'yes' : 'no'} | ${p.description ?? ''} |`,
  );
  return ['| name | in | type | required | description |', '| --- | --- | --- | --- | --- |', ...rows];
}

function examples(plan: ProjectionPlan, res: PlannedResource, op: PlannedOp): string[] {
  const base = plan.server || 'https://api.example';
  const bodyJson = JSON.stringify(
    Object.fromEntries(op.bodyParams.map((p) => [p.name, placeholder(p.type)])),
  );
  const curlPath = op.path.replace(/\{([^}]+)\}/g, (_m, n: string) => `<${n}>`);
  const shellBody = bodyJson.replace(/'/g, "'\\''"); // safe inside shell single quotes
  const curl =
    `curl -X ${op.httpMethod} "${base}${curlPath}"` +
    (plan.auth !== 'none' ? ` \\\n  -H "authorization: Bearer $TOKEN"` : '') +
    (op.bodyParams.length > 0 ? ` \\\n  -H "content-type: application/json" \\\n  -d '${shellBody}'` : '');

  const tsArgs = op.params.length > 0 ? `{ ${op.params.map((p) => `${tsKey(p.name)}: ${placeholderLiteral(p.type)}`).join(', ')} }` : '';
  const pyArgs = op.params.map((p) => `${pySafeIdent(p.name)}=${placeholderLiteral(p.type)}`).join(', ');
  const cliFlags = op.params.map((p) => `--${flagName(p.name)} ${placeholderCli(p.type)}`).join(' ');

  return [
    '```bash',
    `# curl`,
    curl,
    '```',
    '',
    '```ts',
    `await client.${res.prop}.${op.methodName}(${tsArgs});`,
    '```',
    '',
    '```python',
    `client.${res.prop}.${op.methodName}(${pyArgs})`,
    '```',
    '',
    '```bash',
    `# cli`,
    `${plan.binName} ${res.command} ${op.methodName} ${cliFlags}`.trimEnd(),
    '```',
  ];
}

function tsKey(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : JSON.stringify(name);
}

function placeholder(type: string): unknown {
  if (type === 'number' || type === 'integer') return 0;
  if (type === 'boolean') return true;
  return 'string';
}

function placeholderLiteral(type: string): string {
  if (type === 'number' || type === 'integer') return '0';
  if (type === 'boolean') return 'true';
  return '"..."';
}

function placeholderCli(type: string): string {
  if (type === 'number' || type === 'integer') return '0';
  if (type === 'boolean') return '';
  return '"..."';
}

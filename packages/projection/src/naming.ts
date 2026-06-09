import type { IrOperation } from '@cn/contracts';

/** Split any identifier (camelCase, snake_case, kebab, spaced) into lowercased words. */
export function words(s: string): string[] {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

function cap(s: string): string {
  return s.length > 0 ? s[0]!.toUpperCase() + s.slice(1) : s;
}

export function camel(s: string): string {
  return words(s)
    .map((w, i) => (i === 0 ? w : cap(w)))
    .join('');
}

export function pascal(s: string): string {
  return words(s).map(cap).join('') || 'Model';
}

/** PascalCase guaranteed to be a valid identifier start (prefixed if it would begin with a digit). */
export function pascalIdent(s: string): string {
  const p = pascal(s);
  return /^[A-Za-z_]/.test(p) ? p : 'Api' + p;
}

export function snake(s: string): string {
  return words(s).join('_');
}

export function kebab(s: string): string {
  return words(s).join('-');
}

export function screaming(s: string): string {
  return words(s).join('_').toUpperCase();
}

export function singularize(s: string): string {
  if (s.endsWith('ies')) return s.slice(0, -3) + 'y';
  if (s.endsWith('ss')) return s;
  if (s.endsWith('s')) return s.slice(0, -1);
  return s;
}

function stripOp(id: string): string {
  return id.replace(/^op_/, '');
}

/** RESTful verb from method + path shape: create/list/get/update/delete. */
export function restVerb(method: string, path: string): string {
  const segs = path.split('/').filter(Boolean);
  const last = segs[segs.length - 1] ?? '';
  const itemLevel = last.startsWith('{');
  switch (method.toUpperCase()) {
    case 'GET':
      return itemLevel ? 'get' : 'list';
    case 'POST':
      return 'create';
    case 'PUT':
    case 'PATCH':
      return 'update';
    case 'DELETE':
      return 'delete';
    default:
      return method.toLowerCase();
  }
}

/**
 * Method names per resource, with deterministic collision resolution. Prefers the clean REST verb
 * (projects.create), falls back to the operation-id minus the resource noun, then a numeric suffix.
 */
export function methodNamesFor(resource: string, ops: IrOperation[]): Map<string, string> {
  const out = new Map<string, string>();
  const used = new Set<string>();
  const resWords = new Set([...words(resource), ...words(singularize(resource))]);
  const sorted = [...ops].sort((a, b) => a.id.localeCompare(b.id));

  for (const op of sorted) {
    const verb = camel(restVerb(op.method, op.path));
    const idMinusRes = camel(words(stripOp(op.id)).filter((w) => !resWords.has(w)).join(' '));
    const fullId = camel(stripOp(op.id));
    const candidates = [verb, idMinusRes, fullId].filter((c) => c.length > 0);
    let name = candidates.find((c) => !used.has(c)) ?? candidates[0] ?? camel(op.method);
    let n = 2;
    const base = name;
    while (used.has(name)) {
      name = base + String(n);
      n += 1;
    }
    used.add(name);
    out.set(op.id, name);
  }
  return out;
}

/** MCP tool name: snake_case of the operation identity, e.g. op_createProject → create_project. */
export function toolName(op: IrOperation): string {
  return snake(stripOp(op.id));
}

/** CLI flag for a field: kebab-case, e.g. team_id → team-id. */
export function flagName(fieldName: string): string {
  return kebab(fieldName);
}

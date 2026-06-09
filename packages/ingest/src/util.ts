export const HTTP_METHODS = [
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
] as const;

export function isHttpMethod(key: string): boolean {
  return (HTTP_METHODS as readonly string[]).includes(key);
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Visit every object node in a JSON value, iteratively (explicit stack) so a pathologically deep
 * but legal document can't overflow the call stack. A `seen` set guards true object cycles.
 */
export function walkNodes(root: unknown, visit: (node: Record<string, unknown>) => void): void {
  const seen = new Set<object>();
  const stack: unknown[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === null || typeof node !== 'object') continue;
    if (seen.has(node)) continue;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) stack.push(item);
      continue;
    }
    const obj = node as Record<string, unknown>;
    visit(obj);
    for (const value of Object.values(obj)) stack.push(value);
  }
}

/** Collect every $ref pointing outside the document (not starting with "#"). */
export function collectExternalRefs(root: unknown): string[] {
  const refs: string[] = [];
  walkNodes(root, (obj) => {
    const ref = obj['$ref'];
    if (typeof ref === 'string' && ref.length > 0 && !ref.startsWith('#')) refs.push(ref);
  });
  return refs;
}

/** Collect every internal $ref ("#/...") in the document. */
export function collectInternalRefs(root: unknown): string[] {
  const refs: string[] = [];
  walkNodes(root, (obj) => {
    const ref = obj['$ref'];
    if (typeof ref === 'string' && ref.startsWith('#')) refs.push(ref);
  });
  return refs;
}

function decodePointer(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

/** Resolve a local JSON Pointer ("#/a/b/0") against the root. Returns undefined if absent. */
export function resolvePointer(root: unknown, ref: string): unknown {
  if (!ref.startsWith('#')) return undefined;
  const parts = ref.slice(1).split('/').filter((p) => p.length > 0).map(decodePointer);
  let current: unknown = root;
  for (const part of parts) {
    if (Array.isArray(current)) {
      current = current[Number(part)];
    } else if (isObject(current)) {
      // Own-property only: a $ref like "#/.../constructor" must NOT resolve to Object.prototype.
      if (!Object.prototype.hasOwnProperty.call(current, part)) return undefined;
      current = current[part];
    } else {
      return undefined;
    }
    if (current === undefined) return undefined;
  }
  return current;
}

export function refName(ref: string): string {
  const i = ref.lastIndexOf('/');
  return i >= 0 ? ref.slice(i + 1) : ref;
}

/** Normalize a JSON-Schema-ish node to a single scalar type name used across the IR. */
export function schemaType(schema: unknown): string {
  if (!isObject(schema)) return 'unknown';
  if (typeof schema['$ref'] === 'string') return refName(schema['$ref'] as string);
  let t: unknown = schema['type'];
  if (Array.isArray(t)) t = t.find((x) => x !== 'null') ?? t[0];
  const format = schema['format'];
  if (t === 'string' && (format === 'date-time' || format === 'date')) return 'datetime';
  if (typeof t === 'string') return t;
  if (isObject(schema['properties'])) return 'object';
  if (schema['items'] !== undefined) return 'array';
  return 'unknown';
}

export function firstString(value: unknown): string | undefined {
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

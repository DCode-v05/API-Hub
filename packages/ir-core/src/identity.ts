/**
 * Stable, identity-based operation IDs. The id is derived from the operation's *identity*
 * (operationId, or method+path) — not its file position — so a later spec edit or reorder doesn't
 * change it, and diffs/overrides bound to it survive.
 */
export function deriveOperationId(path: string, method: string, op: Record<string, unknown>): string {
  const explicit = typeof op['operationId'] === 'string' ? op['operationId'].trim() : '';
  const base = explicit !== '' ? explicit : `${method.toLowerCase()}_${pathSlug(path)}`;
  return `op_${sanitize(base)}`;
}

/** The resource a connector operation belongs to: its first tag, else the first path segment. */
export function deriveResource(path: string, op: Record<string, unknown>): string {
  const tags = op['tags'];
  if (Array.isArray(tags) && typeof tags[0] === 'string' && tags[0].trim() !== '') {
    return slugLower(tags[0]);
  }
  return firstSegment(path);
}

function pathSlug(path: string): string {
  const cleaned = path
    .replace(/^\/+|\/+$/g, '')
    .replace(/\{([^}]+)\}/g, '$1')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'root';
}

function firstSegment(path: string): string {
  const seg = path
    .replace(/^\/+/, '')
    .split('/')
    .find((s) => s !== '' && !s.startsWith('{'));
  return seg ? slugLower(seg) : 'root';
}

function sanitize(s: string): string {
  return s.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'op';
}

function slugLower(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'resource';
}

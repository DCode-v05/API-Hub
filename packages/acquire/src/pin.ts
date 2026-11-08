import { createHash } from 'node:crypto';

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const input = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(input).sort()) {
      out[key] = sortKeys(input[key]);
    }
    return out;
  }
  return value;
}

export const HASH_ALGO = 'sha256';
export const HASH_PREFIX = 'sha256:';

export function contentHash(document: unknown): string {
  return createHash(HASH_ALGO).update(canonicalJson(document)).digest('hex');
}

export function pinHash(document: unknown): string {
  return HASH_PREFIX + contentHash(document);
}

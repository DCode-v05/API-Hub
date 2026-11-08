import { createHash } from 'node:crypto';
import { canonicalJson } from './canonicalize';

export const HASH_PREFIX = 'sha256:';

export function irHash(value: unknown): string {
  return HASH_PREFIX + createHash('sha256').update(canonicalJson(value)).digest('hex');
}

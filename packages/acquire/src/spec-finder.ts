import { sep } from 'node:path';
import { walkFiles } from './fsutil';

const SPEC_NAME = /^(openapi|swagger|api)\.(ya?ml|json)$/i;

/**
 * Find candidate OpenAPI specs under `root`. Used by the github adapter to locate the spec in a
 * cloned tree when the caller didn't name one. Deterministic ordering: shallower paths first.
 */
export function findOpenApiSpecs(root: string, maxDepth = 4): string[] {
  const found = walkFiles(root, (name) => SPEC_NAME.test(name), maxDepth);
  return found.sort((a, b) => {
    const da = a.split(sep).length;
    const db = b.split(sep).length;
    return da !== db ? da - db : a.localeCompare(b);
  });
}

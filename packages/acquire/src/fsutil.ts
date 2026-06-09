import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.venv',
  'venv',
  '__pycache__',
  '.github',
  'vendor',
  '.tox',
  'coverage',
]);

/**
 * Depth-bounded recursive file walk that skips the usual noise directories. Returns absolute
 * file paths whose basename passes `match`, in deterministic order (shallower first, then
 * alphabetical) so two runs over the same tree enumerate identically.
 */
export function walkFiles(
  root: string,
  match: (name: string) => boolean,
  maxDepth = 6,
): string[] {
  const found: string[] = [];
  const walk = (dir: string, depth: number): void => {
    if (depth > maxDepth) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries.sort()) {
      const full = join(dir, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (!SKIP_DIRS.has(name)) walk(full, depth + 1);
      } else if (match(name)) {
        found.push(full);
      }
    }
  };
  walk(root, 0);
  return found;
}

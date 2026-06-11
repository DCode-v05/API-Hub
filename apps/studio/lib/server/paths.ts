import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

/**
 * Walk up from cwd to the monorepo root (the dir holding cn.config.json / samples). The studio's
 * dev server runs with cwd = apps/studio, so the pipeline samples and the cn launcher live a few
 * levels up.
 */
export function repoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'cn.config.json')) || existsSync(join(dir, 'packages', 'cli', 'bin', 'cn.mjs'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

/** Absolute path to the `cn` CLI launcher (run via `node <cnBin> …`). */
export function cnBin(): string {
  return join(repoRoot(), 'packages', 'cli', 'bin', 'cn.mjs');
}

/**
 * Resolve a user-supplied path. Relative paths resolve against the REPO ROOT (not the studio's cwd,
 * which is apps/studio) so intuitive inputs like `samples/sdk-typescript` work as typed.
 */
export function resolveUserPath(p: string): string {
  return isAbsolute(p) ? p : resolve(repoRoot(), p);
}

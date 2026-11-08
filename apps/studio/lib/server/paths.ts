import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

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

export function cnBin(): string {
  return join(repoRoot(), 'packages', 'cli', 'bin', 'cn.mjs');
}

export function resolveUserPath(p: string): string {
  return isAbsolute(p) ? p : resolve(repoRoot(), p);
}

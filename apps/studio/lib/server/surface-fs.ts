import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Write a generated surface's files into `dir`. File paths are POSIX-style subpaths (e.g.
 * `src/core/http.ts`); they're split and re-joined with the OS separator so it works on Windows too.
 */
export function writeSurfaceFiles(dir: string, files: { path: string; content: string }[]): void {
  for (const f of files) {
    const full = join(dir, ...f.path.split('/'));
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, f.content);
  }
}

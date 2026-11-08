import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function writeSurfaceFiles(dir: string, files: { path: string; content: string }[]): void {
  for (const f of files) {
    const full = join(dir, ...f.path.split('/'));
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, f.content);
  }
}

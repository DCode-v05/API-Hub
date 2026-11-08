import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function loadStudioEnv(root = process.cwd()): void {
  for (const file of [join(root, '.env.local'), join(root, '.env')]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      const key = m[1]!;
      if (process.env[key] !== undefined) continue;
      let val = m[2]!;
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      process.env[key] = val;
    }
  }
}

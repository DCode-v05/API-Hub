#!/usr/bin/env node
// Launcher: run the TypeScript entry under tsx without a shell, so paths containing spaces and
// flag arguments are forwarded verbatim. (Avoid `npm run cn -- …`; npm intercepts --flags.)
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, '..', 'src', 'index.ts');

const require = createRequire(import.meta.url);
let tsxImport;
try {
  tsxImport = pathToFileURL(require.resolve('tsx')).href;
} catch {
  process.stderr.write('cn: tsx is required to run from source — run `npm install` first.\n');
  process.exit(1);
}

const res = spawnSync(process.execPath, ['--import', tsxImport, entry, ...process.argv.slice(2)], {
  stdio: 'inherit',
});
process.exit(res.status ?? 1);

// One-shot: create the schema (idempotent) and ensure the session secret exists.
//   npm run studio:db:init
import { loadStudioEnv } from '../lib/server/env';
import { closePool, ensureReady } from '../lib/server/db';

loadStudioEnv();

try {
  await ensureReady();
  process.stdout.write('✓ PostgreSQL schema is ready (users, presets, pats, runs).\n');
} catch (e) {
  process.stderr.write(`✗ DB init failed: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exitCode = 1;
} finally {
  await closePool();
}

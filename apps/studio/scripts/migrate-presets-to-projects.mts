// One-shot migration: convert watchable saved presets into version-controlled Projects.
//   npm run studio:migrate:projects
// Presets whose source can't be re-fetched (pasted specs, stdio commands, or a GitHub repo without a
// saved PAT) are skipped and logged. Existing projects are left untouched; name collisions are
// skipped. Run it explicitly — it is NOT part of the schema bootstrap.
import { loadStudioEnv } from '../lib/server/env';
import { closePool, ensureReady, getPool } from '../lib/server/db';
import { isWatchable } from '../lib/cn/watchable';
import { createProject } from '../lib/server/store';
import type { RunRequest, StageSourceKind } from '../lib/events';

loadStudioEnv();
await ensureReady();
const pool = getPool();

const { rows } = await pool.query<{ id: string; user_id: string; kind: StageSourceKind; name: string; request: RunRequest }>(
  `SELECT id, user_id, kind, name, request FROM presets ORDER BY created_at ASC`,
);

let migrated = 0;
let skipped = 0;

for (const p of rows) {
  const request: RunRequest = { ...p.request, kind: p.kind };
  const watch = isWatchable(request);
  if (!watch.ok) {
    process.stdout.write(`· skip "${p.name}" (${p.kind}) — ${watch.reason}\n`);
    skipped += 1;
    continue;
  }
  try {
    await createProject(p.user_id, {
      name: p.name,
      kind: p.kind,
      request,
      patId: request.patId ?? null,
      watchEnabled: false,
    });
    migrated += 1;
    process.stdout.write(`✓ project "${p.name}" (${p.kind})\n`);
  } catch (e) {
    skipped += 1;
    process.stdout.write(`· skip "${p.name}" — ${e instanceof Error ? e.message : String(e)}\n`);
  }
}

process.stdout.write(`\nDone: ${migrated} migrated, ${skipped} skipped (of ${rows.length} presets).\n`);
await closePool();

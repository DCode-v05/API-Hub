// One-shot migration: import a legacy file store (apps/studio/.data) into PostgreSQL.
//   npm run studio:db:import
// Idempotent (ON CONFLICT DO NOTHING). Also imports the old signing secret so existing sessions
// stay valid and saved PATs remain decryptable. Set STUDIO_DATA_DIR to import from elsewhere.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadStudioEnv } from '../lib/server/env';
import { closePool, getPool, ensureReady } from '../lib/server/db';

loadStudioEnv();

const dataDir = process.env['STUDIO_DATA_DIR'] || join(process.cwd(), 'apps', 'studio', '.data');
const dbPath = join(dataDir, 'db.json');

interface LegacyDB {
  users?: Record<string, unknown>[];
  presets?: Record<string, unknown>[];
  pats?: Record<string, unknown>[];
  runs?: Record<string, unknown>[];
}

if (!existsSync(dbPath)) {
  process.stderr.write(`No legacy store found at ${dbPath} — nothing to import.\n`);
  process.exit(0);
}

await ensureReady();
const pool = getPool();
const db = JSON.parse(readFileSync(dbPath, 'utf8')) as LegacyDB;
const counts = { users: 0, presets: 0, pats: 0, runs: 0 };

// Preserve the old signing secret (unless STUDIO_SECRET is set) so sessions/PATs keep working.
const secretFile = join(dataDir, 'secret');
if (!process.env['STUDIO_SECRET'] && existsSync(secretFile)) {
  const b64 = readFileSync(secretFile).toString('base64');
  await pool.query(
    `INSERT INTO app_meta (key, value) VALUES ('session_secret', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [b64],
  );
  process.stdout.write('· imported legacy session secret\n');
}

for (const u of db.users ?? []) {
  const r = await pool.query(
    `INSERT INTO users (id, email, email_lower, name, password_hash, salt, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
    [u['id'], u['email'], u['emailLower'], u['name'], u['passwordHash'], u['salt'], u['createdAt']],
  );
  counts.users += r.rowCount ?? 0;
}

for (const p of db.pats ?? []) {
  const r = await pool.query(
    `INSERT INTO pats (id, user_id, name, last4, iv, ct, tag, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
    [p['id'], p['userId'], p['name'], p['last4'], p['iv'], p['ct'], p['tag'], p['createdAt']],
  );
  counts.pats += r.rowCount ?? 0;
}

for (const p of db.presets ?? []) {
  const r = await pool.query(
    `INSERT INTO presets (id, user_id, kind, name, request, created_at)
     VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
    [p['id'], p['userId'], p['kind'], p['name'], JSON.stringify(p['request'] ?? {}), p['createdAt']],
  );
  counts.presets += r.rowCount ?? 0;
}

for (const m of db.runs ?? []) {
  const payloadFile = join(dataDir, 'runs', `${String(m['id'])}.json`);
  const payload = existsSync(payloadFile) ? JSON.parse(readFileSync(payloadFile, 'utf8')) : { meta: m };
  const r = await pool.query(
    `INSERT INTO runs (id, user_id, kind, label, describe, ok, valid, total_ms, op_count, ir_hash,
                       file_count, error_count, warning_count, proposal_count, payload, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT (id) DO NOTHING`,
    [
      m['id'], m['userId'], m['kind'], m['label'], m['describe'] ?? '', m['ok'], m['valid'], m['totalMs'] ?? 0,
      m['opCount'] ?? 0, m['irHash'] ?? '', m['fileCount'] ?? 0, m['errorCount'] ?? 0, m['warningCount'] ?? 0,
      m['proposalCount'] ?? 0, JSON.stringify(payload), m['createdAt'],
    ],
  );
  counts.runs += r.rowCount ?? 0;
}

process.stdout.write(`✓ imported: ${counts.users} users, ${counts.pats} PATs, ${counts.presets} presets, ${counts.runs} runs\n`);
await closePool();

import { randomBytes } from 'node:crypto';
import { Pool, type QueryResultRow } from 'pg';

/**
 * PostgreSQL access layer. A single pooled connection (kept on globalThis so dev hot-reload doesn't
 * leak pools), an idempotent schema bootstrap run once per process, and the session-signing secret
 * stored in the DB (env-overridable). All store functions go through `query()`, which guarantees
 * the schema + secret are ready before the first statement.
 */

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS app_meta (
  key   text PRIMARY KEY,
  value text NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id            text PRIMARY KEY,
  email         text NOT NULL,
  email_lower   text NOT NULL UNIQUE,
  name          text NOT NULL,
  password_hash text NOT NULL,
  salt          text NOT NULL,
  created_at    timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS presets (
  id         text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       text NOT NULL,
  name       text NOT NULL,
  request    jsonb NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS presets_user_kind_idx ON presets (user_id, kind, created_at DESC);

CREATE TABLE IF NOT EXISTS pats (
  id         text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  last4      text NOT NULL,
  iv         text NOT NULL,
  ct         text NOT NULL,
  tag        text NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS pats_user_idx ON pats (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS runs (
  id             text PRIMARY KEY,
  user_id        text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind           text NOT NULL,
  label          text NOT NULL,
  describe       text NOT NULL DEFAULT '',
  ok             boolean NOT NULL,
  valid          boolean NOT NULL,
  total_ms       integer NOT NULL DEFAULT 0,
  op_count       integer NOT NULL DEFAULT 0,
  ir_hash        text NOT NULL DEFAULT '',
  file_count     integer NOT NULL DEFAULT 0,
  error_count    integer NOT NULL DEFAULT 0,
  warning_count  integer NOT NULL DEFAULT 0,
  proposal_count integer NOT NULL DEFAULT 0,
  payload        jsonb NOT NULL,
  created_at     timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS runs_user_created_idx ON runs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS runs_user_kind_idx ON runs (user_id, kind, created_at DESC);
`;

const globalForPool = globalThis as unknown as { __cnPool?: Pool };

function sslConfig(): { rejectUnauthorized: boolean } | undefined {
  const url = process.env['DATABASE_URL'] ?? '';
  const want = process.env['DATABASE_SSL'] === 'require' || process.env['PGSSLMODE'] === 'require' || /[?&]sslmode=require/.test(url);
  // Managed Postgres often presents a cert chain the host doesn't trust by default; allow opting out
  // of verification (the common case for hosted DBs) while still encrypting in transit.
  return want ? { rejectUnauthorized: process.env['DATABASE_SSL_REJECT_UNAUTHORIZED'] === '1' } : undefined;
}

export function getPool(): Pool {
  if (!globalForPool.__cnPool) {
    const connectionString = process.env['DATABASE_URL'];
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set — point it at your PostgreSQL instance (see apps/studio/.env.example).');
    }
    const ssl = sslConfig();
    globalForPool.__cnPool = new Pool({
      connectionString,
      ...(ssl ? { ssl } : {}),
      max: Number(process.env['DATABASE_POOL_MAX'] ?? 10),
    });
  }
  return globalForPool.__cnPool;
}

let ready: Promise<void> | null = null;
let cachedSecret: Buffer | null = null;

async function bootstrap(): Promise<void> {
  const pool = getPool();
  await pool.query(SCHEMA_SQL); // idempotent — safe to run on every boot
  await loadSecret(pool);
}

/** Ensure the schema exists and the signing secret is loaded. Memoized; retried if it fails. */
export function ensureReady(): Promise<void> {
  if (!ready) {
    ready = bootstrap().catch((e) => {
      ready = null; // allow a later request to retry (e.g. DB came up after the app)
      throw e;
    });
  }
  return ready;
}

async function loadSecret(pool: Pool): Promise<void> {
  if (process.env['STUDIO_SECRET']) {
    cachedSecret = Buffer.from(process.env['STUDIO_SECRET'], 'utf8');
    return;
  }
  const existing = await pool.query<{ value: string }>(`SELECT value FROM app_meta WHERE key = 'session_secret'`);
  if (existing.rows[0]) {
    cachedSecret = Buffer.from(existing.rows[0].value, 'base64');
    return;
  }
  const secret = randomBytes(32).toString('base64');
  await pool.query(`INSERT INTO app_meta (key, value) VALUES ('session_secret', $1) ON CONFLICT (key) DO NOTHING`, [secret]);
  const row = await pool.query<{ value: string }>(`SELECT value FROM app_meta WHERE key = 'session_secret'`);
  cachedSecret = Buffer.from(row.rows[0]!.value, 'base64');
}

/** Synchronous accessor for the (already-loaded) signing secret. Call ensureReady() first. */
export function getSecret(): Buffer {
  if (process.env['STUDIO_SECRET']) return Buffer.from(process.env['STUDIO_SECRET'], 'utf8');
  if (!cachedSecret) throw new Error('Session secret not loaded — call ensureReady() first.');
  return cachedSecret;
}

/** Run a query, guaranteeing the schema + secret are ready first. */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<{ rows: T[]; rowCount: number }> {
  await ensureReady();
  const res = await getPool().query<T>(text, params as unknown[]);
  return { rows: res.rows, rowCount: res.rowCount ?? 0 };
}

/** Close the pool (used by one-shot scripts so the process can exit). */
export async function closePool(): Promise<void> {
  if (globalForPool.__cnPool) {
    await globalForPool.__cnPool.end();
    globalForPool.__cnPool = undefined;
  }
}

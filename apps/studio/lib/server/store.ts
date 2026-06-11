import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { PatDTO, PresetRecord, RunMeta } from '../records';
import type { RunRequest, StageSourceKind } from '../events';
import { ensureReady, getSecret, query } from './db';

/**
 * The data store, backed by PostgreSQL (see ./db.ts). These are the only entry points the rest of
 * the app uses; reads return promises now. PAT tokens are encrypted at rest under the instance
 * secret; everything else is plain columns / JSONB.
 */

export interface User {
  id: string;
  email: string;
  emailLower: string;
  name: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
}

const RUN_CAP = 200; // keep the newest N runs per user

function id(): string {
  return randomBytes(12).toString('hex');
}

function iso(v: unknown): string {
  return new Date(v as string).toISOString();
}

/* ── Secret-box (AES-256-GCM) for tokens at rest ──────────────────────────── */

function aesKey(): Buffer {
  return createHash('sha256').update(getSecret()).digest();
}

function encryptSecret(plaintext: string): { iv: string; ct: string; tag: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', aesKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { iv: iv.toString('base64'), ct: ct.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
}

function decryptSecret(rec: { iv: string; ct: string; tag: string }): string | undefined {
  try {
    const decipher = createDecipheriv('aes-256-gcm', aesKey(), Buffer.from(rec.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(rec.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(rec.ct, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return undefined; // secret rotated, or tampered — treat as unavailable
  }
}

/* ── Users ────────────────────────────────────────────────────────────────── */

interface UserRow {
  id: string;
  email: string;
  email_lower: string;
  name: string;
  password_hash: string;
  salt: string;
  created_at: string;
}

function rowToUser(r: UserRow): User {
  return {
    id: r.id,
    email: r.email,
    emailLower: r.email_lower,
    name: r.name,
    passwordHash: r.password_hash,
    salt: r.salt,
    createdAt: iso(r.created_at),
  };
}

export async function findUserByEmail(email: string): Promise<User | undefined> {
  const { rows } = await query<UserRow>(`SELECT * FROM users WHERE email_lower = $1`, [email.trim().toLowerCase()]);
  return rows[0] ? rowToUser(rows[0]) : undefined;
}

export async function findUserById(userId: string): Promise<User | undefined> {
  const { rows } = await query<UserRow>(`SELECT * FROM users WHERE id = $1`, [userId]);
  return rows[0] ? rowToUser(rows[0]) : undefined;
}

export async function createUser(input: { email: string; name: string; passwordHash: string; salt: string }): Promise<User> {
  const email = input.email.trim();
  const user: User = {
    id: id(),
    email,
    emailLower: email.toLowerCase(),
    name: input.name.trim() || email.split('@')[0],
    passwordHash: input.passwordHash,
    salt: input.salt,
    createdAt: new Date().toISOString(),
  };
  // The UNIQUE(email_lower) constraint makes this race-safe: a duplicate inserts 0 rows.
  const { rowCount } = await query(
    `INSERT INTO users (id, email, email_lower, name, password_hash, salt, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (email_lower) DO NOTHING`,
    [user.id, user.email, user.emailLower, user.name, user.passwordHash, user.salt, user.createdAt],
  );
  if (rowCount === 0) throw new Error('That email is already registered.');
  return user;
}

/* ── Presets ──────────────────────────────────────────────────────────────── */

/** Strip secrets before anything is persisted (we never store a GitHub PAT). */
function sanitizeRequest(req: RunRequest): RunRequest {
  const { pat: _pat, ...rest } = req;
  return rest;
}

interface PresetRow {
  id: string;
  user_id: string;
  kind: StageSourceKind;
  name: string;
  request: RunRequest;
  created_at: string;
}

function rowToPreset(r: PresetRow): PresetRecord {
  return { id: r.id, userId: r.user_id, kind: r.kind, name: r.name, request: r.request, createdAt: iso(r.created_at) };
}

export async function createPreset(userId: string, kind: StageSourceKind, name: string, request: RunRequest): Promise<PresetRecord> {
  const rec: PresetRecord = {
    id: id(),
    userId,
    kind,
    name: name.trim() || `${kind} preset`,
    request: sanitizeRequest(request),
    createdAt: new Date().toISOString(),
  };
  await query(
    `INSERT INTO presets (id, user_id, kind, name, request, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
    [rec.id, rec.userId, rec.kind, rec.name, JSON.stringify(rec.request), rec.createdAt],
  );
  return rec;
}

export async function listPresets(userId: string, kind?: StageSourceKind): Promise<PresetRecord[]> {
  const { rows } = await query<PresetRow>(
    `SELECT * FROM presets WHERE user_id = $1 AND ($2::text IS NULL OR kind = $2) ORDER BY created_at DESC`,
    [userId, kind ?? null],
  );
  return rows.map(rowToPreset);
}

export async function deletePreset(userId: string, presetId: string): Promise<boolean> {
  const { rowCount } = await query(`DELETE FROM presets WHERE id = $1 AND user_id = $2`, [presetId, userId]);
  return rowCount > 0;
}

/* ── PAT vault ────────────────────────────────────────────────────────────── */

interface PatRow {
  id: string;
  name: string;
  last4: string;
  iv: string;
  ct: string;
  tag: string;
  created_at: string;
}

export async function createPat(userId: string, name: string, token: string): Promise<PatDTO> {
  const trimmed = token.trim();
  if (!trimmed) throw new Error('Token is empty.');
  await ensureReady(); // the secret must be loaded before we encrypt
  const enc = encryptSecret(trimmed);
  const rec = {
    id: id(),
    name: name.trim() || 'token',
    last4: trimmed.slice(-4),
    createdAt: new Date().toISOString(),
  };
  await query(
    `INSERT INTO pats (id, user_id, name, last4, iv, ct, tag, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [rec.id, userId, rec.name, rec.last4, enc.iv, enc.ct, enc.tag, rec.createdAt],
  );
  return { id: rec.id, name: rec.name, last4: rec.last4, createdAt: rec.createdAt };
}

export async function listPats(userId: string): Promise<PatDTO[]> {
  const { rows } = await query<PatRow>(`SELECT * FROM pats WHERE user_id = $1 ORDER BY created_at DESC`, [userId]);
  return rows.map((r) => ({ id: r.id, name: r.name, last4: r.last4, createdAt: iso(r.created_at) }));
}

/** Decrypt and return a stored token. Server-only — never expose the result to the browser. */
export async function getPatToken(userId: string, patId: string): Promise<string | undefined> {
  const { rows } = await query<PatRow>(`SELECT iv, ct, tag FROM pats WHERE id = $1 AND user_id = $2`, [patId, userId]);
  return rows[0] ? decryptSecret(rows[0]) : undefined;
}

export async function deletePat(userId: string, patId: string): Promise<boolean> {
  const { rowCount } = await query(`DELETE FROM pats WHERE id = $1 AND user_id = $2`, [patId, userId]);
  return rowCount > 0;
}

/* ── Runs ─────────────────────────────────────────────────────────────────── */

interface RunRow {
  id: string;
  user_id: string;
  kind: StageSourceKind;
  label: string;
  describe: string;
  ok: boolean;
  valid: boolean;
  total_ms: number;
  op_count: number;
  ir_hash: string;
  file_count: number;
  error_count: number;
  warning_count: number;
  proposal_count: number;
  created_at: string;
}

function rowToRunMeta(r: RunRow): RunMeta {
  return {
    id: r.id,
    userId: r.user_id,
    kind: r.kind,
    label: r.label,
    describe: r.describe,
    ok: r.ok,
    valid: r.valid,
    totalMs: r.total_ms,
    opCount: r.op_count,
    irHash: r.ir_hash,
    fileCount: r.file_count,
    errorCount: r.error_count,
    warningCount: r.warning_count,
    proposalCount: r.proposal_count,
    createdAt: iso(r.created_at),
  };
}

export async function saveRun(meta: RunMeta, payload: unknown): Promise<void> {
  await query(
    `INSERT INTO runs (id, user_id, kind, label, describe, ok, valid, total_ms, op_count, ir_hash,
                       file_count, error_count, warning_count, proposal_count, payload, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [
      meta.id, meta.userId, meta.kind, meta.label, meta.describe, meta.ok, meta.valid, meta.totalMs,
      meta.opCount, meta.irHash, meta.fileCount, meta.errorCount, meta.warningCount, meta.proposalCount,
      JSON.stringify(payload), meta.createdAt,
    ],
  );
  // Keep only the newest RUN_CAP runs per user.
  await query(
    `DELETE FROM runs WHERE user_id = $1
       AND id NOT IN (SELECT id FROM runs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2)`,
    [meta.userId, RUN_CAP],
  );
}

export async function listRuns(userId: string, kind?: StageSourceKind, limit = 50): Promise<RunMeta[]> {
  const { rows } = await query<RunRow>(
    `SELECT id, user_id, kind, label, describe, ok, valid, total_ms, op_count, ir_hash, file_count,
            error_count, warning_count, proposal_count, created_at
       FROM runs
      WHERE user_id = $1 AND ($2::text IS NULL OR kind = $2)
      ORDER BY created_at DESC
      LIMIT $3`,
    [userId, kind ?? null, limit],
  );
  return rows.map(rowToRunMeta);
}

export async function getRunPayload(userId: string, runId: string): Promise<unknown | null> {
  const { rows } = await query<{ payload: unknown }>(`SELECT payload FROM runs WHERE id = $1 AND user_id = $2`, [runId, userId]);
  return rows[0] ? rows[0].payload : null;
}

export async function deleteRun(userId: string, runId: string): Promise<boolean> {
  const { rowCount } = await query(`DELETE FROM runs WHERE id = $1 AND user_id = $2`, [runId, userId]);
  return rowCount > 0;
}

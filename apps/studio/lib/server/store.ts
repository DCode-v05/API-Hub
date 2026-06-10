import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PatDTO, PresetRecord, RunMeta } from '../records';
import type { RunRequest, StageSourceKind } from '../events';
import { dataDir } from './paths';

/**
 * A tiny file-backed store. Deliberately dependency-free (no SQLite / native module) so it builds
 * and runs anywhere; the access functions below are the only entry points, so swapping in a real
 * database later is a localized change. Everything is lazy — nothing touches the filesystem at
 * import time (which would break `next build`'s static analysis).
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

/** A stored PAT — the token is encrypted at rest (AES-256-GCM under the instance secret). */
export interface PatRecord {
  id: string;
  userId: string;
  name: string;
  last4: string;
  iv: string;
  ct: string;
  tag: string;
  createdAt: string;
}

interface DB {
  users: User[];
  presets: PresetRecord[];
  runs: RunMeta[];
  pats: PatRecord[];
}

const RUN_CAP = 200; // keep the newest N runs per store; older ones are pruned

function ensureDir(): string {
  const d = dataDir();
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  const runs = join(d, 'runs');
  if (!existsSync(runs)) mkdirSync(runs, { recursive: true });
  return d;
}

function dbPath(): string {
  return join(dataDir(), 'db.json');
}

function readDb(): DB {
  ensureDir();
  try {
    const parsed = JSON.parse(readFileSync(dbPath(), 'utf8')) as Partial<DB>;
    return {
      users: parsed.users ?? [],
      presets: parsed.presets ?? [],
      runs: parsed.runs ?? [],
      pats: parsed.pats ?? [],
    };
  } catch {
    return { users: [], presets: [], runs: [], pats: [] };
  }
}

function writeDb(db: DB): void {
  ensureDir();
  const tmp = dbPath() + '.tmp';
  writeFileSync(tmp, JSON.stringify(db, null, 2));
  renameSync(tmp, dbPath()); // atomic replace — never leaves a half-written db.json
}

function id(): string {
  return randomBytes(12).toString('hex');
}

// Serialize writes so two concurrent requests can't read-modify-write over each other.
let lock: Promise<void> = Promise.resolve();
async function withLock<T>(fn: () => T): Promise<T> {
  const prev = lock;
  let release!: () => void;
  lock = new Promise<void>((r) => (release = r));
  await prev;
  try {
    return fn();
  } finally {
    release();
  }
}

/* ── Session signing secret ───────────────────────────────────────────────── */

export function getSecret(): Buffer {
  if (process.env['STUDIO_SECRET']) return Buffer.from(process.env['STUDIO_SECRET'], 'utf8');
  const p = join(ensureDir(), 'secret');
  if (existsSync(p)) return readFileSync(p);
  const secret = randomBytes(32);
  writeFileSync(p, secret);
  return secret;
}

/* ── Secret-box (AES-256-GCM) for tokens at rest ──────────────────────────── */

function aesKey(): Buffer {
  // Derive a fixed 32-byte key from the instance secret (which may be any length).
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

export function findUserByEmail(email: string): User | undefined {
  const lower = email.trim().toLowerCase();
  return readDb().users.find((u) => u.emailLower === lower);
}

export function findUserById(userId: string): User | undefined {
  return readDb().users.find((u) => u.id === userId);
}

export function userCount(): number {
  return readDb().users.length;
}

export async function createUser(input: { email: string; name: string; passwordHash: string; salt: string }): Promise<User> {
  return withLock(() => {
    const db = readDb();
    const emailLower = input.email.trim().toLowerCase();
    if (db.users.some((u) => u.emailLower === emailLower)) {
      throw new Error('That email is already registered.');
    }
    const user: User = {
      id: id(),
      email: input.email.trim(),
      emailLower,
      name: input.name.trim() || input.email.trim().split('@')[0],
      passwordHash: input.passwordHash,
      salt: input.salt,
      createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    writeDb(db);
    return user;
  });
}

/* ── Presets ──────────────────────────────────────────────────────────────── */

/** Strip secrets before anything is persisted (we never store a GitHub PAT). */
function sanitizeRequest(req: RunRequest): RunRequest {
  const { pat: _pat, ...rest } = req;
  return rest;
}

export async function createPreset(userId: string, kind: StageSourceKind, name: string, request: RunRequest): Promise<PresetRecord> {
  return withLock(() => {
    const db = readDb();
    const preset: PresetRecord = {
      id: id(),
      userId,
      kind,
      name: name.trim() || `${kind} preset`,
      request: sanitizeRequest(request),
      createdAt: new Date().toISOString(),
    };
    db.presets.push(preset);
    writeDb(db);
    return preset;
  });
}

export function listPresets(userId: string, kind?: StageSourceKind): PresetRecord[] {
  return readDb()
    .presets.filter((p) => p.userId === userId && (!kind || p.kind === kind))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deletePreset(userId: string, presetId: string): Promise<boolean> {
  return withLock(() => {
    const db = readDb();
    const before = db.presets.length;
    db.presets = db.presets.filter((p) => !(p.id === presetId && p.userId === userId));
    if (db.presets.length === before) return false;
    writeDb(db);
    return true;
  });
}

/* ── PAT vault ────────────────────────────────────────────────────────────── */

function toPatDTO(p: PatRecord): PatDTO {
  return { id: p.id, name: p.name, last4: p.last4, createdAt: p.createdAt };
}

export async function createPat(userId: string, name: string, token: string): Promise<PatDTO> {
  const trimmed = token.trim();
  if (!trimmed) throw new Error('Token is empty.');
  return withLock(() => {
    const db = readDb();
    const enc = encryptSecret(trimmed);
    const rec: PatRecord = {
      id: id(),
      userId,
      name: name.trim() || 'token',
      last4: trimmed.slice(-4),
      iv: enc.iv,
      ct: enc.ct,
      tag: enc.tag,
      createdAt: new Date().toISOString(),
    };
    db.pats.push(rec);
    writeDb(db);
    return toPatDTO(rec);
  });
}

export function listPats(userId: string): PatDTO[] {
  return readDb()
    .pats.filter((p) => p.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(toPatDTO);
}

/** Decrypt and return a stored token. Server-only — never expose the result to the browser. */
export function getPatToken(userId: string, patId: string): string | undefined {
  const rec = readDb().pats.find((p) => p.id === patId && p.userId === userId);
  return rec ? decryptSecret(rec) : undefined;
}

export async function deletePat(userId: string, patId: string): Promise<boolean> {
  return withLock(() => {
    const db = readDb();
    const before = db.pats.length;
    db.pats = db.pats.filter((p) => !(p.id === patId && p.userId === userId));
    if (db.pats.length === before) return false;
    writeDb(db);
    return true;
  });
}

/* ── Runs ─────────────────────────────────────────────────────────────────── */

export async function saveRun(meta: RunMeta, payload: unknown): Promise<void> {
  await withLock(() => {
    const db = readDb();
    db.runs.unshift(meta);
    // Prune the oldest runs beyond the cap, deleting their payload files too.
    if (db.runs.length > RUN_CAP) {
      for (const old of db.runs.slice(RUN_CAP)) {
        try {
          rmSync(join(dataDir(), 'runs', `${old.id}.json`), { force: true });
        } catch {
          /* best effort */
        }
      }
      db.runs = db.runs.slice(0, RUN_CAP);
    }
    writeDb(db);
  });
  writeFileSync(join(ensureDir(), 'runs', `${meta.id}.json`), JSON.stringify(payload, null, 2));
}

export function listRuns(userId: string, kind?: StageSourceKind, limit = 50): RunMeta[] {
  return readDb()
    .runs.filter((r) => r.userId === userId && (!kind || r.kind === kind))
    .slice(0, limit);
}

export function getRunPayload(userId: string, runId: string): unknown | null {
  const meta = readDb().runs.find((r) => r.id === runId && r.userId === userId);
  if (!meta) return null;
  try {
    return JSON.parse(readFileSync(join(dataDir(), 'runs', `${runId}.json`), 'utf8'));
  } catch {
    return null;
  }
}

export async function deleteRun(userId: string, runId: string): Promise<boolean> {
  return withLock(() => {
    const db = readDb();
    const before = db.runs.length;
    db.runs = db.runs.filter((r) => !(r.id === runId && r.userId === userId));
    if (db.runs.length === before) return false;
    writeDb(db);
    try {
      rmSync(join(dataDir(), 'runs', `${runId}.json`), { force: true });
    } catch {
      /* best effort */
    }
    return true;
  });
}

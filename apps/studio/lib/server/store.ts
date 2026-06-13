import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type {
  DeploymentRecord,
  DeploymentStatus,
  DiffSummary,
  HostConfig,
  PatDTO,
  PresetRecord,
  ProjectRecord,
  ProjectStatus,
  ProjectTrigger,
  ProjectVersionMeta,
  PublishRecord,
  PublishRegistry,
  PublishStatus,
  RunMeta,
} from '../records';
import type { RunRequest, StageSourceKind } from '../events';
import { ensureReady, getPool, getSecret, query } from './db';

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

/* ── Projects (version-controlled inputs) ─────────────────────────────────── */

const PROJECT_VERSION_CAP = 25; // keep the newest N versions per project (each carries a full payload)

function clampInterval(sec: number | undefined): number {
  const n = Math.floor(Number(sec));
  if (!Number.isFinite(n) || n <= 0) return 900;
  return Math.max(60, n); // never poll faster than once a minute
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === '23505';
}

interface ProjectRow {
  id: string;
  user_id: string;
  name: string;
  kind: StageSourceKind;
  request: RunRequest;
  pat_id: string | null;
  watch_enabled: boolean;
  watch_interval_sec: number;
  latest_version: number;
  latest_ir_hash: string;
  latest_content_hash: string;
  latest_sha: string | null;
  last_checked_at: string | null;
  last_status: ProjectStatus;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

function rowToProject(r: ProjectRow): ProjectRecord {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    kind: r.kind,
    request: r.request,
    patId: r.pat_id,
    watchEnabled: r.watch_enabled,
    watchIntervalSec: r.watch_interval_sec,
    latestVersion: r.latest_version,
    latestIrHash: r.latest_ir_hash,
    latestContentHash: r.latest_content_hash,
    latestSha: r.latest_sha,
    lastCheckedAt: r.last_checked_at ? iso(r.last_checked_at) : null,
    lastStatus: r.last_status,
    lastError: r.last_error,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

export interface CreateProjectInput {
  name: string;
  kind: StageSourceKind;
  request: RunRequest;
  patId?: string | null;
  watchEnabled?: boolean;
  watchIntervalSec?: number;
}

export async function createProject(userId: string, input: CreateProjectInput): Promise<ProjectRecord> {
  const now = new Date().toISOString();
  const rec: ProjectRecord = {
    id: id(),
    userId,
    name: input.name.trim(),
    kind: input.kind,
    request: sanitizeRequest(input.request),
    patId: input.patId ?? null,
    watchEnabled: input.watchEnabled ?? false,
    watchIntervalSec: clampInterval(input.watchIntervalSec),
    latestVersion: 0,
    latestIrHash: '',
    latestContentHash: '',
    latestSha: null,
    lastCheckedAt: null,
    lastStatus: 'pending',
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await query(
      `INSERT INTO projects (id, user_id, name, kind, request, pat_id, watch_enabled, watch_interval_sec,
                             latest_version, latest_ir_hash, latest_content_hash, latest_sha,
                             last_checked_at, last_status, last_error, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, '', '', NULL, NULL, 'pending', NULL, $9, $10)`,
      [rec.id, userId, rec.name, rec.kind, JSON.stringify(rec.request), rec.patId, rec.watchEnabled, rec.watchIntervalSec, now, now],
    );
  } catch (e) {
    if (isUniqueViolation(e)) throw new Error('A project with that name already exists.');
    throw e;
  }
  return rec;
}

export async function listProjects(userId: string): Promise<ProjectRecord[]> {
  const { rows } = await query<ProjectRow>(`SELECT * FROM projects WHERE user_id = $1 ORDER BY updated_at DESC`, [userId]);
  return rows.map(rowToProject);
}

export async function getProject(userId: string, projectId: string): Promise<ProjectRecord | null> {
  const { rows } = await query<ProjectRow>(`SELECT * FROM projects WHERE id = $1 AND user_id = $2`, [projectId, userId]);
  return rows[0] ? rowToProject(rows[0]) : null;
}

export interface UpdateProjectInput {
  name?: string;
  watchEnabled?: boolean;
  watchIntervalSec?: number;
}

export async function updateProject(userId: string, projectId: string, patch: UpdateProjectInput): Promise<ProjectRecord | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (patch.name !== undefined) {
    sets.push(`name = $${i++}`);
    vals.push(patch.name.trim());
  }
  if (patch.watchEnabled !== undefined) {
    sets.push(`watch_enabled = $${i++}`);
    vals.push(patch.watchEnabled);
  }
  if (patch.watchIntervalSec !== undefined) {
    sets.push(`watch_interval_sec = $${i++}`);
    vals.push(clampInterval(patch.watchIntervalSec));
  }
  sets.push(`updated_at = $${i++}`);
  vals.push(new Date().toISOString());
  const pIdx = i++;
  const uIdx = i++;
  vals.push(projectId, userId);
  try {
    const { rows } = await query<ProjectRow>(
      `UPDATE projects SET ${sets.join(', ')} WHERE id = $${pIdx} AND user_id = $${uIdx} RETURNING *`,
      vals,
    );
    return rows[0] ? rowToProject(rows[0]) : null;
  } catch (e) {
    if (isUniqueViolation(e)) throw new Error('A project with that name already exists.');
    throw e;
  }
}

export async function deleteProject(userId: string, projectId: string): Promise<boolean> {
  const { rowCount } = await query(`DELETE FROM projects WHERE id = $1 AND user_id = $2`, [projectId, userId]);
  return rowCount > 0;
}

/** Watched projects whose interval has elapsed (or never checked). Server-internal — not user-scoped. */
export async function listDueWatchedProjects(limit = 20): Promise<ProjectRecord[]> {
  const { rows } = await query<ProjectRow>(
    `SELECT * FROM projects
      WHERE watch_enabled = true
        AND (last_checked_at IS NULL OR last_checked_at < now() - (watch_interval_sec * interval '1 second'))
      ORDER BY last_checked_at ASC NULLS FIRST
      LIMIT $1`,
    [limit],
  );
  return rows.map(rowToProject);
}

/* ── Project versions ─────────────────────────────────────────────────────── */

interface ProjectVersionRow {
  id: string;
  project_id: string;
  version: number;
  ir_hash: string;
  content_hash: string;
  sha: string | null;
  ok: boolean;
  valid: boolean;
  op_count: number;
  file_count: number;
  error_count: number;
  warning_count: number;
  trigger: ProjectTrigger;
  summary: DiffSummary;
  created_at: string;
}

function rowToProjectVersionMeta(r: ProjectVersionRow): ProjectVersionMeta {
  return {
    id: r.id,
    projectId: r.project_id,
    version: r.version,
    irHash: r.ir_hash,
    contentHash: r.content_hash,
    sha: r.sha,
    ok: r.ok,
    valid: r.valid,
    opCount: r.op_count,
    fileCount: r.file_count,
    errorCount: r.error_count,
    warningCount: r.warning_count,
    trigger: r.trigger,
    summary: r.summary,
    createdAt: iso(r.created_at),
  };
}

export async function listProjectVersions(userId: string, projectId: string): Promise<ProjectVersionMeta[]> {
  const { rows } = await query<ProjectVersionRow>(
    `SELECT id, project_id, version, ir_hash, content_hash, sha, ok, valid, op_count, file_count,
            error_count, warning_count, trigger, summary, created_at
       FROM project_versions
      WHERE project_id = $1 AND user_id = $2
      ORDER BY version DESC`,
    [projectId, userId],
  );
  return rows.map(rowToProjectVersionMeta);
}

export async function getProjectVersionPayload(userId: string, projectId: string, version: number): Promise<unknown | null> {
  const { rows } = await query<{ payload: unknown }>(
    `SELECT payload FROM project_versions WHERE project_id = $1 AND user_id = $2 AND version = $3`,
    [projectId, userId, version],
  );
  return rows[0] ? rows[0].payload : null;
}

export interface AppendVersionInput {
  version: number;
  irHash: string;
  contentHash: string;
  sha: string | null;
  ok: boolean;
  valid: boolean;
  opCount: number;
  fileCount: number;
  errorCount: number;
  warningCount: number;
  summary: DiffSummary;
  trigger: ProjectTrigger;
  payload: unknown;
}

/** Insert a new version and advance the project's pointers, atomically; then trim to the cap. */
export async function appendProjectVersion(userId: string, projectId: string, v: AppendVersionInput): Promise<ProjectVersionMeta> {
  await ensureReady();
  const now = new Date().toISOString();
  const versionId = id();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO project_versions (id, project_id, user_id, version, ir_hash, content_hash, sha, ok, valid,
                                     op_count, file_count, error_count, warning_count, summary, trigger, payload, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
        versionId, projectId, userId, v.version, v.irHash, v.contentHash, v.sha, v.ok, v.valid,
        v.opCount, v.fileCount, v.errorCount, v.warningCount, JSON.stringify(v.summary), v.trigger, JSON.stringify(v.payload), now,
      ],
    );
    await client.query(
      `UPDATE projects
          SET latest_version = $1, latest_ir_hash = $2, latest_content_hash = $3, latest_sha = $4,
              last_checked_at = $5, last_status = 'changed', last_error = NULL, updated_at = $5
        WHERE id = $6 AND user_id = $7`,
      [v.version, v.irHash, v.contentHash, v.sha, now, projectId, userId],
    );
    await client.query(
      `DELETE FROM project_versions WHERE project_id = $1
         AND id NOT IN (SELECT id FROM project_versions WHERE project_id = $1 ORDER BY version DESC LIMIT $2)`,
      [projectId, PROJECT_VERSION_CAP],
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  return {
    id: versionId,
    projectId,
    version: v.version,
    irHash: v.irHash,
    contentHash: v.contentHash,
    sha: v.sha,
    ok: v.ok,
    valid: v.valid,
    opCount: v.opCount,
    fileCount: v.fileCount,
    errorCount: v.errorCount,
    warningCount: v.warningCount,
    trigger: v.trigger,
    summary: v.summary,
    createdAt: now,
  };
}

/** Record the outcome of a check that produced no new version (unchanged / error). */
export async function updateProjectCheck(
  userId: string,
  projectId: string,
  patch: { lastStatus: ProjectStatus; lastError?: string | null; lastCheckedAt?: string },
): Promise<void> {
  const now = patch.lastCheckedAt ?? new Date().toISOString();
  await query(
    `UPDATE projects SET last_status = $1, last_error = $2, last_checked_at = $3, updated_at = $3
       WHERE id = $4 AND user_id = $5`,
    [patch.lastStatus, patch.lastError ?? null, now, projectId, userId],
  );
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

/* ── Deployments (hosted MCP servers) ─────────────────────────────────────── */

interface DeploymentRow {
  id: string;
  project_id: string;
  user_id: string;
  version: number;
  surface_kind: string;
  status: DeploymentStatus;
  port: number | null;
  pid: number | null;
  base_url: string | null;
  error: string | null;
  started_at: string | null;
  stopped_at: string | null;
  created_at: string;
  updated_at: string;
}

function endpointFor(kind: string, port: number | null): string | null {
  return port != null ? `http://localhost:${port}/${kind === 'cli' ? 'run' : 'mcp'}` : null;
}

function rowToDeployment(r: DeploymentRow): DeploymentRecord {
  const surfaceKind = r.surface_kind === 'cli' ? 'cli' : 'mcp';
  return {
    id: r.id,
    projectId: r.project_id,
    userId: r.user_id,
    version: r.version,
    surfaceKind,
    status: r.status,
    port: r.port,
    pid: r.pid,
    baseUrl: r.base_url,
    error: r.error,
    endpoint: endpointFor(surfaceKind, r.port),
    startedAt: r.started_at ? iso(r.started_at) : null,
    stoppedAt: r.stopped_at ? iso(r.stopped_at) : null,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

export async function createDeployment(
  userId: string,
  input: { projectId: string; version: number; surfaceKind: 'mcp' | 'cli'; port?: number | null; pid?: number | null; baseUrl?: string | null },
): Promise<DeploymentRecord> {
  const now = new Date().toISOString();
  const depId = id();
  await query(
    `INSERT INTO deployments (id, project_id, user_id, version, surface_kind, status, port, pid, base_url, started_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'starting', $6, $7, $8, $9, $9, $9)`,
    [depId, input.projectId, userId, input.version, input.surfaceKind, input.port ?? null, input.pid ?? null, input.baseUrl ?? null, now],
  );
  return {
    id: depId,
    projectId: input.projectId,
    userId,
    version: input.version,
    surfaceKind: input.surfaceKind,
    status: 'starting',
    port: input.port ?? null,
    pid: input.pid ?? null,
    baseUrl: input.baseUrl ?? null,
    error: null,
    endpoint: endpointFor(input.surfaceKind, input.port ?? null),
    startedAt: now,
    stoppedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateDeployment(
  deploymentId: string,
  patch: { status?: DeploymentStatus; port?: number | null; pid?: number | null; error?: string | null; startedAt?: string | null; stoppedAt?: string | null },
): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  const add = (col: string, v: unknown): void => {
    sets.push(`${col} = $${i++}`);
    vals.push(v);
  };
  if (patch.status !== undefined) add('status', patch.status);
  if (patch.port !== undefined) add('port', patch.port);
  if (patch.pid !== undefined) add('pid', patch.pid);
  if (patch.error !== undefined) add('error', patch.error);
  if (patch.startedAt !== undefined) add('started_at', patch.startedAt);
  if (patch.stoppedAt !== undefined) add('stopped_at', patch.stoppedAt);
  add('updated_at', new Date().toISOString());
  vals.push(deploymentId);
  await query(`UPDATE deployments SET ${sets.join(', ')} WHERE id = $${i}`, vals);
}

export async function getDeployment(userId: string, deploymentId: string): Promise<DeploymentRecord | null> {
  const { rows } = await query<DeploymentRow>(`SELECT * FROM deployments WHERE id = $1 AND user_id = $2`, [deploymentId, userId]);
  return rows[0] ? rowToDeployment(rows[0]) : null;
}

export async function listDeployments(userId: string, projectId: string): Promise<DeploymentRecord[]> {
  const { rows } = await query<DeploymentRow>(
    `SELECT * FROM deployments WHERE project_id = $1 AND user_id = $2 ORDER BY created_at DESC`,
    [projectId, userId],
  );
  return rows.map(rowToDeployment);
}

/** All deployments still flagged active — used by the boot reconcile to clean up orphans. */
export async function listActiveDeployments(): Promise<DeploymentRecord[]> {
  const { rows } = await query<DeploymentRow>(`SELECT * FROM deployments WHERE status IN ('starting', 'running')`);
  return rows.map(rowToDeployment);
}

/* ── Host config (upstream API for the hosted MCP server) ─────────────────── */

interface HostConfigRow {
  base_url: string;
  iv: string | null;
  ct: string | null;
  tag: string | null;
}

export async function getHostConfig(userId: string, projectId: string): Promise<HostConfig> {
  const { rows } = await query<HostConfigRow>(
    `SELECT base_url, iv, ct, tag FROM project_host_config WHERE project_id = $1 AND user_id = $2`,
    [projectId, userId],
  );
  const r = rows[0];
  return { baseUrl: r?.base_url ?? '', hasToken: !!r?.ct };
}

export async function setHostConfig(userId: string, projectId: string, input: { baseUrl: string; token?: string }): Promise<void> {
  await ensureReady();
  const now = new Date().toISOString();
  const token = input.token?.trim();
  if (token) {
    const enc = encryptSecret(token);
    await query(
      `INSERT INTO project_host_config (project_id, user_id, base_url, iv, ct, tag, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (project_id) DO UPDATE
         SET base_url = EXCLUDED.base_url, iv = EXCLUDED.iv, ct = EXCLUDED.ct, tag = EXCLUDED.tag, updated_at = EXCLUDED.updated_at`,
      [projectId, userId, input.baseUrl, enc.iv, enc.ct, enc.tag, now],
    );
  } else {
    // Update the base URL only; keep any previously-stored token.
    await query(
      `INSERT INTO project_host_config (project_id, user_id, base_url, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_id) DO UPDATE SET base_url = EXCLUDED.base_url, updated_at = EXCLUDED.updated_at`,
      [projectId, userId, input.baseUrl, now],
    );
  }
}

/** Decrypt the stored upstream token. Server-only — never expose to the browser. */
export async function getHostToken(userId: string, projectId: string): Promise<string | undefined> {
  const { rows } = await query<HostConfigRow>(
    `SELECT base_url, iv, ct, tag FROM project_host_config WHERE project_id = $1 AND user_id = $2`,
    [projectId, userId],
  );
  const r = rows[0];
  if (!r || !r.iv || !r.ct || !r.tag) return undefined;
  return decryptSecret({ iv: r.iv, ct: r.ct, tag: r.tag });
}

/* ── Publishes (SDK → npm / PyPI) ─────────────────────────────────────────── */

interface PublishRow {
  id: string;
  project_id: string;
  user_id: string;
  version: number;
  surface_kind: 'sdk-typescript' | 'sdk-python';
  registry: PublishRegistry;
  package_name: string;
  published_version: string;
  status: PublishStatus;
  url: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

function rowToPublish(r: PublishRow): PublishRecord {
  return {
    id: r.id,
    projectId: r.project_id,
    userId: r.user_id,
    version: r.version,
    surfaceKind: r.surface_kind,
    registry: r.registry,
    packageName: r.package_name,
    publishedVersion: r.published_version,
    status: r.status,
    url: r.url,
    error: r.error,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

export async function createPublish(
  userId: string,
  input: { projectId: string; version: number; surfaceKind: 'sdk-typescript' | 'sdk-python'; registry: PublishRegistry; packageName: string; publishedVersion: string },
): Promise<PublishRecord> {
  const now = new Date().toISOString();
  const pubId = id();
  await query(
    `INSERT INTO publishes (id, project_id, user_id, version, surface_kind, registry, package_name, published_version, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $9)`,
    [pubId, input.projectId, userId, input.version, input.surfaceKind, input.registry, input.packageName, input.publishedVersion, now],
  );
  return {
    id: pubId,
    projectId: input.projectId,
    userId,
    version: input.version,
    surfaceKind: input.surfaceKind,
    registry: input.registry,
    packageName: input.packageName,
    publishedVersion: input.publishedVersion,
    status: 'pending',
    url: null,
    error: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function updatePublish(
  publishId: string,
  patch: { status?: PublishStatus; publishedVersion?: string; url?: string | null; error?: string | null },
): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  const add = (col: string, v: unknown): void => {
    sets.push(`${col} = $${i++}`);
    vals.push(v);
  };
  if (patch.status !== undefined) add('status', patch.status);
  if (patch.publishedVersion !== undefined) add('published_version', patch.publishedVersion);
  if (patch.url !== undefined) add('url', patch.url);
  if (patch.error !== undefined) add('error', patch.error);
  add('updated_at', new Date().toISOString());
  vals.push(publishId);
  await query(`UPDATE publishes SET ${sets.join(', ')} WHERE id = $${i}`, vals);
}

export async function listPublishes(userId: string, projectId: string): Promise<PublishRecord[]> {
  const { rows } = await query<PublishRow>(
    `SELECT * FROM publishes WHERE project_id = $1 AND user_id = $2 ORDER BY created_at DESC`,
    [projectId, userId],
  );
  return rows.map(rowToPublish);
}

/** The most recently-published version of a package (platform-global), for auto-increment. */
export async function lastPublishedVersion(packageName: string): Promise<string | null> {
  const { rows } = await query<{ published_version: string }>(
    `SELECT published_version FROM publishes WHERE package_name = $1 AND status = 'published' ORDER BY created_at DESC LIMIT 1`,
    [packageName],
  );
  return rows[0]?.published_version ?? null;
}

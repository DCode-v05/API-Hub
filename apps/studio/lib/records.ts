// Shared record shapes used by BOTH server (store) and client (history / presets UI).
// Pure types only — no node imports — so this file is safe to import from client components.
import type { RunEvent, RunRequest, StageSourceKind } from './events';

/** A non-sensitive view of a user, safe to send to the browser. */
export interface UserDTO {
  id: string;
  email: string;
  name: string;
}

/** A saved GitHub PAT, minus the token itself. The browser only ever sees name + last4. */
export interface PatDTO {
  id: string;
  name: string;
  last4: string;
  createdAt: string;
}

/** A saved input configuration the user can reload later. `request.pat` is stripped before storage. */
export interface PresetRecord {
  id: string;
  userId: string;
  kind: StageSourceKind;
  name: string;
  request: RunRequest;
  createdAt: string;
}

/* ── Projects (version-controlled inputs) ─────────────────────────────────── */

export type ProjectStatus = 'pending' | 'ok' | 'unchanged' | 'changed' | 'error';
export type ProjectTrigger = 'initial' | 'manual' | 'watch';

/** A named input source under version control. Replaces PresetRecord; `request.pat` never stored. */
export interface ProjectRecord {
  id: string;
  userId: string;
  name: string;
  kind: StageSourceKind;
  request: RunRequest;
  /** Saved-PAT reference used to re-acquire github sources headlessly (raw token never stored). */
  patId: string | null;
  watchEnabled: boolean;
  watchIntervalSec: number;
  latestVersion: number;
  latestIrHash: string;
  latestContentHash: string;
  latestSha: string | null;
  lastCheckedAt: string | null;
  lastStatus: ProjectStatus;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

/** What changed between two versions of a project. Advisory — surfaced in the UI, never a gate. */
export interface DiffSummary {
  opsAdded: string[];
  opsRemoved: string[];
  opsChanged: string[];
  fileDelta: number;
  opDelta: number;
  severity: 'initial' | 'none' | 'minor' | 'breaking';
  note: string;
}

/** Lightweight index entry for one stored version of a project (payload fetched on demand). */
export interface ProjectVersionMeta {
  id: string;
  projectId: string;
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
  trigger: ProjectTrigger;
  summary: DiffSummary;
  createdAt: string;
}

/** Result of a project sync — no change, a new version, or a recorded failure. */
export type CheckOutcome =
  | { status: 'unchanged'; contentHash: string }
  | { status: 'changed'; version: ProjectVersionMeta }
  | { status: 'error'; message: string };

/** Frames streamed by the manual-sync SSE endpoint: the pipeline funnel events + a final outcome. */
export type ProjectSyncEvent = RunEvent | { t: 'version'; outcome: CheckOutcome };

/** Lightweight index entry for a past pipeline run. The full payload lives in runs/<id>.json. */
export interface RunMeta {
  id: string;
  userId: string;
  kind: StageSourceKind;
  label: string;
  describe: string;
  ok: boolean;
  valid: boolean;
  totalMs: number;
  opCount: number;
  irHash: string;
  fileCount: number;
  errorCount: number;
  warningCount: number;
  proposalCount: number;
  /** Conversion test cases — counts from the post-project Test stage (optional for older runs). */
  testsPassed?: number;
  testsFailed?: number;
  createdAt: string;
}

/* ── Hosting & publishing ─────────────────────────────────────────────────── */

export type DeploymentStatus = 'starting' | 'running' | 'stopped' | 'failed';

/** A hosted MCP server (the studio runs the generated http-server.mjs as a local process). */
export interface DeploymentRecord {
  id: string;
  projectId: string;
  userId: string;
  version: number;
  surfaceKind: 'mcp' | 'cli';
  status: DeploymentStatus;
  port: number | null;
  pid: number | null;
  baseUrl: string | null;
  error: string | null;
  /** Convenience for the UI — `http://localhost:<port>/mcp` when running. */
  endpoint: string | null;
  startedAt: string | null;
  stoppedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The upstream API config for a project's hosted MCP server (token never sent to the client). */
export interface HostConfig {
  baseUrl: string;
  hasToken: boolean;
}

export type PublishRegistry = 'npm' | 'pypi';
export type PublishStatus = 'pending' | 'published' | 'failed';

/** A record of an SDK published to npm / PyPI. */
export interface PublishRecord {
  id: string;
  projectId: string;
  userId: string;
  version: number;
  surfaceKind: 'sdk-typescript' | 'sdk-python';
  registry: PublishRegistry;
  packageName: string;
  publishedVersion: string;
  status: PublishStatus;
  url: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Whether the platform-global registry credentials + tooling are configured (for the UI). */
export interface RegistryStatus {
  npm: { configured: boolean; scope: string };
  pypi: { configured: boolean; prefix: string; tooling: boolean };
}

/** Frames streamed by the publish SSE endpoint: build/publish logs + a final outcome. */
export type PublishEvent =
  | { t: 'log'; line: string }
  | { t: 'step'; name: string }
  | { t: 'published'; publishedVersion: string; url: string; packageName: string }
  | { t: 'error'; message: string };

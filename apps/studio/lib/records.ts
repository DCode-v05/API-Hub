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
  createdAt: string;
}

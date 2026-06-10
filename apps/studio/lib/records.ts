// Shared record shapes used by BOTH server (store) and client (history / presets UI).
// Pure types only — no node imports — so this file is safe to import from client components.
import type { RunRequest, StageSourceKind } from './events';

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

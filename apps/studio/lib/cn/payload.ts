import { randomUUID } from 'node:crypto';
import type { RunRequest } from '../events';
import type { RunMeta } from '../records';
import type { RunPayload } from '../run-payload';
import type { PipelineResult } from './pipeline';

/**
 * Build the persisted run record (lightweight `meta` + full `payload`) from a finished pipeline
 * result. Shared by /api/run (ad-hoc runs → runs table) and project syncs (→ project_versions).
 */

function severityCounts(result: PipelineResult): { error: number; warning: number } {
  const all = [...(result.acquire?.diagnostics ?? []), ...(result.ingest?.diagnostics ?? [])];
  return {
    error: all.filter((d) => d.severity === 'error').length,
    warning: all.filter((d) => d.severity === 'warning').length,
  };
}

export interface BuildPayloadInput {
  userId: string;
  request: RunRequest;
  result: PipelineResult;
  /** Reuse an id (e.g. a project-version id); a fresh UUID is generated otherwise. */
  runId?: string;
  createdAt?: string;
}

export function buildRunPayload(input: BuildPayloadInput): { meta: RunMeta; payload: RunPayload } {
  const { userId, request, result } = input;
  const counts = severityCounts(result);
  const meta: RunMeta = {
    id: input.runId ?? randomUUID(),
    userId,
    kind: result.source.kind,
    label: result.source.label || result.source.kind,
    describe: result.source.describe,
    ok: result.ok,
    valid: result.ingest?.valid ?? false,
    totalMs: result.ms,
    opCount: result.ir?.operations.length ?? result.acquire?.operationCount ?? 0,
    irHash: result.ir?.hash ?? '',
    fileCount: result.surfaces?.reduce((n, s) => n + s.files.length, 0) ?? 0,
    errorCount: counts.error + (result.error ? 1 : 0),
    warningCount: counts.warning,
    proposalCount: result.ingest?.proposals.length ?? 0,
    testsPassed: result.tests?.passed ?? 0,
    testsFailed: result.tests?.failed ?? 0,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  // Defensive: the PAT is already stripped upstream, but never let one slip into a stored payload.
  const { pat: _pat, ...safeReq } = request;
  const payload: RunPayload = {
    meta,
    request: safeReq,
    source: result.source,
    acquire: result.acquire,
    ingest: result.ingest,
    ir: result.ir,
    surfaces: result.surfaces,
    tests: result.tests,
    error: result.error,
  };
  return { meta, payload };
}

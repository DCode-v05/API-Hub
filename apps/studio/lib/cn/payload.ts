import { randomUUID } from 'node:crypto';
import type { RunRequest } from '../events';
import type { RunMeta } from '../records';
import type { RunPayload } from '../run-payload';
import type { PipelineResult } from './pipeline';

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

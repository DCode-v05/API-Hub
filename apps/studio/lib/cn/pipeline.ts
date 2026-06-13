import { AcquireService, describeSource } from '@cn/acquire';
import type { AcquireContext, CanonicalArtifact, Diagnostic, Ir, OpenApiDocument, RepairProposal, SourceRef } from '@cn/contracts';
import { ingestOne } from '@cn/ingest';
import { buildIr } from '@cn/ir-core';
import { project } from '@cn/projection';
import type { DiagnosticDTO, ProposalDTO, RunEvent, StageSourceKind, SurfaceDTO } from '../events';
import { labelFor } from './sources';

/**
 * The pipeline, in ONE place. Both the streaming run (lib/cn/runner.ts → /api/run, with a cosmetic
 * stagger and live SSE) and the headless project watcher call this. Pass `emit` to stream stage
 * events; omit it to run silently. `acquireOnly` stops after acquisition so a watch tick can read the
 * content hash and skip codegen when nothing changed. The full structured result is always returned.
 */

const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);

export interface AcquireResult {
  trust: 'declared' | 'inferred';
  sourceType: string;
  origin: string;
  sha: string | null;
  contentHash: string;
  operationCount: number;
  diagnostics: DiagnosticDTO[];
}

export interface SourceInfo {
  kind: StageSourceKind;
  describe: string;
  label: string;
}

export interface PipelineResult {
  source: SourceInfo;
  acquire?: AcquireResult;
  ingest?: { valid: boolean; diagnostics: DiagnosticDTO[]; proposals: ProposalDTO[] };
  ir?: Ir;
  surfaces?: SurfaceDTO[];
  error?: { stage: string; message: string };
  ok: boolean;
  ms: number;
}

export interface ExecuteOptions {
  /** When provided, the same SSE RunEvents the browser renders are emitted as each stage runs. */
  emit?: (e: RunEvent) => void;
  signal?: AbortSignal;
  /** Stop after acquire — used by the watcher to fingerprint the source without running codegen. */
  acquireOnly?: boolean;
  /** Insert a small inter-stage delay so the live funnel is legible. Streaming path only. */
  stagger?: boolean;
}

export function sourceInfo(source: SourceRef): SourceInfo {
  return { kind: source.kind as StageSourceKind, describe: describeSource(source), label: labelFor(source) };
}

export async function executePipeline(source: SourceRef, opts: ExecuteOptions = {}): Promise<PipelineResult> {
  const { emit, signal, acquireOnly = false, stagger = false } = opts;
  const t0 = Date.now();
  const info = sourceInfo(source);
  const result: PipelineResult = { source: info, ok: false, ms: 0 };
  emit?.({ t: 'start', source: info });

  const ctx: AcquireContext = {
    now: () => new Date().toISOString(),
    toolVersion: 'studio',
    log: (line) => emit?.({ t: 'log', line }),
  };

  // ── 1. acquire ──
  emit?.({ t: 'stage', stage: 'acquire', status: 'running' });
  const ta = Date.now();
  let artifact: CanonicalArtifact;
  try {
    artifact = await new AcquireService().acquire(source, ctx);
  } catch (e) {
    result.error = { stage: 'acquire', message: errMessage(e) };
    result.ms = Date.now() - t0;
    emit?.({ t: 'error', stage: 'acquire', message: result.error.message });
    emit?.({ t: 'done', ok: false, ms: result.ms });
    return result;
  }
  const acq = acquireResult(artifact);
  result.acquire = acq;
  emit?.({ t: 'acquire', ms: Date.now() - ta, ...acq });

  if (acquireOnly) {
    result.ok = true;
    result.ms = Date.now() - t0;
    return result;
  }

  // ── 2. ingest ──
  if (signal?.aborted) return finish(result, t0);
  if (stagger) await sleep(180);
  emit?.({ t: 'stage', stage: 'ingest', status: 'running' });
  const ti = Date.now();
  const validated = ingestOne(artifact);
  result.ingest = {
    valid: validated.valid,
    diagnostics: toDiagnostics(validated.diagnostics),
    proposals: toProposals(validated.proposals),
  };
  emit?.({ t: 'ingest', ms: Date.now() - ti, ...result.ingest });
  if (!validated.valid) {
    result.error = { stage: 'ingest', message: 'Validation failed — bad specs fail loud, so no IR or surfaces are produced.' };
    result.ms = Date.now() - t0;
    emit?.({ t: 'error', stage: 'ingest', message: result.error.message });
    emit?.({ t: 'done', ok: false, ms: result.ms });
    return result;
  }

  // ── 3. build IR ──
  if (signal?.aborted) return finish(result, t0);
  if (stagger) await sleep(180);
  emit?.({ t: 'stage', stage: 'build', status: 'running' });
  const tb = Date.now();
  const ir = buildIr(validated);
  result.ir = ir;
  emit?.({ t: 'build', ms: Date.now() - tb, ir });

  // ── 4. project surfaces ──
  if (signal?.aborted) return finish(result, t0);
  if (stagger) await sleep(180);
  emit?.({ t: 'stage', stage: 'project', status: 'running' });
  const tp = Date.now();
  const projection = project(ir);
  result.surfaces = projection.surfaces.map((s) => ({
    kind: s.kind,
    dir: s.dir,
    files: s.files.map((f) => ({ path: f.path, content: f.content })),
  }));
  emit?.({ t: 'project', ms: Date.now() - tp, surfaces: result.surfaces });

  result.ok = true;
  result.ms = Date.now() - t0;
  emit?.({ t: 'done', ok: true, ms: result.ms });
  return result;
}

export function acquireResult(artifact: CanonicalArtifact): AcquireResult {
  return {
    trust: artifact.provenance.trust,
    sourceType: artifact.type,
    origin: artifact.provenance.origin,
    sha: artifact.provenance.sha ?? null,
    contentHash: artifact.provenance.contentHash,
    operationCount: countOperations(artifact.document),
    diagnostics: toDiagnostics(artifact.diagnostics),
  };
}

export function toDiagnostics(ds: readonly Diagnostic[]): DiagnosticDTO[] {
  return ds.map((d) => ({ severity: d.severity, code: d.code, message: d.message }));
}

export function toProposals(ps: readonly RepairProposal[]): ProposalDTO[] {
  return ps.map((p) => ({ code: p.code, op: p.op, target: p.target, reason: p.reason, suggestion: p.suggestion, severity: p.severity }));
}

export function countOperations(doc: OpenApiDocument): number {
  let n = 0;
  for (const item of Object.values(doc.paths ?? {})) {
    if (item && typeof item === 'object') {
      for (const key of Object.keys(item as Record<string, unknown>)) {
        if (HTTP_METHODS.has(key.toLowerCase())) n += 1;
      }
    }
  }
  return n;
}

function finish(result: PipelineResult, t0: number): PipelineResult {
  result.ms = Date.now() - t0;
  return result; // aborted mid-run — no 'done' emit, caller skips persistence
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

import { AcquireService, describeSource } from '@cn/acquire';
import type { AcquireContext, CanonicalArtifact, Diagnostic, OpenApiDocument, RepairProposal, SourceRef } from '@cn/contracts';
import { ingestOne } from '@cn/ingest';
import { buildIr } from '@cn/ir-core';
import { project } from '@cn/projection';
import type { DiagnosticDTO, ProposalDTO, RunEvent, StageSourceKind } from '../events';
import { labelFor } from './sources';

const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);

/**
 * Run the full pipeline in-process, emitting an event per stage so the browser can render it live.
 * A small stagger between the (fast) post-acquire stages makes the flow visible.
 */
export async function runPipeline(source: SourceRef, emit: (e: RunEvent) => void, signal?: AbortSignal): Promise<void> {
  const t0 = Date.now();
  emit({ t: 'start', source: { kind: source.kind as StageSourceKind, describe: describeSource(source), label: labelFor(source) } });

  const ctx: AcquireContext = {
    now: () => new Date().toISOString(),
    toolVersion: 'studio',
    log: (line) => emit({ t: 'log', line }),
  };

  // ── 1. acquire ──
  emit({ t: 'stage', stage: 'acquire', status: 'running' });
  const ta = Date.now();
  let artifact: CanonicalArtifact;
  try {
    artifact = await new AcquireService().acquire(source, ctx);
  } catch (e) {
    emit({ t: 'error', stage: 'acquire', message: errMessage(e) });
    emit({ t: 'done', ok: false, ms: Date.now() - t0 });
    return;
  }
  emit({
    t: 'acquire',
    ms: Date.now() - ta,
    trust: artifact.provenance.trust,
    sourceType: artifact.type,
    origin: artifact.provenance.origin,
    sha: artifact.provenance.sha ?? null,
    contentHash: artifact.provenance.contentHash,
    operationCount: countOperations(artifact.document),
    diagnostics: toDiagnostics(artifact.diagnostics),
  });

  // ── 2. ingest ──
  if (signal?.aborted) return;
  await sleep(180);
  emit({ t: 'stage', stage: 'ingest', status: 'running' });
  const ti = Date.now();
  const validated = ingestOne(artifact);
  emit({
    t: 'ingest',
    ms: Date.now() - ti,
    valid: validated.valid,
    diagnostics: toDiagnostics(validated.diagnostics),
    proposals: toProposals(validated.proposals),
  });
  if (!validated.valid) {
    emit({ t: 'error', stage: 'ingest', message: 'Validation failed — bad specs fail loud, so no IR or surfaces are produced.' });
    emit({ t: 'done', ok: false, ms: Date.now() - t0 });
    return;
  }

  // ── 3. build IR ──
  if (signal?.aborted) return;
  await sleep(180);
  emit({ t: 'stage', stage: 'build', status: 'running' });
  const tb = Date.now();
  const ir = buildIr(validated);
  emit({ t: 'build', ms: Date.now() - tb, ir });

  // ── 4. project surfaces ──
  if (signal?.aborted) return;
  await sleep(180);
  emit({ t: 'stage', stage: 'project', status: 'running' });
  const tp = Date.now();
  const projection = project(ir);
  emit({
    t: 'project',
    ms: Date.now() - tp,
    surfaces: projection.surfaces.map((s) => ({
      kind: s.kind,
      dir: s.dir,
      files: s.files.map((f) => ({ path: f.path, content: f.content })),
    })),
  });

  emit({ t: 'done', ok: true, ms: Date.now() - t0 });
}

function toDiagnostics(ds: readonly Diagnostic[]): DiagnosticDTO[] {
  return ds.map((d) => ({ severity: d.severity, code: d.code, message: d.message }));
}

function toProposals(ps: readonly RepairProposal[]): ProposalDTO[] {
  return ps.map((p) => ({ code: p.code, op: p.op, target: p.target, reason: p.reason, suggestion: p.suggestion, severity: p.severity }));
}

function countOperations(doc: OpenApiDocument): number {
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

import type { Ir } from '@cn/contracts';
import type { DiagnosticDTO, ProposalDTO, StageSourceKind, SurfaceDTO } from './events';
import type { RunMeta } from './records';
import type { RunState } from './state';

/** The full record persisted per run (runs/<id>.json), mirrored back to the client for replay. */
export interface RunPayload {
  meta: RunMeta;
  request?: unknown;
  source?: { kind: StageSourceKind; describe: string; label: string };
  acquire?: {
    trust: 'declared' | 'inferred';
    sourceType: string;
    origin: string;
    sha: string | null;
    contentHash: string;
    operationCount: number;
    diagnostics: DiagnosticDTO[];
  };
  ingest?: { valid: boolean; diagnostics: DiagnosticDTO[]; proposals: ProposalDTO[] };
  ir?: Ir;
  surfaces?: SurfaceDTO[];
  error?: { stage: string; message: string };
}

/** Rebuild a finished RunState from a stored payload, so the live RunResults UI can replay it. */
export function payloadToState(p: RunPayload): RunState {
  return {
    status: 'done',
    ok: p.meta.ok,
    sourceKind: p.source?.kind,
    label: p.meta.label,
    describe: p.source?.describe,
    stages: {
      acquire: { status: p.acquire ? 'done' : 'pending' },
      ingest: { status: p.ingest ? (p.ingest.valid ? 'done' : 'error') : 'pending' },
      build: { status: p.ir ? 'done' : 'pending' },
      project: { status: p.surfaces ? 'done' : 'pending' },
    },
    acquire: p.acquire,
    ingest: p.ingest,
    ir: p.ir,
    surfaces: p.surfaces,
    error: p.error,
    totalMs: p.meta.totalMs,
  };
}

import type { Ir } from '@cn/contracts';
import type { DiagnosticDTO, ProposalDTO, RunEvent, StageId, StageSourceKind, SurfaceDTO, TestResult } from './events';

export type StageStatus = 'pending' | 'running' | 'done' | 'error';

export interface RunState {
  status: 'idle' | 'running' | 'done';
  ok: boolean;
  sourceKind?: StageSourceKind;
  label?: string;
  describe?: string;
  logLine?: string;
  stages: Record<StageId, { status: StageStatus; ms?: number }>;
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
  tests?: TestResult[];
  testSummary?: { passed: number; failed: number; ms: number };
  error?: { stage: string; message: string };
  totalMs?: number;
}

export const INITIAL_RUN: RunState = {
  status: 'idle',
  ok: false,
  stages: {
    acquire: { status: 'pending' },
    ingest: { status: 'pending' },
    build: { status: 'pending' },
    project: { status: 'pending' },
    test: { status: 'pending' },
  },
};

export function reduce(state: RunState, e: RunEvent): RunState {
  switch (e.t) {
    case 'start':
      return {
        ...INITIAL_RUN,
        status: 'running',
        sourceKind: e.source.kind,
        label: e.source.label,
        describe: e.source.describe,
      };
    case 'log':
      return { ...state, logLine: e.line };
    case 'stage':
      return { ...state, stages: { ...state.stages, [e.stage]: { ...state.stages[e.stage], status: 'running' } } };
    case 'acquire':
      return {
        ...state,
        stages: { ...state.stages, acquire: { status: 'done', ms: e.ms } },
        acquire: {
          trust: e.trust,
          sourceType: e.sourceType,
          origin: e.origin,
          sha: e.sha,
          contentHash: e.contentHash,
          operationCount: e.operationCount,
          diagnostics: e.diagnostics,
        },
      };
    case 'ingest':
      return {
        ...state,
        stages: { ...state.stages, ingest: { status: e.valid ? 'done' : 'error', ms: e.ms } },
        ingest: { valid: e.valid, diagnostics: e.diagnostics, proposals: e.proposals },
      };
    case 'build':
      return { ...state, stages: { ...state.stages, build: { status: 'done', ms: e.ms } }, ir: e.ir };
    case 'project':
      return { ...state, stages: { ...state.stages, project: { status: 'done', ms: e.ms } }, surfaces: e.surfaces };
    case 'test':
      return {
        ...state,
        stages: { ...state.stages, test: { status: e.failed === 0 ? 'done' : 'error', ms: e.ms } },
        tests: e.tests,
        testSummary: { passed: e.passed, failed: e.failed, ms: e.ms },
      };
    case 'error':
      return {
        ...state,
        error: { stage: String(e.stage), message: e.message },
        stages:
          e.stage === 'input'
            ? state.stages
            : { ...state.stages, [e.stage]: { ...state.stages[e.stage], status: 'error' } },
      };
    case 'done': {
      // On a terminal failure (e.g. the stream dropped mid-stage), no stage may stay 'running'
      // — demote any in-flight stage to 'error' so the UI doesn't spin forever.
      const stages = e.ok
        ? state.stages
        : (Object.fromEntries(
            Object.entries(state.stages).map(([k, v]) => [k, v.status === 'running' ? { ...v, status: 'error' } : v]),
          ) as RunState['stages']);
      return { ...state, status: 'done', ok: e.ok, totalMs: e.ms, stages };
    }
    default:
      return state;
  }
}

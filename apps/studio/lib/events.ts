import type { Ir } from '@cn/contracts';

export type StageId = 'acquire' | 'ingest' | 'build' | 'project' | 'test';
export const STAGES: StageId[] = ['acquire', 'ingest', 'build', 'project', 'test'];

export interface DiagnosticDTO {
  severity: 'error' | 'warning' | 'note';
  code: string;
  message: string;
}

export interface ProposalDTO {
  code: string;
  op: string;
  target: string;
  reason: string;
  suggestion: string;
  severity: string;
}

export interface SurfaceDTO {
  kind: string;
  dir: string;
  files: { path: string; content: string }[];
}

/** One conversion test case — rendered in the UI with a green tick (pass) or red cross (fail). */
export interface TestResult {
  name: string;
  status: 'pass' | 'fail';
  /** The measured evidence behind the verdict. */
  detail: string;
  /** Grouping label, e.g. "Determinism", "Round-trip", "MCP", "SDK", "Pipeline". */
  category: string;
}

/** Events streamed (newline-delimited SSE) from /api/run to the browser as the pipeline runs. */
export type RunEvent =
  | { t: 'start'; source: { kind: StageSourceKind; describe: string; label: string } }
  | { t: 'log'; line: string }
  | { t: 'stage'; stage: StageId; status: 'running' }
  | {
      t: 'acquire';
      ms: number;
      trust: 'declared' | 'inferred';
      sourceType: string;
      origin: string;
      sha: string | null;
      contentHash: string;
      operationCount: number;
      diagnostics: DiagnosticDTO[];
    }
  | { t: 'ingest'; ms: number; valid: boolean; diagnostics: DiagnosticDTO[]; proposals: ProposalDTO[] }
  | { t: 'build'; ms: number; ir: Ir }
  | { t: 'project'; ms: number; surfaces: SurfaceDTO[] }
  | { t: 'test'; ms: number; tests: TestResult[]; passed: number; failed: number }
  | { t: 'error'; stage: StageId | 'input'; message: string }
  | { t: 'done'; ok: boolean; ms: number };

export type StageSourceKind = 'github' | 'openapi' | 'sdk' | 'mcp';

export type SampleId = 'github' | 'openapi' | 'sdk-ts' | 'sdk-py' | 'mcp';

/** The request body POSTed to /api/run. */
export interface RunRequest {
  kind: StageSourceKind;
  /** When set, the server resolves a bundled repo sample (overrides the per-type fields). */
  sample?: SampleId;
  // github
  repo?: string;
  /** A raw token typed for this run only (never persisted). */
  pat?: string;
  /** A reference to a saved, encrypted PAT in the user's vault; resolved server-side. */
  patId?: string;
  ref?: string;
  spec?: string;
  // openapi  (provide exactly one of url / content / path)
  openapiUrl?: string;
  openapiContent?: string;
  openapiPath?: string;
  // sdk
  sdkPath?: string;
  lang?: 'typescript' | 'python';
  // mcp  (url / content / path, or a stdio command)
  mcpUrl?: string;
  mcpContent?: string;
  mcpPath?: string;
  mcpCommand?: string;
}

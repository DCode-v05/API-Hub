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

export interface TestResult {
  name: string;
  status: 'pass' | 'fail';
  detail: string;
  category: string;
}

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

export interface RunRequest {
  kind: StageSourceKind;
  sample?: SampleId;
  repo?: string;
  pat?: string;
  patId?: string;
  ref?: string;
  spec?: string;
  openapiUrl?: string;
  openapiContent?: string;
  openapiPath?: string;
  sdkPath?: string;
  lang?: 'typescript' | 'python';
  mcpUrl?: string;
  mcpContent?: string;
  mcpPath?: string;
  mcpCommand?: string;
}

import type { ArtifactType, OpenApiDocument, Provenance } from './artifact';
import type { Diagnostic } from './diagnostics';

/**
 * A proposed, non-applied repair. Repair "answers is it clear?" (advisory) — it NEVER mutates the
 * document. Proposals are drafted (here, by deterministic heuristics; an LLM drafter can slot into
 * the same shape later) for a human to review and freeze into config. The shape mirrors a
 * transform rule ({ target, op, value, reason }) so an accepted proposal can become one directly.
 */
export type RepairOp =
  | 'set_description'
  | 'rename'
  | 'set_type'
  | 'add_example'
  | 'other';

export interface RepairProposal {
  /** Stable machine code, e.g. "repair.id_typed_as_number". */
  code: string;
  op: RepairOp;
  /** JSON Pointer (or operationId) the proposal applies to. */
  target: string;
  /** Why the change is suggested. */
  reason: string;
  /** Human-readable description of the proposed change. */
  suggestion: string;
  /** Proposed value, when applicable (e.g. "string" for set_type). */
  value?: unknown;
  severity: 'warning' | 'note';
  /** Who drafted it. Deterministic heuristics today; 'ai' once an LLM drafter is wired. */
  source: 'heuristic' | 'ai';
}

/**
 * The output of ingestion (Adapt → Assemble → Validate + Repair): one validated, self-contained
 * OpenAPI-3.1 document, the accumulated diagnostics, advisory repair proposals, and a `valid`
 * gate. `valid` is false when any blocking error is present — "bad specs fail loud", so the IR
 * stage must not run on an invalid artifact.
 */
export interface ValidatedArtifact {
  type: ArtifactType;
  document: OpenApiDocument;
  provenance: Provenance;
  diagnostics: Diagnostic[];
  proposals: RepairProposal[];
  valid: boolean;
}

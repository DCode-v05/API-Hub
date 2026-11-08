import type { ArtifactType, OpenApiDocument, Provenance } from './artifact';
import type { Diagnostic } from './diagnostics';

export type RepairOp =
  | 'set_description'
  | 'rename'
  | 'set_type'
  | 'add_example'
  | 'other';

export interface RepairProposal {
  code: string;
  op: RepairOp;
  target: string;
  reason: string;
  suggestion: string;
  value?: unknown;
  severity: 'warning' | 'note';
  source: 'heuristic' | 'ai';
}

export interface ValidatedArtifact {
  type: ArtifactType;
  document: OpenApiDocument;
  provenance: Provenance;
  diagnostics: Diagnostic[];
  proposals: RepairProposal[];
  valid: boolean;
}

import type { Diagnostic } from './diagnostics';
import type { SourceKind } from './source';

export type ArtifactType = 'openapi' | 'sdk' | 'mcp';

export type TrustLevel = 'declared' | 'inferred';

export interface Provenance {
  sourceKind: SourceKind;
  origin: string;
  sha?: string;
  ref?: string;
  pinnedAt: string;
  contentHash: string;
  trust: TrustLevel;
  acquirer: string;
}

export interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string; [k: string]: unknown };
  paths: Record<string, unknown>;
  components?: Record<string, unknown>;
  [k: string]: unknown;
}

export interface CanonicalArtifact {
  type: ArtifactType;
  document: OpenApiDocument;
  provenance: Provenance;
  diagnostics: Diagnostic[];
}

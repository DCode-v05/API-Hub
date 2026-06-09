import type { Diagnostic } from './diagnostics';
import type { SourceKind } from './source';

export type ArtifactType = 'openapi' | 'sdk' | 'mcp';

/**
 * Trust signal. A `declared` contract was authored as OpenAPI; an `inferred` one was
 * reverse-derived from an SDK or MCP server and therefore carries lower confidence —
 * exactly the "lower trust signal" the doc assigns to reverse-derived inputs.
 */
export type TrustLevel = 'declared' | 'inferred';

export interface Provenance {
  /** Which of the four inputs this came from. */
  sourceKind: SourceKind;
  /** Human-readable origin (repo url, file path, server command) — for audit only, never consumed downstream. */
  origin: string;
  /** Git commit SHA, when the source was a repository. */
  sha?: string;
  /** The ref (branch/tag/sha) requested by the caller, if any. */
  ref?: string;
  /** ISO-8601 instant the revision was pinned. Deliberately excluded from `contentHash`. */
  pinnedAt: string;
  /** sha256 of the canonical document — the deterministic pin. Same source ⇒ same hash. */
  contentHash: string;
  /** Declared vs inferred contract. */
  trust: TrustLevel;
  /** Tool + adapter that produced this artifact, e.g. "cn/0.1.0 (openapi)". */
  acquirer: string;
}

/**
 * Minimal OpenAPI 3.1 shape — the one internal target shape. We model only the parts the
 * funnel guarantees; everything else passes through untyped.
 */
export interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string; [k: string]: unknown };
  paths: Record<string, unknown>;
  components?: Record<string, unknown>;
  [k: string]: unknown;
}

/**
 * The single, fully-resolved, version-pinned document acquisition hands to ingestion.
 *
 * Origin-agnostic by construction: `document` is self-contained (external $refs bundled to
 * internal, no repo paths), so nothing downstream can tell whether the source was private,
 * fragmented, remote, or reverse-derived. For every input type `document` is OpenAPI-3.1-shaped.
 */
export interface CanonicalArtifact {
  type: ArtifactType;
  document: OpenApiDocument;
  provenance: Provenance;
  diagnostics: Diagnostic[];
}

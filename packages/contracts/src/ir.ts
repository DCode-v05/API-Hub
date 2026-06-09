import type { ArtifactType, TrustLevel } from './artifact';
import type { Diagnostic } from './diagnostics';
import type { SourceKind } from './source';

/**
 * The normalized, projection-agnostic internal model — the hub every surface would be rendered
 * from. Built from a validated artifact; identical inputs produce an identical `hash`.
 */

export type IrFieldLocation = 'path' | 'query' | 'header' | 'cookie' | 'body';

export interface IrField {
  name: string;
  /** Normalized type: string | number | integer | boolean | array | object | datetime | <SchemaName>. */
  type: string;
  required: boolean;
  in: IrFieldLocation;
  description?: string;
  /** Named schema this field references, when it is a $ref. */
  ref?: string;
}

export interface IrOutput {
  /** HTTP status the output is returned under, e.g. "200" / "201". */
  status: string;
  type: string;
  ref?: string;
  description?: string;
}

export interface IrOperation {
  /** Durable, identity-based id (e.g. op_createProject) — anchors diffs/overrides across edits. */
  id: string;
  resource: string;
  method: string;
  path: string;
  summary?: string;
  description?: string;
  input: IrField[];
  output: IrOutput[];
  /** bearer | basic | apiKey | oauth2 | none | … */
  auth: string;
  /** Carried from the artifact: declared vs reverse-derived. */
  trust: TrustLevel;
  sourceType: ArtifactType;
  /**
   * Per-operation provenance, mirroring the I.3 fragment's operation.provenance{sha, artifact_hash}.
   * Uniform across an IR's operations (one IR is built from one artifact). Excluded from the IR
   * hash — it identifies the source, not the IR content.
   */
  provenance?: { sha?: string; artifactHash: string };
}

export interface IrProvenance {
  sourceKind: SourceKind;
  origin: string;
  sha?: string;
  /** The canonical artifact's content pin (provenance.contentHash). */
  artifactHash: string;
  pinnedAt: string;
  acquirer: string;
}

export interface Ir {
  /** IR schema version, e.g. "cn-ir/1". */
  irVersion: string;
  title: string;
  apiVersion: string;
  /** Base server URLs (from the spec's `servers`); the first is the default for generated surfaces. */
  servers: string[];
  /** Sorted by id for determinism. */
  operations: IrOperation[];
  /** Named component schemas carried through for reference. */
  schemas: Record<string, unknown>;
  /** sha256 of the canonical IR (excludes provenance + diagnostics). */
  hash: string;
  provenance: IrProvenance;
  diagnostics: Diagnostic[];
}

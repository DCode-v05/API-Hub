import type { ArtifactType, TrustLevel } from './artifact';
import type { Diagnostic } from './diagnostics';
import type { SourceKind } from './source';

export type IrFieldLocation = 'path' | 'query' | 'header' | 'cookie' | 'body';

export interface IrField {
  name: string;
  type: string;
  required: boolean;
  in: IrFieldLocation;
  description?: string;
  ref?: string;
}

export interface IrOutput {
  status: string;
  type: string;
  ref?: string;
  description?: string;
}

export interface IrOperation {
  id: string;
  resource: string;
  method: string;
  path: string;
  summary?: string;
  description?: string;
  input: IrField[];
  output: IrOutput[];
  auth: string;
  trust: TrustLevel;
  sourceType: ArtifactType;
  provenance?: { sha?: string; artifactHash: string };
}

export interface IrProvenance {
  sourceKind: SourceKind;
  origin: string;
  sha?: string;
  artifactHash: string;
  pinnedAt: string;
  acquirer: string;
}

export interface Ir {
  irVersion: string;
  title: string;
  apiVersion: string;
  servers: string[];
  operations: IrOperation[];
  schemas: Record<string, unknown>;
  hash: string;
  provenance: IrProvenance;
  diagnostics: Diagnostic[];
}

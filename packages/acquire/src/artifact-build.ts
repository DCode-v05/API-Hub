import type { ArtifactType, CanonicalArtifact, Diagnostic, OpenApiDocument } from '@cn/contracts';
import { makeProvenance, type ProvenanceInput } from './provenance';

export function buildArtifact(args: {
  type: ArtifactType;
  document: OpenApiDocument;
  provenance: Omit<ProvenanceInput, 'document'>;
  diagnostics: Diagnostic[];
}): CanonicalArtifact {
  return {
    type: args.type,
    document: args.document,
    provenance: makeProvenance({ ...args.provenance, document: args.document }),
    diagnostics: args.diagnostics,
  };
}

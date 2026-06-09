import type { CanonicalArtifact, ValidatedArtifact } from '@cn/contracts';
import { hasErrors } from '@cn/contracts';
import { adapt } from './adapt';
import { assemble } from './assemble';
import { validateSpec } from './validate';
import { proposeRepairs } from './repair';

/**
 * Ingestion: Canonical artifact(s) → Validated artifact. Runs Adapt → Assemble → Validate +
 * Repair, accumulating diagnostics from acquisition onward. `valid` is false if any stage produced
 * a blocking error (including acquisition), so a downstream IR build can refuse to run.
 */
export function ingest(artifacts: CanonicalArtifact[]): ValidatedArtifact {
  if (artifacts.length === 0) {
    throw new Error('ingest requires at least one canonical artifact');
  }
  const primary = artifacts[0]!;
  const carried = artifacts.flatMap((a) => a.diagnostics);

  const adapted = artifacts.map((a) => adapt(a.document));
  const adaptDiagnostics = adapted.flatMap((r) => r.diagnostics);

  const assembled = assemble(adapted.map((r) => r.document));
  const validation = validateSpec(assembled.document);
  const proposals = proposeRepairs(assembled.document);

  const stageDiagnostics = [...adaptDiagnostics, ...assembled.diagnostics, ...validation.diagnostics];
  const diagnostics = [...carried, ...stageDiagnostics];

  return {
    type: primary.type,
    document: assembled.document,
    provenance: primary.provenance,
    diagnostics,
    proposals,
    valid: validation.valid && !hasErrors(stageDiagnostics) && !hasErrors(carried),
  };
}

export function ingestOne(artifact: CanonicalArtifact): ValidatedArtifact {
  return ingest([artifact]);
}

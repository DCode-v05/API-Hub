import type { AcquireContext, Provenance, SourceKind, TrustLevel } from '@cn/contracts';
import { pinHash } from './pin';

export interface ProvenanceInput {
  sourceKind: SourceKind;
  /** Display-only origin (repo url, file path, server command). */
  origin: string;
  trust: TrustLevel;
  /** The canonical document to hash (the pin is computed over this, excluding the timestamp). */
  document: unknown;
  ctx: AcquireContext;
  /** Adapter id, recorded in `acquirer`. */
  adapter: string;
  sha?: string;
  ref?: string;
}

export function makeProvenance(input: ProvenanceInput): Provenance {
  const provenance: Provenance = {
    sourceKind: input.sourceKind,
    origin: input.origin,
    pinnedAt: input.ctx.now(),
    contentHash: pinHash(input.document),
    trust: input.trust,
    acquirer: `cn/${input.ctx.toolVersion} (${input.adapter})`,
  };
  if (input.sha !== undefined) provenance.sha = input.sha;
  if (input.ref !== undefined) provenance.ref = input.ref;
  return provenance;
}

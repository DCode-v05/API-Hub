import type { AcquireContext, Provenance, SourceKind, TrustLevel } from '@cn/contracts';
import { pinHash } from './pin';

export interface ProvenanceInput {
  sourceKind: SourceKind;
  origin: string;
  trust: TrustLevel;
  document: unknown;
  ctx: AcquireContext;
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

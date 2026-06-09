// Public API of the ingestion stage (Adapt → Assemble → Validate + Repair).
export { ingest, ingestOne } from './service';
export { adapt, type AdaptResult } from './adapt';
export { assemble, type AssembleResult } from './assemble';
export { validateSpec, type ValidateResult } from './validate';
export { proposeRepairs } from './repair';
export {
  HTTP_METHODS,
  isObject,
  collectExternalRefs,
  collectInternalRefs,
  resolvePointer,
  refName,
  schemaType,
} from './util';

export type { ValidatedArtifact, RepairProposal, RepairOp } from '@cn/contracts';

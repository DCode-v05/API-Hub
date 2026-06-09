export { buildIr, IR_VERSION } from './build';
export { deriveOperationId, deriveResource } from './identity';
export { irHash, HASH_PREFIX } from './hash';
export { canonicalJson } from './canonicalize';

export type {
  Ir,
  IrOperation,
  IrField,
  IrOutput,
  IrFieldLocation,
  IrProvenance,
  ValidatedArtifact,
} from '@cn/contracts';

import type { SourceRef } from './source';
import type { CanonicalArtifact } from './artifact';

export interface AcquireContext {
  now: () => string;
  toolVersion: string;
  log?: (msg: string) => void;
}

export interface SourceAdapter<S extends SourceRef = SourceRef> {
  readonly name: string;
  detect(source: SourceRef): source is S;
  acquire(source: S, ctx: AcquireContext): Promise<CanonicalArtifact>;
}

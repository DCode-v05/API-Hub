import type { SourceRef } from './source';
import type { CanonicalArtifact } from './artifact';

/**
 * Side-channel services an adapter may need. Injected so the core stays deterministic and
 * testable: tests pass a fixed clock and a fake git/loader instead of touching the network.
 */
export interface AcquireContext {
  /** Returns an ISO timestamp for `provenance.pinnedAt`. Injected so it can be frozen in tests. */
  now: () => string;
  /** Tool version recorded in `provenance.acquirer`, e.g. "0.1.0". */
  toolVersion: string;
  /** Optional logger sink (the CLI wires this to stderr). */
  log?: (msg: string) => void;
}

/**
 * The adapter pattern from the doc: one small adapter per input shape, each implementing
 * detect() + acquire(). Adding an input is a new adapter file, not a pipeline edit.
 */
export interface SourceAdapter<S extends SourceRef = SourceRef> {
  /** Stable id: "github" | "openapi" | "sdk" | "mcp". */
  readonly name: string;
  /** Whether this adapter handles the given source. */
  detect(source: SourceRef): source is S;
  /** Authenticate, fetch, pin, and normalize into the canonical OpenAPI shape. */
  acquire(source: S, ctx: AcquireContext): Promise<CanonicalArtifact>;
}

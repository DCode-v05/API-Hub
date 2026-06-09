import type { Diagnostic } from './diagnostics';

/** The four surfaces an IR is projected into, plus the per-language SDK split. */
export type SurfaceKind = 'sdk-typescript' | 'sdk-python' | 'mcp' | 'cli' | 'docs';

export interface GeneratedFile {
  /** Path relative to the surface's directory, e.g. "src/client.ts". POSIX separators. */
  path: string;
  content: string;
  /** Generated entrypoints that should be runnable (informational; the writer may chmod). */
  executable?: boolean;
}

export interface Surface {
  kind: SurfaceKind;
  /** Subdirectory under the surfaces root, e.g. "sdk/typescript". */
  dir: string;
  files: GeneratedFile[];
}

/**
 * The projection: every surface rendered from one IR. Because all surfaces derive from the same
 * IR node, they cannot drift — a spec change updates the IR once and every surface re-renders.
 */
export interface Projection {
  surfaces: Surface[];
  diagnostics: Diagnostic[];
}

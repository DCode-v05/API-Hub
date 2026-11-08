import type { Diagnostic } from './diagnostics';

export type SurfaceKind = 'sdk-typescript' | 'sdk-python' | 'mcp' | 'cli' | 'docs';

export interface GeneratedFile {
  path: string;
  content: string;
  executable?: boolean;
}

export interface Surface {
  kind: SurfaceKind;
  dir: string;
  files: GeneratedFile[];
}

export interface Projection {
  surfaces: Surface[];
  diagnostics: Diagnostic[];
}

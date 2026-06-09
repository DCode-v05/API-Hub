/**
 * What a producer brings — described in the doc as location × type.
 * The CLI collapses that matrix into the four accepted inputs below.
 * A SourceRef is the *request*; acquisition turns it into a CanonicalArtifact.
 */

export type SourceKind = 'github' | 'openapi' | 'sdk' | 'mcp';

/** 1) A private/public GitHub repo, authenticated with a PAT, containing an OpenAPI spec. */
export interface GithubSource {
  kind: 'github';
  /** "owner/repo". */
  repo: string;
  /** Personal access token used only to clone. Never written into the artifact. */
  pat: string;
  /** Branch, tag, or commit SHA to pin. Defaults to the repo's default branch. */
  ref?: string;
  /** Path within the repo to the root OpenAPI document. Auto-detected when omitted. */
  spec?: string;
}

/** 2) An OpenAPI spec document — a local file path or an http(s) URL. */
export interface OpenApiSource {
  kind: 'openapi';
  /** Local file path or http(s) URL to the root OpenAPI document. */
  location: string;
}

export type SdkLanguage = 'typescript' | 'python';

/** 3) An existing SDK, reverse-derived by introspection. */
export interface SdkSource {
  kind: 'sdk';
  /** Path to the SDK package/source directory. */
  path: string;
  /** Force a language; otherwise detected from directory contents. */
  language?: SdkLanguage;
}

/** 4) An existing MCP server, reverse-derived from its advertised tools. */
export interface McpSource {
  kind: 'mcp';
  /**
   * What to introspect:
   *  - a path to a tools manifest (.json/.yaml) of the shape `{ tools: [...] }`
   *  - an http(s) URL to such a manifest
   *  - a shell command to launch a stdio MCP server (set `command: true`)
   */
  target: string;
  /** When true, `target` is a stdio server command rather than a manifest location. */
  command?: boolean;
}

export type SourceRef = GithubSource | OpenApiSource | SdkSource | McpSource;

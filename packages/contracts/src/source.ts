export type SourceKind = 'github' | 'openapi' | 'sdk' | 'mcp';

export interface GithubSource {
  kind: 'github';
  repo: string;
  pat: string;
  ref?: string;
  spec?: string;
}

export interface OpenApiSource {
  kind: 'openapi';
  location: string;
}

export type SdkLanguage = 'typescript' | 'python';

export interface SdkSource {
  kind: 'sdk';
  path: string;
  language?: SdkLanguage;
}

export interface McpSource {
  kind: 'mcp';
  target: string;
  command?: boolean;
}

export type SourceRef = GithubSource | OpenApiSource | SdkSource | McpSource;

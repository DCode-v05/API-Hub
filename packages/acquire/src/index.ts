// Public API of the acquisition stage.
export {
  AcquireService,
  defaultAdapters,
  describeSource,
  type AcquireServiceOptions,
} from './service';

export { createGithubAdapter } from './adapters/github';
export { createOpenApiAdapter } from './adapters/openapi';
export { createSdkAdapter } from './adapters/sdk';
export { createMcpAdapter } from './adapters/mcp';

export {
  createGitClient,
  type GitClient,
  type RepoCheckout,
  type CloneOptions,
} from './git';

export { bundleOpenApi, type BundleResult } from './resolve';
export { contentHash, pinHash, canonicalJson, HASH_PREFIX } from './pin';
export { makeProvenance, type ProvenanceInput } from './provenance';
export { buildArtifact } from './artifact-build';
export {
  buildOpenApiFromOperations,
  emptyOpenApiDoc,
  type DerivedOperation,
} from './openapi-shape';
export { findOpenApiSpecs } from './spec-finder';
export { walkFiles } from './fsutil';
export {
  loadMcpManifest,
  introspectStdioServer,
  type McpManifest,
  type McpTool,
} from './mcp-client';
export {
  introspectTypescriptSdk,
  introspectPythonSdk,
  type SdkFile,
  type IntrospectResult,
} from './sdk-introspect';

// Re-export the contract types so consumers can import everything from @cn/acquire.
export type {
  SourceRef,
  GithubSource,
  OpenApiSource,
  SdkSource,
  McpSource,
  SourceKind,
  SdkLanguage,
  CanonicalArtifact,
  Provenance,
  OpenApiDocument,
  ArtifactType,
  TrustLevel,
  Diagnostic,
  Severity,
  AcquireContext,
  SourceAdapter,
} from '@cn/contracts';

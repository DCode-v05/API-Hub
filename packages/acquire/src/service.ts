import type { AcquireContext, CanonicalArtifact, SourceAdapter, SourceRef } from '@cn/contracts';
import { createGithubAdapter } from './adapters/github';
import { createOpenApiAdapter } from './adapters/openapi';
import { createSdkAdapter } from './adapters/sdk';
import { createMcpAdapter } from './adapters/mcp';

/** The four built-in adapters, one per accepted input. */
export function defaultAdapters(): SourceAdapter[] {
  return [
    createGithubAdapter() as unknown as SourceAdapter,
    createOpenApiAdapter() as unknown as SourceAdapter,
    createSdkAdapter() as unknown as SourceAdapter,
    createMcpAdapter() as unknown as SourceAdapter,
  ];
}

export interface AcquireServiceOptions {
  /** Override the adapter set (tests inject a github adapter backed by a fake git client). */
  adapters?: SourceAdapter[];
}

/**
 * The acquisition stage: route a SourceRef to the adapter that handles it and return one
 * origin-blind, version-pinned CanonicalArtifact. This is the whole of Part I's first stage.
 */
export class AcquireService {
  private readonly adapters: SourceAdapter[];

  constructor(opts: AcquireServiceOptions = {}) {
    this.adapters = opts.adapters ?? defaultAdapters();
  }

  async acquire(source: SourceRef, ctx: AcquireContext): Promise<CanonicalArtifact> {
    const adapter = this.adapters.find((a) => a.detect(source));
    if (!adapter) {
      throw new Error(`no acquisition adapter for source kind: ${source.kind}`);
    }
    ctx.log?.(`acquire[${adapter.name}] ← ${describeSource(source)}`);
    return adapter.acquire(source, ctx);
  }
}

export function describeSource(source: SourceRef): string {
  switch (source.kind) {
    case 'github':
      return source.repo + (source.ref ? `@${source.ref}` : '');
    case 'openapi':
      return source.location;
    case 'sdk':
      return source.path;
    case 'mcp':
      return source.command ? `${source.target} (stdio)` : source.target;
  }
}

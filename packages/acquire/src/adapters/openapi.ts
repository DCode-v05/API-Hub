import { existsSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import type { OpenApiSource, SourceAdapter, SourceRef } from '@cn/contracts';
import { error } from '@cn/contracts';
import { bundleOpenApi } from '../resolve';
import { emptyOpenApiDoc } from '../openapi-shape';
import { buildArtifact } from '../artifact-build';

/** Input 2: an OpenAPI document at a local path or http(s) URL. The reference, declared path. */
export function createOpenApiAdapter(): SourceAdapter<OpenApiSource> {
  return {
    name: 'openapi',
    detect: (source: SourceRef): source is OpenApiSource => source.kind === 'openapi',
    async acquire(source, ctx) {
      const diagnostics = [];
      const isUrl = /^https?:\/\//i.test(source.location);
      const ref = isUrl ? source.location : resolvePath(source.location);

      if (!isUrl && !existsSync(ref)) {
        diagnostics.push(error('acq.openapi.not_found', `file not found: ${source.location}`));
        return buildArtifact({
          type: 'openapi',
          document: emptyOpenApiDoc(),
          diagnostics,
          provenance: { sourceKind: 'openapi', origin: source.location, trust: 'declared', ctx, adapter: 'openapi' },
        });
      }

      const result = await bundleOpenApi(ref);
      diagnostics.push(...result.diagnostics);
      const document = result.document ?? emptyOpenApiDoc();
      return buildArtifact({
        type: 'openapi',
        document,
        diagnostics,
        provenance: { sourceKind: 'openapi', origin: source.location, trust: 'declared', ctx, adapter: 'openapi' },
      });
    },
  };
}

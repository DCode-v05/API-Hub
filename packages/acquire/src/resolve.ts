import SwaggerParser from '@apidevtools/swagger-parser';
import type { Diagnostic, OpenApiDocument } from '@cn/contracts';
import { error, note, warn } from '@cn/contracts';
import { errMessage } from './errors';
import { collectExternalRefs } from './refs';

export interface BundleResult {
  document: OpenApiDocument | null;
  diagnostics: Diagnostic[];
}

export async function bundleOpenApi(source: string | object): Promise<BundleResult> {
  const diagnostics: Diagnostic[] = [];
  let bundled: unknown;
  try {
    bundled = await SwaggerParser.bundle(source as never);
  } catch (err) {
    diagnostics.push(
      error('acq.resolve.failed', `could not resolve OpenAPI refs: ${errMessage(err)}`),
    );
    return { document: null, diagnostics };
  }

  for (const ref of collectExternalRefs(bundled)) {
    diagnostics.push(
      warn('acq.resolve.external_ref_remains', `external $ref left unbundled: ${ref}`),
    );
  }
  return { document: normalizeToOpenApi31(bundled, diagnostics), diagnostics };
}

function normalizeToOpenApi31(raw: unknown, diagnostics: Diagnostic[]): OpenApiDocument {
  const doc = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  let openapi = doc['openapi'];
  if (typeof openapi !== 'string') {
    if (typeof doc['swagger'] === 'string') {
      diagnostics.push(
        warn(
          'acq.resolve.swagger2',
          `Swagger ${String(doc['swagger'])} passed through un-upgraded; OpenAPI 3.1 upgrade is an ingestion concern`,
        ),
      );
      openapi = `swagger-${String(doc['swagger'])}`;
    } else {
      diagnostics.push(
        warn('acq.resolve.no_version', 'no openapi/swagger version field; defaulting to 3.1.0'),
      );
      openapi = '3.1.0';
    }
  }

  let info = doc['info'];
  if (!info || typeof info !== 'object') {
    diagnostics.push(warn('acq.resolve.no_info', 'missing info object; synthesizing a placeholder'));
    info = { title: 'untitled', version: '0.0.0' };
  } else {
    const i = info as Record<string, unknown>;
    if (typeof i['title'] !== 'string') i['title'] = 'untitled';
    if (typeof i['version'] !== 'string') i['version'] = '0.0.0';
  }

  let paths = doc['paths'];
  if (!paths || typeof paths !== 'object') {
    diagnostics.push(note('acq.resolve.no_paths', 'document declares no paths'));
    paths = {};
  }

  return { ...doc, openapi, info, paths } as OpenApiDocument;
}

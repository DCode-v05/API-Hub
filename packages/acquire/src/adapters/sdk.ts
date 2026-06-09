import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import type { Diagnostic, SdkLanguage, SdkSource, SourceAdapter, SourceRef } from '@cn/contracts';
import { error, note, warn } from '@cn/contracts';
import { buildArtifact } from '../artifact-build';
import { buildOpenApiFromOperations, emptyOpenApiDoc } from '../openapi-shape';
import { bundleOpenApi } from '../resolve';
import { walkFiles } from '../fsutil';
import { findOpenApiSpecs } from '../spec-finder';
import { introspectPythonSdk, introspectTypescriptSdk, type SdkFile } from '../sdk-introspect';

const TS_RE = /\.(ts|mts|cts)$/;
const DTS_RE = /\.d\.ts$/;
const PY_RE = /\.py$/;
const TEST_RE = /\.(test|spec)\.(ts|mts|cts|py)$/;
const MAX_SDK_FILE_BYTES = 2 * 1024 * 1024;
const MAX_SDK_FILES = 2000;

/**
 * Input 3: an existing SDK, reverse-derived by introspection. If the SDK ships its own OpenAPI
 * spec we use that (declared, high fidelity); otherwise we introspect TS/Python signatures into
 * an inferred, lower-trust contract.
 */
export function createSdkAdapter(): SourceAdapter<SdkSource> {
  return {
    name: 'sdk',
    detect: (source: SourceRef): source is SdkSource => source.kind === 'sdk',
    async acquire(source, ctx) {
      const diagnostics: Diagnostic[] = [];
      const origin = source.path;

      if (!existsSync(source.path)) {
        diagnostics.push(error('acq.sdk.not_found', `path not found: ${source.path}`));
        return buildArtifact({
          type: 'sdk',
          document: emptyOpenApiDoc(),
          diagnostics,
          provenance: { sourceKind: 'sdk', origin, trust: 'inferred', ctx, adapter: 'sdk' },
        });
      }

      // 1) An embedded spec is the highest-fidelity source — prefer it over introspection.
      const embedded = findOpenApiSpecs(source.path, 3);
      if (embedded.length > 0) {
        diagnostics.push(
          note('acq.sdk.embedded_spec', `SDK ships an OpenAPI spec (${relative(source.path, embedded[0]!)}); using it directly`),
        );
        const result = await bundleOpenApi(embedded[0]!);
        diagnostics.push(...result.diagnostics);
        const document = result.document ?? emptyOpenApiDoc();
        // Still an SDK input, so the artifact stays in the reverse-derived (inferred) trust tier;
        // the embedded-spec note records the higher fidelity without contradicting the
        // "SDK/MCP ⇒ inferred" guarantee.
        return buildArtifact({
          type: 'sdk',
          document,
          diagnostics,
          provenance: { sourceKind: 'sdk', origin, trust: 'inferred', ctx, adapter: 'sdk' },
        });
      }

      // 2) Reverse-derive from source.
      const language = source.language ?? detectLanguage(source.path);
      if (!language) {
        diagnostics.push(
          error('acq.sdk.lang_unknown', 'could not detect SDK language; pass --lang typescript|python'),
        );
        return buildArtifact({
          type: 'sdk',
          document: emptyOpenApiDoc(basename(source.path)),
          diagnostics,
          provenance: { sourceKind: 'sdk', origin, trust: 'inferred', ctx, adapter: 'sdk' },
        });
      }

      const files = collectSdkFiles(source.path, language, diagnostics);
      const introspect =
        language === 'typescript' ? introspectTypescriptSdk(files) : introspectPythonSdk(files);
      diagnostics.push(...introspect.diagnostics);

      const built = buildOpenApiFromOperations({
        title: basename(source.path),
        version: '0.0.0',
        source: 'sdk',
        ops: introspect.ops,
      });
      diagnostics.push(...built.diagnostics);
      diagnostics.push(
        warn('acq.sdk.inferred', `SDK contract reverse-derived from ${language}; lower trust signal`),
      );

      return buildArtifact({
        type: 'sdk',
        document: built.document,
        diagnostics,
        provenance: { sourceKind: 'sdk', origin, trust: 'inferred', ctx, adapter: 'sdk' },
      });
    },
  };
}

function detectLanguage(dir: string): SdkLanguage | null {
  const tsCount = walkFiles(dir, (n) => TS_RE.test(n) && !DTS_RE.test(n), 4).length;
  const dtsCount = walkFiles(dir, (n) => DTS_RE.test(n), 4).length;
  const pyCount = walkFiles(dir, (n) => PY_RE.test(n), 4).length;
  const tsTotal = tsCount + dtsCount;

  const pyMarker = existsSync(join(dir, 'pyproject.toml')) || existsSync(join(dir, 'setup.py'));
  const tsMarker = existsSync(join(dir, 'package.json')) || existsSync(join(dir, 'tsconfig.json'));

  if (tsTotal > 0 && pyCount === 0) return 'typescript';
  if (pyCount > 0 && tsTotal === 0) return 'python';
  if (pyCount > 0 && tsTotal > 0) return pyMarker && !tsMarker ? 'python' : 'typescript';
  return null;
}

function collectSdkFiles(dir: string, language: SdkLanguage, diagnostics: Diagnostic[]): SdkFile[] {
  const match = language === 'typescript' ? (n: string) => TS_RE.test(n) : (n: string) => PY_RE.test(n);
  let paths = walkFiles(dir, match, 6).filter((p) => !TEST_RE.test(p));

  if (paths.length > MAX_SDK_FILES) {
    diagnostics.push(
      warn('acq.sdk.too_many_files', `introspecting the first ${MAX_SDK_FILES} of ${paths.length} files`),
    );
    paths = paths.slice(0, MAX_SDK_FILES);
  }

  const files: SdkFile[] = [];
  for (const path of paths) {
    let size = 0;
    try {
      size = statSync(path).size;
    } catch {
      continue;
    }
    if (size > MAX_SDK_FILE_BYTES) {
      diagnostics.push(note('acq.sdk.file_skipped', `skipped oversized file (${size} bytes): ${path}`));
      continue;
    }
    files.push({ path, text: readFileSync(path, 'utf8') });
  }
  return files;
}

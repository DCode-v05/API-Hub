import { existsSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { GithubSource, SourceAdapter, SourceRef } from '@cn/contracts';
import { error, warn } from '@cn/contracts';
import { bundleOpenApi } from '../resolve';
import { emptyOpenApiDoc } from '../openapi-shape';
import { buildArtifact } from '../artifact-build';
import { findOpenApiSpecs } from '../spec-finder';
import { errMessage } from '../errors';
import { createGitClient, type GitClient } from '../git';

/**
 * Input 1: a GitHub repo authenticated with a PAT. Clone → pin the commit SHA → locate the
 * OpenAPI spec → bundle to a self-contained document. `git` is injectable so this is testable
 * against a local fixture without touching the network.
 */
export function createGithubAdapter(git: GitClient = createGitClient()): SourceAdapter<GithubSource> {
  return {
    name: 'github',
    detect: (source: SourceRef): source is GithubSource => source.kind === 'github',
    async acquire(source, ctx) {
      const diagnostics = [];
      const origin = `github.com/${source.repo}`;
      const refField = source.ref !== undefined ? { ref: source.ref } : {};

      let checkout;
      try {
        checkout = await git.clone({ repo: source.repo, pat: source.pat, ref: source.ref });
      } catch (e) {
        diagnostics.push(error('acq.github.clone_failed', errMessage(e)));
        return buildArtifact({
          type: 'openapi',
          document: emptyOpenApiDoc(),
          diagnostics,
          provenance: { sourceKind: 'github', origin, trust: 'declared', ctx, adapter: 'github', ...refField },
        });
      }

      try {
        let specPath: string | undefined;
        if (source.spec) {
          // Contain the caller-supplied path inside the checkout: `join` alone does NOT neutralize
          // "../" or absolute segments, which would let --spec read arbitrary host files into the
          // artifact (and break origin-blindness).
          const root = resolve(checkout.dir);
          const candidate = resolve(checkout.dir, source.spec);
          if (candidate !== root && !candidate.startsWith(root + sep)) {
            diagnostics.push(
              error('acq.github.spec_escapes_repo', `--spec path escapes the repository: ${source.spec}`),
            );
          } else if (existsSync(candidate)) {
            specPath = candidate;
          } else {
            diagnostics.push(error('acq.github.spec_not_found', `spec not found at ${source.spec}`));
          }
        } else {
          const specs = findOpenApiSpecs(checkout.dir);
          if (specs.length === 0) {
            diagnostics.push(error('acq.github.no_spec', 'no OpenAPI spec found in repo; pass --spec <path>'));
          } else {
            specPath = specs[0];
            if (specs.length > 1) {
              const rels = specs.map((s) => relative(checkout.dir, s)).join(', ');
              diagnostics.push(
                warn(
                  'acq.github.multiple_specs',
                  `found ${specs.length} specs; using "${relative(checkout.dir, specs[0]!)}" (pass --spec to choose). all: ${rels}`,
                ),
              );
            }
          }
        }

        let document = emptyOpenApiDoc();
        if (specPath) {
          const result = await bundleOpenApi(specPath);
          diagnostics.push(...result.diagnostics);
          document = result.document ?? emptyOpenApiDoc();
        }

        return buildArtifact({
          type: 'openapi',
          document,
          diagnostics,
          provenance: { sourceKind: 'github', origin, sha: checkout.sha, trust: 'declared', ctx, adapter: 'github', ...refField },
        });
      } finally {
        await checkout.cleanup();
      }
    },
  };
}

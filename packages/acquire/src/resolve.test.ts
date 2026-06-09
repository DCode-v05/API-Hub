import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { bundleOpenApi } from './index';

const here = fileURLToPath(new URL('.', import.meta.url));
const fixtures = join(here, '..', '..', '..', 'fixtures');

describe('bundleOpenApi', () => {
  it('bundles external file refs into a self-contained document', async () => {
    const { document, diagnostics } = await bundleOpenApi(
      join(fixtures, 'lumen', 'openapi', 'lumen.json'),
    );
    expect(document).not.toBeNull();
    // No external $ref ("./" "../" or "/") should remain after bundling — origin-blind.
    expect(JSON.stringify(document)).not.toMatch(/"\$ref":\s*"\.{0,2}\//);
    expect(diagnostics.some((d) => d.severity === 'error')).toBe(false);
  });

  it('handles a single-file spec with only internal refs', async () => {
    const { document } = await bundleOpenApi(join(fixtures, 'params-sample', 'openapi.json'));
    expect(document).not.toBeNull();
    expect(Object.keys(document!.paths)).toContain('/accounts/{account_id}');
  });

  it('returns an error diagnostic (not a throw) for a missing file', async () => {
    const { document, diagnostics } = await bundleOpenApi(join(fixtures, 'nope.json'));
    expect(document).toBeNull();
    expect(diagnostics.some((d) => d.severity === 'error')).toBe(true);
  });
});

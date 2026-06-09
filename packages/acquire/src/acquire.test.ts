import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  AcquireService,
  createGithubAdapter,
  createMcpAdapter,
  createOpenApiAdapter,
  createSdkAdapter,
  canonicalJson,
  contentHash,
} from './index';
import type { AcquireContext, CanonicalArtifact, GitClient } from './index';
import { hasErrors } from '@cn/contracts';

const here = fileURLToPath(new URL('.', import.meta.url));
const fixtures = join(here, '..', '..', '..', 'fixtures');

function ctx(now = '2026-01-01T00:00:00.000Z'): AcquireContext {
  return { now: () => now, toolVersion: 'test' };
}

/** Reach into the synthesized OpenAPI without fighting the loose index types. */
function op(artifact: CanonicalArtifact, path: string, method = 'post'): any {
  return (artifact.document.paths[path] as Record<string, unknown>)[method];
}

describe('openapi adapter', () => {
  const lumen = join(fixtures, 'lumen', 'openapi', 'lumen.json');

  it('bundles a multi-file spec into an origin-blind, pinned artifact', async () => {
    const art = await createOpenApiAdapter().acquire({ kind: 'openapi', location: lumen }, ctx());
    expect(art.type).toBe('openapi');
    expect(art.provenance.trust).toBe('declared');
    expect(art.provenance.contentHash.startsWith('sha256:')).toBe(true);
    expect(Object.keys(art.document.paths)).toContain('/projects');
    expect(JSON.stringify(art.document)).toContain('createProject');
    expect(JSON.stringify(art.document)).not.toMatch(/"\$ref":\s*"\.{0,2}\//);
    expect(hasErrors(art.diagnostics)).toBe(false);
  });

  it('is deterministic: same source ⇒ same content hash regardless of timestamp', async () => {
    const a = await createOpenApiAdapter().acquire(
      { kind: 'openapi', location: lumen },
      ctx('2020-01-01T00:00:00.000Z'),
    );
    const b = await createOpenApiAdapter().acquire(
      { kind: 'openapi', location: lumen },
      ctx('2030-06-06T06:06:06.060Z'),
    );
    expect(a.provenance.contentHash).toBe(b.provenance.contentHash);
    expect(a.provenance.pinnedAt).not.toBe(b.provenance.pinnedAt);
  });

  it('reports an error diagnostic for a missing file', async () => {
    const art = await createOpenApiAdapter().acquire(
      { kind: 'openapi', location: join(fixtures, 'missing.json') },
      ctx(),
    );
    expect(hasErrors(art.diagnostics)).toBe(true);
  });
});

describe('github adapter (fake git client)', () => {
  const fakeGitAt = (dir: string, sha: string): GitClient => ({
    async clone() {
      return { dir, sha, cleanup: async () => {} };
    },
  });

  it('pins the commit SHA and bundles the named spec', async () => {
    const adapter = createGithubAdapter(fakeGitAt(join(fixtures, 'lumen', 'openapi'), 'deadbeefcafe1234'));
    const art = await adapter.acquire(
      { kind: 'github', repo: 'acme/lumen', pat: 'secret', spec: 'lumen.json' },
      ctx(),
    );
    expect(art.type).toBe('openapi');
    expect(art.provenance.sourceKind).toBe('github');
    expect(art.provenance.sha).toBe('deadbeefcafe1234');
    expect(Object.keys(art.document.paths)).toContain('/projects');
    expect(hasErrors(art.diagnostics)).toBe(false);
  });

  it('auto-detects a spec by conventional name', async () => {
    const adapter = createGithubAdapter(fakeGitAt(join(fixtures, 'params-sample'), 'abc1234'));
    const art = await adapter.acquire({ kind: 'github', repo: 'acme/params', pat: 'secret' }, ctx());
    expect(Object.keys(art.document.paths)).toContain('/accounts/{account_id}');
  });

  it('rejects a --spec path that escapes the repository (no host file read)', async () => {
    const adapter = createGithubAdapter(fakeGitAt(join(fixtures, 'lumen', 'openapi'), 'abc'));
    const art = await adapter.acquire(
      { kind: 'github', repo: 'acme/lumen', pat: 'secret', spec: '../../../../etc/hosts' },
      ctx(),
    );
    expect(hasErrors(art.diagnostics)).toBe(true);
    expect(art.diagnostics.some((d) => d.code === 'acq.github.spec_escapes_repo')).toBe(true);
    expect(Object.keys(art.document.paths)).not.toContain('/projects');
  });
});

describe('sdk adapter (reverse-derived, inferred)', () => {
  it('introspects a TypeScript SDK into operations', async () => {
    const art = await createSdkAdapter().acquire(
      { kind: 'sdk', path: join(fixtures, 'sdk-sample') },
      ctx(),
    );
    expect(art.type).toBe('sdk');
    expect(art.provenance.trust).toBe('inferred');
    expect(art.document['x-cn-trust']).toBe('inferred');
    const keys = Object.keys(art.document.paths);
    expect(keys).toContain('/projects_create');
    expect(keys).toContain('/projects_list');
    expect(op(art, '/projects_create').requestBody.content['application/json'].schema.properties).toHaveProperty('name');
  });

  it('introspects a Python SDK by signature scan', async () => {
    const art = await createSdkAdapter().acquire(
      { kind: 'sdk', path: join(fixtures, 'sdk-sample-py') },
      ctx(),
    );
    const keys = Object.keys(art.document.paths);
    expect(keys).toContain('/create');
    expect(keys).toContain('/list');
    const schema = op(art, '/create').requestBody.content['application/json'].schema;
    expect(schema.required).toEqual(expect.arrayContaining(['name', 'team_id']));
    expect(schema.required).not.toContain('template');
  });
});

describe('mcp adapter (inputSchema → operations)', () => {
  it('maps each tool into an operation carrying its inputSchema', async () => {
    const art = await createMcpAdapter().acquire(
      { kind: 'mcp', target: join(fixtures, 'mcp-sample', 'tools.json') },
      ctx(),
    );
    expect(art.type).toBe('mcp');
    expect(art.provenance.trust).toBe('inferred');
    const keys = Object.keys(art.document.paths);
    expect(keys).toContain('/create_project');
    expect(keys).toContain('/list_projects');
    const schema = op(art, '/create_project').requestBody.content['application/json'].schema;
    expect(schema.required).toContain('team_id');
  });

  it('warns when a derived tool schema carries an external $ref (origin-blindness)', async () => {
    const art = await createMcpAdapter().acquire(
      { kind: 'mcp', target: join(fixtures, 'mcp-sample', 'external-ref.json') },
      ctx(),
    );
    expect(art.diagnostics.some((d) => d.code === 'acq.shape.external_ref_remains')).toBe(true);
  });
});

describe('AcquireService routing', () => {
  it('routes a source to the matching adapter', async () => {
    const art = await new AcquireService().acquire(
      { kind: 'openapi', location: join(fixtures, 'params-sample', 'openapi.json') },
      ctx(),
    );
    expect(art.type).toBe('openapi');
    expect(Object.keys(art.document.paths)).toContain('/accounts/{account_id}');
  });
});

describe('pin / canonicalization', () => {
  it('hashes independent of key order', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
    expect(contentHash({ a: 1, b: { d: 4, c: 3 } })).toBe(contentHash({ b: { c: 3, d: 4 }, a: 1 }));
  });
});

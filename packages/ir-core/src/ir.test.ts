import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createMcpAdapter, createOpenApiAdapter, createSdkAdapter } from '@cn/acquire';
import type { AcquireContext, CanonicalArtifact, SourceRef } from '@cn/acquire';
import { ingestOne } from '@cn/ingest';
import type { Ir } from './index';
import { buildIr, deriveOperationId } from './index';

const here = fileURLToPath(new URL('.', import.meta.url));
const fixtures = join(here, '..', '..', '..', 'fixtures');
const ctx = (): AcquireContext => ({ now: () => '2026-01-01T00:00:00.000Z', toolVersion: 'test' });

async function buildFrom(source: SourceRef): Promise<Ir> {
  const adapter =
    source.kind === 'openapi'
      ? createOpenApiAdapter()
      : source.kind === 'mcp'
        ? createMcpAdapter()
        : createSdkAdapter();
  const artifact: CanonicalArtifact = await adapter.acquire(source as never, ctx());
  return buildIr(ingestOne(artifact));
}

function findOp(ir: Ir, id: string) {
  return ir.operations.find((o) => o.id === id);
}

describe('identity', () => {
  it('prefers operationId, else synthesizes from method+path (position-independent)', () => {
    expect(deriveOperationId('/projects', 'post', { operationId: 'createProject' })).toBe('op_createProject');
    expect(deriveOperationId('/accounts/{account_id}', 'get', {})).toBe('op_get_accounts_account_id');
  });
});

describe('buildIr from OpenAPI (lumen)', () => {
  it('produces a normalized, content-hashed IR with the expected operation node', async () => {
    const ir = await buildFrom({ kind: 'openapi', location: join(fixtures, 'lumen', 'openapi', 'lumen.json') });
    expect(ir.hash.startsWith('sha256:')).toBe(true);
    const op = findOp(ir, 'op_createProject');
    expect(op).toBeDefined();
    expect(op!.resource).toBe('projects');
    expect(op!.method).toBe('POST');
    expect(op!.path).toBe('/projects');
    expect(op!.auth).toBe('bearer');
    expect(op!.trust).toBe('declared');

    const byName = Object.fromEntries(op!.input.map((f) => [f.name, f]));
    expect(byName['name']!.required).toBe(true);
    expect(byName['team_id']!.required).toBe(true);
    expect(byName['template']!.required).toBe(false);
    expect(op!.input.every((f) => f.in === 'body')).toBe(true);

    const created = op!.output.find((o) => o.status === '201');
    expect(created?.ref).toBe('Project');
  });

  it('is deterministic: same source ⇒ same IR hash', async () => {
    const a = await buildFrom({ kind: 'openapi', location: join(fixtures, 'lumen', 'openapi', 'lumen.json') });
    const b = await buildFrom({ kind: 'openapi', location: join(fixtures, 'lumen', 'openapi', 'lumen.json') });
    expect(a.hash).toBe(b.hash);
  });
});

describe('buildIr from reverse-derived inputs', () => {
  it('builds an inferred IR from an MCP server', async () => {
    const ir = await buildFrom({ kind: 'mcp', target: join(fixtures, 'mcp-sample', 'tools.json') });
    const op = findOp(ir, 'op_create_project');
    expect(op).toBeDefined();
    expect(op!.sourceType).toBe('mcp');
    expect(op!.trust).toBe('inferred');
    expect(op!.input.map((f) => f.name)).toEqual(expect.arrayContaining(['name', 'team_id', 'template']));
    expect(findOp(ir, 'op_list_projects')).toBeDefined();
  });

  it('builds an inferred IR from a TypeScript SDK', async () => {
    const ir = await buildFrom({ kind: 'sdk', path: join(fixtures, 'sdk-sample') });
    expect(ir.operations.length).toBeGreaterThan(0);
    expect(ir.operations.every((o) => o.sourceType === 'sdk' && o.trust === 'inferred')).toBe(true);
    expect(findOp(ir, 'op_projects_create')).toBeDefined();
  });
});

describe('review regressions', () => {
  const artifactOf = (document: unknown): CanonicalArtifact => ({
    type: 'openapi',
    document: document as CanonicalArtifact['document'],
    provenance: {
      sourceKind: 'openapi',
      origin: 'inline',
      pinnedAt: '2026-01-01T00:00:00.000Z',
      contentHash: 'sha256:abc123',
      trust: 'declared',
      acquirer: 'cn/test (openapi)',
    },
    diagnostics: [],
  });

  it('disambiguates colliding synthesized operation ids and reports them', () => {
    const doc = {
      openapi: '3.1.0',
      info: { title: 't', version: '1' },
      paths: {
        '/a-b': { get: { responses: { '200': { description: 'ok' } } } },
        '/a_b': { get: { responses: { '200': { description: 'ok' } } } },
      },
    };
    const ir = buildIr(ingestOne(artifactOf(doc)));
    const ids = ir.operations.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length); // all unique
    expect(ids).toContain('op_get_a_b');
    expect(ids).toContain('op_get_a_b_2');
    expect(ir.diagnostics.some((d) => d.code === 'ir.duplicate_operation_id')).toBe(true);
  });

  it('carries per-operation provenance matching the IR provenance, without affecting the hash', () => {
    const doc = { openapi: '3.1.0', info: { title: 't', version: '1' }, paths: { '/a': { get: { operationId: 'getA', responses: { '200': { description: 'ok' } } } } } };
    const ir = buildIr(ingestOne(artifactOf(doc)));
    const op = ir.operations[0]!;
    expect(op.provenance?.artifactHash).toBe(ir.provenance.artifactHash);
    expect(op.provenance?.artifactHash).toBe('sha256:abc123');
  });
});

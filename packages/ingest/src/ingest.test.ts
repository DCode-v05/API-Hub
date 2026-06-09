import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createOpenApiAdapter } from '@cn/acquire';
import type { AcquireContext, CanonicalArtifact, OpenApiDocument } from '@cn/acquire';
import { adapt, assemble, ingestOne, proposeRepairs, validateSpec } from './index';

const here = fileURLToPath(new URL('.', import.meta.url));
const fixtures = join(here, '..', '..', '..', 'fixtures');
const ctx = (): AcquireContext => ({ now: () => '2026-01-01T00:00:00.000Z', toolVersion: 'test' });

function acquireOpenapi(file: string): Promise<CanonicalArtifact> {
  return createOpenApiAdapter().acquire({ kind: 'openapi', location: join(fixtures, file) }, ctx());
}

describe('adapt', () => {
  it('normalizes 3.0 nullable into 3.1 type arrays', () => {
    const doc = {
      openapi: '3.0.3',
      info: { title: 't', version: '1' },
      paths: {},
      components: { schemas: { X: { type: 'string', nullable: true } } },
    } as unknown as OpenApiDocument;
    const { document } = adapt(doc);
    expect(document.openapi).toBe('3.1.0');
    const x = (document.components as any).schemas.X;
    expect(x.type).toEqual(['string', 'null']);
    expect(x.nullable).toBeUndefined();
  });

  it('upgrades Swagger 2.0 best-effort (definitions, body param, response schema)', () => {
    const doc = {
      swagger: '2.0',
      info: { title: 't', version: '1' },
      host: 'api.example',
      basePath: '/v1',
      schemes: ['https'],
      paths: {
        '/things': {
          post: {
            operationId: 'createThing',
            parameters: [{ in: 'body', name: 'body', schema: { $ref: '#/definitions/Thing' } }],
            responses: { '200': { description: 'ok', schema: { $ref: '#/definitions/Thing' } } },
          },
        },
      },
      definitions: { Thing: { type: 'object', properties: { id: { type: 'string' } } } },
    } as unknown as OpenApiDocument;
    const { document, diagnostics } = adapt(doc);
    expect(document.openapi).toBe('3.1.0');
    expect((document as any).swagger).toBeUndefined();
    expect((document.components as any).schemas.Thing).toBeDefined();
    const op = (document.paths['/things'] as any).post;
    expect(op.requestBody.content['application/json'].schema.$ref).toBe('#/components/schemas/Thing');
    expect(op.responses['200'].content['application/json'].schema.$ref).toBe('#/components/schemas/Thing');
    expect((document as any).servers[0].url).toBe('https://api.example/v1');
    expect(diagnostics.some((d) => d.code === 'ing.adapt.swagger2')).toBe(true);
  });
});

describe('validate (fail loud)', () => {
  const base = (paths: Record<string, unknown>, components?: unknown): OpenApiDocument =>
    ({ openapi: '3.1.0', info: { title: 't', version: '1' }, paths, ...(components ? { components } : {}) }) as OpenApiDocument;

  it('errors on an undeclared path parameter', () => {
    const r = validateSpec(base({ '/a/{id}': { get: { responses: { '200': { description: 'ok' } } } } }));
    expect(r.valid).toBe(false);
    expect(r.diagnostics.some((d) => d.code === 'ing.validate.undeclared_path_param')).toBe(true);
  });

  it('errors on a duplicate operationId', () => {
    const r = validateSpec(
      base({
        '/a': { get: { operationId: 'dup', responses: { '200': { description: 'ok' } } } },
        '/b': { get: { operationId: 'dup', responses: { '200': { description: 'ok' } } } },
      }),
    );
    expect(r.valid).toBe(false);
    expect(r.diagnostics.some((d) => d.code === 'ing.validate.duplicate_operation_id')).toBe(true);
  });

  it('errors on an unresolved internal $ref', () => {
    const r = validateSpec(
      base({ '/a': { get: { responses: { '200': { description: 'ok', content: { 'application/json': { schema: { $ref: '#/components/schemas/Missing' } } } } } } } }),
    );
    expect(r.valid).toBe(false);
    expect(r.diagnostics.some((d) => d.code === 'ing.validate.unresolved_ref')).toBe(true);
  });

  it('passes a well-formed spec', () => {
    const r = validateSpec(base({ '/a/{id}': { get: { operationId: 'getA', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'ok' } } } } }));
    expect(r.valid).toBe(true);
  });
});

describe('repair (advisory proposals, never applied)', () => {
  it('proposes string typing for a numeric-looking id and flags missing descriptions', () => {
    const doc = {
      openapi: '3.1.0',
      info: { title: 't', version: '1' },
      paths: {
        '/accounts/{account_id}': {
          get: {
            operationId: 'getAccount',
            parameters: [{ name: 'account_id', in: 'path', required: true, schema: { type: 'integer' } }],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    } as unknown as OpenApiDocument;
    const proposals = proposeRepairs(doc);
    const idFix = proposals.find((p) => p.code === 'repair.id_typed_as_number');
    expect(idFix?.op).toBe('set_type');
    expect(idFix?.value).toBe('string');
    expect(proposals.some((p) => p.code === 'repair.missing_description')).toBe(true);
    // proposals are advisory — the document is untouched
    expect((doc.paths['/accounts/{account_id}'] as any).get.parameters[0].schema.type).toBe('integer');
  });
});

describe('assemble', () => {
  it('merges two specs and renames colliding schemas', () => {
    const a = { openapi: '3.1.0', info: { title: 'A', version: '1' }, paths: { '/a': { get: { responses: { '200': { description: 'ok' } } } } }, components: { schemas: { Item: { type: 'object', properties: { x: { type: 'string' } } } } } } as OpenApiDocument;
    const b = { openapi: '3.1.0', info: { title: 'B', version: '1' }, paths: { '/b': { get: { responses: { '200': { description: 'ok' } } } } }, components: { schemas: { Item: { type: 'object', properties: { y: { type: 'number' } } } } } } as OpenApiDocument;
    const { document, diagnostics } = assemble([a, b]);
    expect(Object.keys(document.paths)).toEqual(expect.arrayContaining(['/a', '/b']));
    expect(diagnostics.some((d) => d.code === 'ing.assemble.schema_renamed')).toBe(true);
    expect((document.components as any).schemas).toHaveProperty('b_Item');
  });

  it('notes circular schema refs', () => {
    const doc = { openapi: '3.1.0', info: { title: 't', version: '1' }, paths: {}, components: { schemas: { Node: { type: 'object', properties: { next: { $ref: '#/components/schemas/Node' } } } } } } as OpenApiDocument;
    const { diagnostics } = assemble([doc]);
    expect(diagnostics.some((d) => d.code === 'ing.assemble.circular_refs')).toBe(true);
  });
});

describe('ingestOne end-to-end', () => {
  it('produces a valid artifact from the lumen spec', async () => {
    const artifact = await acquireOpenapi(join('lumen', 'openapi', 'lumen.json'));
    const validated = ingestOne(artifact);
    expect(validated.valid).toBe(true);
    expect(validated.type).toBe('openapi');
    expect(validated.document.openapi).toBe('3.1.0');
    expect(Object.keys(validated.document.paths)).toContain('/projects');
  });
});

describe('review regressions', () => {
  const doc = (paths: Record<string, unknown>, components?: unknown): OpenApiDocument =>
    ({ openapi: '3.1.0', info: { title: 't', version: '1' }, paths, ...(components ? { components } : {}) }) as OpenApiDocument;

  it('validate: accepts a path parameter declared via $ref (no false positive)', () => {
    const r = validateSpec(
      doc(
        { '/a/{id}': { get: { parameters: [{ $ref: '#/components/parameters/IdParam' }], responses: { '200': { description: 'ok' } } } } },
        { parameters: { IdParam: { name: 'id', in: 'path', required: true, schema: { type: 'string' } } } },
      ),
    );
    expect(r.valid).toBe(true);
    expect(r.diagnostics.some((d) => d.code === 'ing.validate.undeclared_path_param')).toBe(false);
  });

  it('validate: a $ref to a prototype member resolves as unresolved (not Object.prototype)', () => {
    const r = validateSpec(
      doc({ '/a': { get: { responses: { '200': { description: 'ok', content: { 'application/json': { schema: { $ref: '#/components/schemas/constructor' } } } } } } } }, { schemas: {} }),
    );
    expect(r.diagnostics.some((d) => d.code === 'ing.validate.unresolved_ref')).toBe(true);
  });

  it('assemble: merges a shared path with path-level parameters without a false collision', () => {
    const a = doc({ '/x': { get: { responses: { '200': { description: 'ok' } } }, parameters: [{ name: 'q', in: 'query', schema: { type: 'string' } }] } });
    const b = doc({ '/x': { post: { responses: { '200': { description: 'ok' } } }, parameters: [{ name: 'q', in: 'query', schema: { type: 'string' } }] } });
    const { document, diagnostics } = assemble([a, b]);
    expect(diagnostics.some((d) => d.code === 'ing.assemble.path_collision')).toBe(false);
    const x = document.paths['/x'] as any;
    expect(x.get).toBeDefined();
    expect(x.post).toBeDefined();
  });

  it('assemble: still detects a true method collision on a shared path', () => {
    const a = doc({ '/x': { get: { responses: { '200': { description: 'ok' } } } } });
    const b = doc({ '/x': { get: { responses: { '200': { description: 'ok' } } } } });
    const { diagnostics } = assemble([a, b]);
    expect(diagnostics.some((d) => d.code === 'ing.assemble.path_collision')).toBe(true);
  });

  it('repair: targets are resolvable JSON Pointers (no bracket syntax)', () => {
    const proposals = proposeRepairs(
      doc({ '/accounts/{account_id}': { get: { operationId: 'getAccount', parameters: [{ name: 'account_id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '200': { description: 'ok' } } } } }),
    );
    expect(proposals.length).toBeGreaterThan(0);
    for (const p of proposals) {
      expect(p.target.startsWith('#/')).toBe(true);
      expect(p.target).not.toContain('[');
    }
  });

  it('robustness: a pathologically deep spec does not stack-overflow', () => {
    let schema: unknown = { type: 'string' };
    for (let i = 0; i < 10000; i++) schema = { type: 'object', properties: { child: schema } };
    const deep = doc({}, { schemas: { Deep: schema } });
    expect(() => validateSpec(deep)).not.toThrow();
  });
});

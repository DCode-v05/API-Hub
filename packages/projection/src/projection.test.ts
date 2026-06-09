import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createOpenApiAdapter } from '@cn/acquire';
import type { AcquireContext } from '@cn/acquire';
import { ingestOne } from '@cn/ingest';
import { buildIr } from '@cn/ir-core';
import type { Ir, Surface, SurfaceKind } from './index';
import { project } from './index';
import { pascal, restVerb, snake } from './naming';

const here = fileURLToPath(new URL('.', import.meta.url));
const fixtures = join(here, '..', '..', '..', 'fixtures');
const ctx = (): AcquireContext => ({ now: () => '2026-01-01T00:00:00.000Z', toolVersion: 'test' });

async function lumenIr(): Promise<Ir> {
  const artifact = await createOpenApiAdapter().acquire(
    { kind: 'openapi', location: join(fixtures, 'lumen', 'openapi', 'lumen.json') },
    ctx(),
  );
  return buildIr(ingestOne(artifact));
}

function fileOf(surfaces: Surface[], kind: SurfaceKind, path: string): string | undefined {
  return surfaces.find((s) => s.kind === kind)?.files.find((f) => f.path === path)?.content;
}

function endingWith(surfaces: Surface[], kind: SurfaceKind, suffix: string): string | undefined {
  return surfaces.find((s) => s.kind === kind)?.files.find((f) => f.path.endsWith(suffix))?.content;
}

async function adversarialIr(): Promise<Ir> {
  const artifact = await createOpenApiAdapter().acquire(
    { kind: 'openapi', location: join(fixtures, 'adversarial', 'openapi.json') },
    ctx(),
  );
  return buildIr(ingestOne(artifact));
}

describe('naming', () => {
  it('derives REST verbs from method + path shape', () => {
    expect(restVerb('POST', '/projects')).toBe('create');
    expect(restVerb('GET', '/projects')).toBe('list');
    expect(restVerb('GET', '/projects/{id}')).toBe('get');
    expect(restVerb('DELETE', '/projects/{id}')).toBe('delete');
  });
  it('case helpers', () => {
    expect(pascal('create_project')).toBe('CreateProject');
    expect(snake('createProject')).toBe('create_project');
  });
});

describe('project (lumen)', () => {
  it('renders all five surfaces', async () => {
    const { surfaces } = project(await lumenIr());
    expect(surfaces.map((s) => s.kind).sort()).toEqual(
      ['cli', 'docs', 'mcp', 'sdk-python', 'sdk-typescript'],
    );
  });

  it('TypeScript SDK exposes projects.create and a Project model', async () => {
    const { surfaces } = project(await lumenIr());
    const client = fileOf(surfaces, 'sdk-typescript', 'src/client.ts')!;
    const resource = fileOf(surfaces, 'sdk-typescript', 'src/resources/projects.ts')!;
    const models = fileOf(surfaces, 'sdk-typescript', 'src/models.ts')!;
    expect(client).toContain('readonly projects: ProjectsResource');
    expect(resource).toContain('create(params: models.CreateProjectParams): Promise<models.Project>');
    expect(models).toContain('export interface Project {');
    expect(models).toContain('export interface CreateProjectParams {');
  });

  it('Python SDK has a create method with future annotations', async () => {
    const { surfaces } = project(await lumenIr());
    const clientPy = fileOf(surfaces, 'sdk-python', 'lumen_api_sdk/client.py')!;
    expect(clientPy).toContain('from __future__ import annotations');
    expect(clientPy).toContain('def create(self, *,');
    expect(fileOf(surfaces, 'sdk-python', 'pyproject.toml')).toContain('lumen-api-sdk');
  });

  it('MCP manifest maps the operation to a tool with its inputSchema', async () => {
    const { surfaces } = project(await lumenIr());
    const manifest = JSON.parse(fileOf(surfaces, 'mcp', 'tools.json')!);
    const tool = manifest.tools.find((t: { name: string }) => t.name === 'create_project');
    expect(tool).toBeDefined();
    expect(tool.inputSchema.required).toEqual(expect.arrayContaining(['name', 'team_id']));
    expect(fileOf(surfaces, 'mcp', 'server.mjs')).toContain("method === 'tools/call'");
  });

  it('CLI embeds the projects/create command', async () => {
    const cli = fileOf(project(await lumenIr()).surfaces, 'cli', 'cli.mjs')!;
    expect(cli).toContain('const COMMANDS =');
    expect(cli).toContain('"command": "projects"');
    expect(cli).toContain('"verb": "create"');
  });

  it('docs include an index and a per-resource page', async () => {
    const { surfaces } = project(await lumenIr());
    expect(fileOf(surfaces, 'docs', 'README.md')).toContain('# Lumen API');
    expect(fileOf(surfaces, 'docs', 'projects.md')).toContain('## create');
  });

  it('is deterministic — same IR ⇒ byte-identical surfaces', async () => {
    const ir = await lumenIr();
    const a = JSON.stringify(project(ir).surfaces);
    const b = JSON.stringify(project(ir).surfaces);
    expect(a).toBe(b);
  });

  it('respects --only', async () => {
    const { surfaces } = project(await lumenIr(), { only: ['mcp', 'docs'] });
    expect(surfaces.map((s) => s.kind).sort()).toEqual(['docs', 'mcp']);
  });
});

describe('codegen safety (review regressions)', () => {
  it('Python identifiers are keyword / digit / collision safe', async () => {
    const { surfaces } = project(await adversarialIr());
    const client = endingWith(surfaces, 'sdk-python', 'client.py')!;
    expect(client).toContain('class_'); // reserved word escaped
    expect(client).toContain('from_');
    expect(client).toContain('import_');
    expect(client).not.toMatch(/\*,[^)]*\bclass:/); // never a bare reserved-word param
    expect(client).toContain('_2fa_code'); // digit-leading prefixed
    expect(client).toContain('x_trace_id2'); // colliding idents disambiguated
    // wire names are preserved on the request body/headers
    expect(client).toContain('"class": class_');
    expect(client).toContain('"2fa-code": _2fa_code');
  });

  it('Python models dedupe schema names that PascalCase-collide', async () => {
    const models = endingWith(project(await adversarialIr()).surfaces, 'sdk-python', 'models.py')!;
    expect(models).toContain('class UserProfile2');
  });

  it('a digit-leading title yields a valid TS client class identifier', async () => {
    const client = fileOf(project(await adversarialIr()).surfaces, 'sdk-typescript', 'src/client.ts')!;
    expect(client).toMatch(/export class [A-Za-z_][A-Za-z0-9_]*Client \{/);
    expect(client).toContain('Api3DPrintApiClient');
  });

  it('docs and TS stay deterministic on adversarial input', async () => {
    const ir = await adversarialIr();
    expect(JSON.stringify(project(ir).surfaces)).toBe(JSON.stringify(project(ir).surfaces));
  });
});

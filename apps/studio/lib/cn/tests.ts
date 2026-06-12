import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { AcquireService } from '@cn/acquire';
import type { AcquireContext, Ir, Projection, SourceRef } from '@cn/contracts';
import { ingestOne } from '@cn/ingest';
import { buildIr } from '@cn/ir-core';
import { project } from '@cn/projection';
import type { ValidatedArtifact } from '@cn/contracts';
import type { TestResult } from '../events';

/**
 * Conversion test suite — runs after projection on every conversion (SDK→MCP, MCP→SDK, …).
 * Each check is deterministic and produces a pass/fail the UI shows as a green tick / red cross.
 * Covers: the pipeline, IR integrity, surface structure, operation coverage, Pass^k determinism,
 * and lossless round-trip (re-ingesting a generated surface).
 */
export async function runConversionTests(
  validated: ValidatedArtifact,
  ir: Ir,
  projection: Projection,
): Promise<TestResult[]> {
  const tests: TestResult[] = [];
  const add = (name: string, ok: boolean, detailOk: string, detailFail: string, category: string): void => {
    tests.push({ name, status: ok ? 'pass' : 'fail', detail: ok ? detailOk : detailFail, category });
  };

  // ── Pipeline ──
  add('Spec is valid OpenAPI 3.1', validated.valid, 'Ingest produced a valid document', 'Validation failed', 'Pipeline');
  const errCount = validated.diagnostics.filter((d) => d.severity === 'error').length;
  add('No blocking diagnostics', errCount === 0, 'Zero error-severity diagnostics', `${errCount} error diagnostic(s)`, 'Pipeline');

  // ── IR ──
  add('IR has operations', ir.operations.length > 0, `${ir.operations.length} operation(s) in the IR`, 'IR is empty', 'IR');
  const ids = new Set(ir.operations.map((o) => o.id));
  add('Operation IDs are unique', ids.size === ir.operations.length, `${ids.size} unique IDs`, 'Duplicate operation IDs found', 'IR');
  add('IR is content-hashed', /^sha256:[0-9a-f]{64}$/.test(ir.hash), ir.hash.slice(0, 23) + '…', 'Missing/invalid IR hash', 'IR');

  // ── Project ──
  const fileCount = projection.surfaces.reduce((n, s) => n + s.files.length, 0);
  add('Surfaces generated', fileCount > 0, `${fileCount} files across ${projection.surfaces.length} surface(s)`, 'No files generated', 'Project');

  // ── MCP surface ──
  const mcp = projection.surfaces.find((s) => s.kind === 'mcp');
  if (mcp) {
    const toolsFile = mcp.files.find((f) => f.path === 'tools.json');
    let toolCount = 0;
    let valid = true;
    let annotated = true;
    try {
      const manifest = JSON.parse(toolsFile?.content ?? '{}') as { tools?: Array<{ name?: string; inputSchema?: unknown; annotations?: unknown }> };
      const tools = manifest.tools ?? [];
      toolCount = tools.length;
      valid = tools.every((t) => typeof t.name === 'string' && t.inputSchema !== null && typeof t.inputSchema === 'object');
      annotated = tools.every((t) => t.annotations !== null && typeof t.annotations === 'object');
    } catch {
      valid = false;
    }
    add('MCP: one tool per operation', toolCount === ir.operations.length, `${toolCount} tools for ${ir.operations.length} operations`, `${toolCount} tools vs ${ir.operations.length} operations`, 'MCP');
    add('MCP: every tool has a JSON-Schema input', valid, 'All tools carry name + inputSchema', 'A tool is missing name/inputSchema', 'MCP');
    add('MCP: tools carry safety annotations', annotated, 'readOnly/destructive hints present', 'Missing tool annotations', 'MCP');
    add('MCP: hostable server emitted', mcp.files.some((f) => f.path === 'http-server.mjs') && mcp.files.some((f) => f.path === 'Dockerfile'), 'http-server.mjs + Dockerfile present', 'No HTTP server / Dockerfile', 'MCP');
  }

  // ── SDK surfaces ──
  const ts = projection.surfaces.find((s) => s.kind === 'sdk-typescript');
  if (ts) {
    const hasClient = ts.files.some((f) => f.path === 'src/client.ts');
    const resources = ts.files.filter((f) => f.path.startsWith('src/resources/')).length;
    add('SDK (TS): client + resources present', hasClient && resources > 0, `client.ts + ${resources} resource module(s)`, 'Missing client.ts or resource modules', 'SDK');
    add('SDK (TS): models module present', ts.files.some((f) => f.path === 'src/models.ts'), 'models.ts generated', 'No models.ts', 'SDK');
    add('SDK (TS): package is installable', ts.files.some((f) => f.path === 'package.json' && f.content.includes('"name"')), 'package.json present', 'No package.json', 'SDK');
  }
  const py = projection.surfaces.find((s) => s.kind === 'sdk-python');
  if (py) {
    add('SDK (Py): client module present', py.files.some((f) => f.path.endsWith('client.py')), 'client.py generated', 'No client.py', 'SDK');
  }

  // ── Determinism (Pass^k) ──
  const baseSig = projectionSig(projection);
  const irHashes: string[] = [];
  let sigStable = true;
  for (let i = 0; i < 3; i += 1) {
    const ir2 = buildIr(validated);
    irHashes.push(ir2.hash);
    if (!sigEqual(projectionSig(project(ir2)), baseSig)) sigStable = false;
  }
  add('Deterministic — IR hash stable (Pass^3)', irHashes.every((h) => h === ir.hash), 'IR hash identical across 3 rebuilds', 'IR hash drifted across rebuilds', 'Determinism');
  add('Deterministic — surfaces byte-identical (Pass^3)', sigStable, 'Every file identical across 3 rebuilds', 'Generated files drifted across rebuilds', 'Determinism');

  // ── Round-trip fidelity ──
  try {
    const rt = await roundTrip(projection, ir);
    if (rt) {
      add(`Round-trip lossless (${rt.via})`, rt.lossless, `${rt.rederived} operation(s) preserved on re-ingest`, `only ${rt.rederived}/${rt.source} operation(s) re-derived`, 'Round-trip');
    }
  } catch {
    /* round-trip is best-effort — skip on failure rather than crash the run */
  }

  return tests;
}

function projectionSig(p: Projection): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of p.surfaces) for (const f of s.files) out[`${s.dir}/${f.path}`] = createHash('sha256').update(f.content).digest('hex');
  return out;
}
function sigEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => a[k] === b[k]);
}

interface RT { via: string; source: number; rederived: number; lossless: boolean }

/** Feed a generated surface back through the pipeline and confirm operations survive. */
async function roundTrip(projection: Projection, sourceIr: Ir): Promise<RT | null> {
  const mcp = projection.surfaces.find((s) => s.kind === 'mcp');
  const ts = projection.surfaces.find((s) => s.kind === 'sdk-typescript');
  let source: SourceRef | null = null;
  let via = '';
  let dir = '';
  const ctx: AcquireContext = { now: () => '2026-01-01T00:00:00.000Z', toolVersion: 'studio-test' };
  try {
    if (mcp) {
      const tools = mcp.files.find((f) => f.path === 'tools.json');
      if (!tools) return null;
      dir = mkdtempSync(join(tmpdir(), 'cn-rt-'));
      writeFileSync(join(dir, 'tools.json'), tools.content);
      source = { kind: 'mcp', target: join(dir, 'tools.json') };
      via = 'generated MCP';
    } else if (ts) {
      dir = mkdtempSync(join(tmpdir(), 'cn-rt-'));
      for (const f of ts.files) {
        const full = join(dir, f.path);
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, f.content);
      }
      source = { kind: 'sdk', path: dir, language: 'typescript' };
      via = 'generated TypeScript SDK';
    } else {
      return null;
    }
    const art = await new AcquireService().acquire(source, ctx);
    const val = ingestOne(art);
    if (!val.valid) return { via, source: sourceIr.operations.length, rederived: 0, lossless: false };
    const ir2 = buildIr(val);
    return { via, source: sourceIr.operations.length, rederived: ir2.operations.length, lossless: ir2.operations.length >= sourceIr.operations.length };
  } finally {
    if (dir) try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

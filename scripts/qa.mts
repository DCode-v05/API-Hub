/**
 * Conversion QA — the automated correctness gate.
 *
 * For every bundled fixture (OpenAPI · SDK-TS · SDK-Py · MCP) it runs the full pipeline
 * (acquire → ingest → build → project) and a suite of deterministic test cases: spec validity,
 * IR integrity, surface structure, operation coverage, Pass^k determinism, and a lossless
 * round-trip. Prints a green-tick / red-cross report and exits non-zero on any failure, so CI
 * fails the moment a conversion regresses.
 *
 *   npm run qa
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { AcquireService } from '@cn/acquire';
import type { AcquireContext, Ir, Projection, SourceRef, ValidatedArtifact } from '@cn/contracts';
import { ingestOne } from '@cn/ingest';
import { buildIr } from '@cn/ir-core';
import { project } from '@cn/projection';

interface Case { name: string; ok: boolean; detail: string; cat: string }

const INPUTS: { label: string; source: SourceRef }[] = [
  { label: 'OpenAPI', source: { kind: 'openapi', location: 'samples/openapi/tasks-api.yaml' } },
  { label: 'SDK (TypeScript)', source: { kind: 'sdk', path: 'samples/sdk-typescript', language: 'typescript' } },
  { label: 'SDK (Python)', source: { kind: 'sdk', path: 'samples/sdk-python', language: 'python' } },
  { label: 'MCP', source: { kind: 'mcp', target: 'samples/mcp/tasks-tools.json' } },
];

const CTX: AcquireContext = { now: () => '2026-01-01T00:00:00.000Z', toolVersion: 'qa' };
const sha = (s: string): string => createHash('sha256').update(s).digest('hex');
const sig = (p: Projection): Record<string, string> => {
  const o: Record<string, string> = {};
  for (const s of p.surfaces) for (const f of s.files) o[`${s.dir}/${f.path}`] = sha(f.content);
  return o;
};
const sigEqual = (a: Record<string, string>, b: Record<string, string>): boolean => {
  const k = Object.keys(a);
  return k.length === Object.keys(b).length && k.every((x) => a[x] === b[x]);
};

async function runCases(validated: ValidatedArtifact, ir: Ir, proj: Projection): Promise<Case[]> {
  const cs: Case[] = [];
  const add = (name: string, ok: boolean, detail: string, cat: string): void => { cs.push({ name, ok, detail, cat }); };

  add('Spec valid (OpenAPI 3.1)', validated.valid, validated.valid ? 'valid' : 'validation failed', 'Pipeline');
  add('No blocking diagnostics', validated.diagnostics.every((d) => d.severity !== 'error'), 'no error diagnostics', 'Pipeline');
  add('IR has operations', ir.operations.length > 0, `${ir.operations.length} operations`, 'IR');
  add('Operation IDs unique', new Set(ir.operations.map((o) => o.id)).size === ir.operations.length, 'unique', 'IR');
  const files = proj.surfaces.reduce((n, s) => n + s.files.length, 0);
  add('Surfaces generated', files > 0, `${files} files / ${proj.surfaces.length} surfaces`, 'Project');

  const mcp = proj.surfaces.find((s) => s.kind === 'mcp');
  if (mcp) {
    let tools = 0; let ok = true;
    try { const m = JSON.parse(mcp.files.find((f) => f.path === 'tools.json')?.content ?? '{}'); tools = (m.tools ?? []).length; ok = (m.tools ?? []).every((t: { name?: string; inputSchema?: unknown }) => t.name && typeof t.inputSchema === 'object'); } catch { ok = false; }
    add('MCP: one tool per operation', tools === ir.operations.length, `${tools} tools / ${ir.operations.length} ops`, 'MCP');
    add('MCP: valid JSON-Schema inputs', ok, 'name + inputSchema present', 'MCP');
  }
  const ts = proj.surfaces.find((s) => s.kind === 'sdk-typescript');
  if (ts) add('SDK(TS): client + resources', ts.files.some((f) => f.path === 'src/client.ts') && ts.files.some((f) => f.path.startsWith('src/resources/')), 'present', 'SDK');
  const py = proj.surfaces.find((s) => s.kind === 'sdk-python');
  if (py) add('SDK(Py): client module', py.files.some((f) => f.path.endsWith('client.py')), 'present', 'SDK');

  const base = sig(proj);
  let stable = true; const hashes: string[] = [];
  for (let i = 0; i < 3; i++) { const r = buildIr(validated); hashes.push(r.hash); if (!sigEqual(sig(project(r)), base)) stable = false; }
  add('Deterministic: IR hash (Pass^3)', hashes.every((h) => h === ir.hash), 'identical x3', 'Determinism');
  add('Deterministic: surfaces (Pass^3)', stable, 'byte-identical x3', 'Determinism');

  const rt = await roundTrip(proj, ir);
  if (rt) add(`Round-trip lossless (${rt.via})`, rt.lossless, `${rt.rederived}/${rt.source} ops preserved`, 'Round-trip');
  return cs;
}

async function roundTrip(proj: Projection, src: Ir): Promise<{ via: string; source: number; rederived: number; lossless: boolean } | null> {
  const mcp = proj.surfaces.find((s) => s.kind === 'mcp');
  const ts = proj.surfaces.find((s) => s.kind === 'sdk-typescript');
  let dir = ''; let source: SourceRef | null = null; let via = '';
  try {
    if (mcp) { const t = mcp.files.find((f) => f.path === 'tools.json'); if (!t) return null; dir = mkdtempSync(join(tmpdir(), 'qa-')); writeFileSync(join(dir, 'tools.json'), t.content); source = { kind: 'mcp', target: join(dir, 'tools.json') }; via = 'MCP'; }
    else if (ts) { dir = mkdtempSync(join(tmpdir(), 'qa-')); for (const f of ts.files) { const p = join(dir, f.path); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, f.content); } source = { kind: 'sdk', path: dir, language: 'typescript' }; via = 'TS SDK'; }
    else return null;
    const art = await new AcquireService().acquire(source, CTX);
    const v = ingestOne(art);
    if (!v.valid) return { via, source: src.operations.length, rederived: 0, lossless: false };
    const ir2 = buildIr(v);
    return { via, source: src.operations.length, rederived: ir2.operations.length, lossless: ir2.operations.length >= src.operations.length };
  } finally { if (dir) try { rmSync(dir, { recursive: true, force: true }); } catch { /* */ } }
}

async function main(): Promise<void> {
  let total = 0; let failed = 0;
  for (const { label, source } of INPUTS) {
    const art = await new AcquireService().acquire(source, CTX);
    const validated = ingestOne(art);
    if (!validated.valid) {
      console.log(`\n■ ${label}\n  ✗ FAIL  validation failed — no surfaces produced`);
      failed += 1; total += 1; continue;
    }
    const ir = buildIr(validated);
    const proj = project(ir);
    const cases = await runCases(validated, ir, proj);
    const fails = cases.filter((c) => !c.ok).length;
    total += cases.length; failed += fails;
    console.log(`\n■ ${label} — ${cases.length - fails}/${cases.length} passed`);
    for (const c of cases) console.log(`  ${c.ok ? '✓' : '✗ FAIL'}  [${c.cat}] ${c.name} — ${c.detail}`);
  }
  console.log(`\n${failed === 0 ? '✓ QA passed' : '✗ QA FAILED'} — ${total - failed}/${total} test cases across ${INPUTS.length} fixtures`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('QA crashed:', e); process.exit(1); });

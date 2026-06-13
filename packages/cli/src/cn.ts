import { existsSync, readFileSync, statSync } from 'node:fs';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { AcquireService, describeSource } from '@cn/acquire';
import type {
  AcquireContext,
  CanonicalArtifact,
  GithubSource,
  McpSource,
  OpenApiSource,
  SdkSource,
  SourceRef,
} from '@cn/acquire';
import { ingestOne } from '@cn/ingest';
import type { ValidatedArtifact } from '@cn/ingest';
import { buildIr, IR_VERSION } from '@cn/ir-core';
import type { Ir } from '@cn/ir-core';
import { project } from '@cn/projection';
import type { Diagnostic, Projection, SurfaceKind } from '@cn/contracts';
import { countBySeverity, hasErrors } from '@cn/contracts';
import {
  compareEntry, projectionSig, readLock, sigEqual, shortHash, writeLock, LOCK_VERSION,
  type LockEntry, type LockFile,
} from './lock';

const SURFACE_KINDS: SurfaceKind[] = ['sdk-typescript', 'sdk-python', 'mcp', 'cli', 'docs'];

export const VERSION = '0.1.0';

export async function runCli(argv: string[]): Promise<number> {
  const command = argv[0];
  if (command === undefined || command === 'help' || command === '-h' || command === '--help') {
    printHelp();
    return 0;
  }
  if (command === 'version' || command === '--version' || command === '-v') {
    process.stdout.write(`cn ${VERSION}\n`);
    return 0;
  }
  switch (command) {
    case 'run':
      return runStage(argv.slice(1), 'run');
    case 'acquire':
      return runStage(argv.slice(1), 'acquire');
    case 'ingest':
      return runStage(argv.slice(1), 'ingest');
    case 'build':
      return runStage(argv.slice(1), 'build');
    case 'project':
      return runStage(argv.slice(1), 'project');
    case 'verify':
      return runVerify(argv.slice(1));
    default:
      process.stderr.write(`cn: unknown command "${command}"\n\n`);
      printHelp();
      return 2;
  }
}

type Stage = 'run' | 'acquire' | 'ingest' | 'build' | 'project' | 'verify';

const INPUT_OPTIONS = {
  github: { type: 'string', multiple: true },
  pat: { type: 'string' },
  ref: { type: 'string' },
  spec: { type: 'string' },
  openapi: { type: 'string', multiple: true },
  sdk: { type: 'string', multiple: true },
  lang: { type: 'string' },
  mcp: { type: 'string', multiple: true },
  command: { type: 'boolean' },
  out: { type: 'string', short: 'o' },
  only: { type: 'string' },
  ir: { type: 'boolean' },
  quiet: { type: 'boolean' },
  update: { type: 'boolean' },
  k: { type: 'string' },
  lock: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
} as const;

type RawValues = Record<string, string | boolean | string[] | undefined>;

interface Input {
  values: RawValues;
  out: string | undefined;
  quiet: boolean;
  only: SurfaceKind[] | undefined;
  ir: boolean;
}

type ParseOutcome = { kind: 'run'; input: Input } | { kind: 'help' } | { kind: 'error'; code: number };

function parseInput(args: string[], stage: Stage): ParseOutcome {
  let values: RawValues;
  try {
    ({ values } = parseArgs({ args, options: INPUT_OPTIONS, allowPositionals: false, strict: true }));
  } catch (e) {
    process.stderr.write(`cn ${stage}: ${errMessage(e)}\n\n`);
    printStageHelp(stage);
    return { kind: 'error', code: 2 };
  }
  if (values['help']) {
    printStageHelp(stage);
    return { kind: 'help' };
  }

  let only: SurfaceKind[] | undefined;
  if (typeof values['only'] === 'string') {
    const requested = values['only'].split(',').map((s) => s.trim()).filter(Boolean);
    const invalid = requested.filter((r) => !SURFACE_KINDS.includes(r as SurfaceKind));
    if (invalid.length > 0) {
      process.stderr.write(`cn ${stage}: invalid --only value(s): ${invalid.join(', ')} (valid: ${SURFACE_KINDS.join(', ')})\n`);
      return { kind: 'error', code: 2 };
    }
    if (requested.length === 0) {
      process.stderr.write(`cn ${stage}: --only requires at least one surface (${SURFACE_KINDS.join(', ')})\n`);
      return { kind: 'error', code: 2 };
    }
    only = requested as SurfaceKind[];
  }

  return {
    kind: 'run',
    input: {
      values,
      out: typeof values['out'] === 'string' ? values['out'] : undefined,
      quiet: values['quiet'] === true,
      only,
      ir: values['ir'] === true,
    },
  };
}

async function runStage(args: string[], stage: Stage): Promise<number> {
  const parsed = parseInput(args, stage);
  if (parsed.kind !== 'run') return parsed.kind === 'help' ? 0 : parsed.code;
  const { values, out, quiet, only, ir: collectIr } = parsed.input;
  const ctx = makeContext(quiet);

  // `cn run` is the all-in-one command: one OR MANY inputs from flags, or — with no input flags —
  // every input listed in cn.config.json.
  if (stage === 'run') {
    let sources: SourceRef[];
    let runOut = out;
    let runOnly = only;

    if (hasInputFlags(values)) {
      const built = buildSources(values);
      if ('error' in built) {
        process.stderr.write(`cn run: ${built.error}\n\n`);
        printStageHelp('run');
        return 2;
      }
      sources = built.sources;
    } else {
      const cfg = loadInputConfig();
      if (cfg === null) {
        process.stderr.write(
          `cn run: no input given. Pass --github/--openapi/--sdk/--mcp, or create ${CONFIG_FILE} with an "inputs" list.\n\n`,
        );
        printStageHelp('run');
        return 2;
      }
      if ('error' in cfg) {
        process.stderr.write(`cn run: ${cfg.error}\n`);
        return 2;
      }
      if (cfg.sources.length === 0) {
        process.stderr.write(`cn run: ${CONFIG_FILE} lists no inputs.\n`);
        return 2;
      }
      sources = cfg.sources;
      runOut = out ?? cfg.out;
      runOnly = only ?? cfg.only;
      if (!quiet) process.stderr.write(`· using ${sources.length} input(s) from ${CONFIG_FILE}\n`);
    }

    const baseOut = runOut ?? 'out';
    return runAll(sources, baseOut, quiet, runOnly, ctx, collectIr ? join(baseOut, 'ir') : undefined);
  }

  // Single-input stages.
  const builtSource = buildSource(values);
  if ('error' in builtSource) {
    process.stderr.write(`cn ${stage}: ${builtSource.error}\n\n`);
    printStageHelp(stage);
    return 2;
  }

  let artifact: CanonicalArtifact;
  try {
    artifact = await new AcquireService().acquire(builtSource.source, ctx);
  } catch (e) {
    process.stderr.write(`cn ${stage}: ${errMessage(e)}\n`);
    return 1;
  }

  if (stage === 'acquire') {
    await emit(artifact, out, 'artifact.json');
    if (!quiet) reportArtifact(artifact);
    return hasErrors(artifact.diagnostics) ? 1 : 0;
  }

  const validated = ingestOne(artifact);

  if (stage === 'ingest') {
    await emit(validated, out, 'validated.json');
    if (!quiet) reportValidated(validated);
    return validated.valid ? 0 : 1;
  }

  // build / project: fail loud rather than proceed from an invalid spec.
  if (!validated.valid) {
    if (!quiet) reportValidated(validated);
    // Even under --quiet, surface WHY it failed (the blocking errors) on the failure path.
    else writeDiagnostics(validated.diagnostics.filter((d) => d.severity === 'error'));
    process.stderr.write(`\n✗ not running ${stage} — validation failed (bad specs fail loud)\n`);
    return 1;
  }
  const ir = buildIr(validated);

  if (stage === 'build') {
    await emit(ir, out, 'ir.json');
    if (!quiet) reportIr(ir);
    return 0;
  }

  // stage === 'project': render the IR into the four surfaces and write the tree.
  const outDir = out ?? 'surfaces';
  const projection = project(ir, only ? { only } : {});
  await writeSurfaces(projection, outDir);
  if (!quiet) reportProjection(projection, outDir);
  return 0;
}

async function writeSurfaces(projection: Projection, outDir: string): Promise<void> {
  for (const surface of projection.surfaces) {
    for (const file of surface.files) {
      const full = join(outDir, surface.dir, file.path);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, file.content, 'utf8');
      if (file.executable) {
        try {
          await chmod(full, 0o755);
        } catch {
          /* not POSIX (e.g. Windows) — ignore */
        }
      }
    }
  }
}

/**
 * `cn verify` — the determinism gate. For each input it rebuilds the IR + surfaces K times and:
 *   1) asserts all K rebuilds are byte-identical (Pass^k reproducibility), then
 *   2) compares against cn.lock (the committed golden) — failing on any drift.
 * `--update` (re)writes the lock from the current output. Designed to run green in CI.
 */
async function runVerify(args: string[]): Promise<number> {
  const parsed = parseInput(args, 'verify');
  if (parsed.kind !== 'run') return parsed.kind === 'help' ? 0 : parsed.code;
  const { values, only, quiet } = parsed.input;
  const ctx = makeContext(quiet);

  const update = values['update'] === true;
  const kRaw = typeof values['k'] === 'string' ? Number.parseInt(values['k'], 10) : NaN;
  const K = Number.isFinite(kRaw) && kRaw >= 2 ? kRaw : 3;
  const lockPath = resolve(process.cwd(), typeof values['lock'] === 'string' ? values['lock'] : 'cn.lock');
  const rel = (p: string): string => relative(process.cwd(), p) || p;

  // Inputs from flags, else from cn.config.json (like `cn run`).
  let sources: SourceRef[];
  let useOnly = only;
  if (hasInputFlags(values)) {
    const built = buildSources(values);
    if ('error' in built) { process.stderr.write(`cn verify: ${built.error}\n`); return 2; }
    sources = built.sources;
  } else {
    const cfg = loadInputConfig();
    if (cfg === null) {
      process.stderr.write(`cn verify: no input. Pass --github/--openapi/--sdk/--mcp, or add ${CONFIG_FILE}.\n`);
      return 2;
    }
    if ('error' in cfg) { process.stderr.write(`cn verify: ${cfg.error}\n`); return 2; }
    sources = cfg.sources;
    useOnly = only ?? cfg.only;
  }
  if (sources.length === 0) { process.stderr.write('cn verify: no inputs.\n'); return 2; }

  const existing = readLock(lockPath);
  if (!existing && !update) {
    process.stderr.write(`cn verify: no lock at ${rel(lockPath)} — create it first:\n  cn verify <inputs> --update\n`);
    return 1;
  }

  process.stderr.write(`cn verify — ${sources.length} input(s), Pass^${K}${update ? ' (updating lock)' : ` vs ${rel(lockPath)}`}\n`);
  const service = new AcquireService();
  const used = new Set<string>();
  const newEntries: Record<string, LockEntry> = {};
  let failures = 0;
  let drift = 0;

  for (const source of sources) {
    let label = labelFor(source);
    if (used.has(label)) { let n = 2; while (used.has(`${label}-${n}`)) n += 1; label = `${label}-${n}`; }
    used.add(label);

    let artifact: CanonicalArtifact;
    try {
      artifact = await service.acquire(source, ctx);
    } catch (e) {
      process.stderr.write(`  ✗ ${label}: acquire failed — ${errMessage(e)}\n`);
      failures += 1; continue;
    }
    const validated = ingestOne(artifact);
    if (!validated.valid) {
      process.stderr.write(`  ✗ ${label}: validation failed — cannot verify an invalid spec\n`);
      failures += 1; continue;
    }

    // Rebuild the deterministic core (IR + surfaces) K times.
    const irHashes: string[] = [];
    const sigs: Record<string, string>[] = [];
    let opCount = 0;
    for (let i = 0; i < K; i += 1) {
      const ir = buildIr(validated);
      opCount = ir.operations.length;
      irHashes.push(ir.hash);
      sigs.push(projectionSig(project(ir, useOnly ? { only: useOnly } : {})));
    }
    const irStable = irHashes.every((h) => h === irHashes[0]);
    const sigStable = sigs.every((s) => sigEqual(s, sigs[0]!));
    const entry: LockEntry = { irHash: irHashes[0]!, surfaces: sigs[0]! };
    const fileCount = Object.keys(entry.surfaces).length;

    if (!irStable || !sigStable) {
      process.stderr.write(`  ✗ ${label}: NON-DETERMINISTIC — ${K} rebuilds differ\n`);
      for (const f of driftingFiles(sigs)) process.stderr.write(`      unstable: ${f}\n`);
      failures += 1; continue;
    }

    if (update) {
      newEntries[label] = entry;
      process.stderr.write(`  · ${label}: locked — ${opCount} ops, ${fileCount} files, ${shortHash(entry.irHash)}\n`);
      continue;
    }

    const expected = existing!.entries[label];
    if (!expected) {
      process.stderr.write(`  ✗ ${label}: not in lock (new) — run --update to record it\n`);
      drift += 1; continue;
    }
    const diffs = compareEntry(expected, entry);
    if (diffs.length === 0) {
      process.stderr.write(`  ✓ ${label}: matches lock · Pass^${K} · ${fileCount} files\n`);
    } else {
      process.stderr.write(`  ✗ ${label}: DRIFT from lock — ${diffs.length} change(s)\n`);
      for (const d of diffs.slice(0, 12)) process.stderr.write(`      ${d}\n`);
      if (diffs.length > 12) process.stderr.write(`      … and ${diffs.length - 12} more\n`);
      drift += 1;
    }
  }

  if (update) {
    const merged: LockFile = existing ?? { lockVersion: LOCK_VERSION, generator: `${IR_VERSION} + projection`, entries: {} };
    merged.lockVersion = LOCK_VERSION;
    merged.generator = `${IR_VERSION} + projection`;
    merged.entries = { ...merged.entries, ...newEntries };
    writeLock(lockPath, merged);
    process.stderr.write(`\n${failures ? '✗' : '✓'} wrote ${Object.keys(newEntries).length} entr${Object.keys(newEntries).length === 1 ? 'y' : 'ies'} → ${rel(lockPath)} (${Object.keys(merged.entries).length} total)\n`);
    return failures > 0 ? 1 : 0;
  }

  const total = used.size;
  if (failures === 0 && drift === 0) {
    process.stderr.write(`\n✓ verify passed — ${total} input(s), Pass^${K}, all match ${rel(lockPath)}\n`);
    return 0;
  }
  process.stderr.write(`\n✗ verify FAILED — ${failures} error(s), ${drift} drift of ${total} input(s)\n`);
  return 1;
}

/** Files whose hash isn't constant across the K rebuilds (for non-determinism diagnostics). */
function driftingFiles(sigs: Record<string, string>[]): string[] {
  const out: string[] = [];
  const base = sigs[0] ?? {};
  for (const file of Object.keys(base)) {
    if (sigs.some((s) => s[file] !== base[file])) out.push(file);
  }
  return out.slice(0, 12);
}

function reportProjection(projection: Projection, outDir: string): void {
  const total = projection.surfaces.reduce((n, s) => n + s.files.length, 0);
  process.stderr.write(`\n✓ projected ${projection.surfaces.length} surface(s), ${total} file(s) → ${outDir}/\n`);
  for (const s of projection.surfaces) {
    process.stderr.write(`  · ${s.kind.padEnd(15)} ${s.dir}/  (${s.files.length} files)\n`);
  }
  writeDiagnostics(projection.diagnostics);
}

/**
 * The all-in-one pipeline: input → artifact + validated + IR + surfaces, all written to outDir.
 * When `irCopyPath` is set (--ir), the IR is additionally copied there (e.g. ir/<label>.json).
 */
async function runFull(
  artifact: CanonicalArtifact,
  outDir: string,
  quiet: boolean,
  only: SurfaceKind[] | undefined,
  irCopyPath?: string,
): Promise<number> {
  await writeJson(outDir, 'artifact.json', artifact);
  const validated = ingestOne(artifact);
  await writeJson(outDir, 'validated.json', validated);

  if (!validated.valid) {
    if (!quiet) {
      reportValidated(validated);
      process.stderr.write(
        `\n✗ stopped after ingest — validation failed (bad specs fail loud).\n` +
          `  wrote ${outDir}/artifact.json and ${outDir}/validated.json (no IR/surfaces from an invalid spec)\n`,
      );
    } else {
      writeDiagnostics(validated.diagnostics.filter((d) => d.severity === 'error'));
    }
    return 1;
  }

  const ir = buildIr(validated);
  await writeJson(outDir, 'ir.json', ir);
  if (irCopyPath) {
    await mkdir(dirname(irCopyPath), { recursive: true });
    await writeFile(irCopyPath, JSON.stringify(ir, null, 2) + '\n', 'utf8');
  }
  const projection = project(ir, only ? { only } : {});
  await writeSurfaces(projection, join(outDir, 'surfaces'));

  if (!quiet) reportRun(artifact, validated, ir, projection, outDir, irCopyPath);
  return 0;
}

/**
 * `cn run` over one or more inputs. A single input writes flat to `baseOut/`; multiple inputs each
 * write to `baseOut/<label>/`, with a final tally. Acquire failures don't abort the others.
 */
async function runAll(
  sources: SourceRef[],
  baseOut: string,
  quiet: boolean,
  only: SurfaceKind[] | undefined,
  ctx: AcquireContext,
  irDir: string | undefined,
): Promise<number> {
  const service = new AcquireService();
  const irPath = (label: string): string | undefined => (irDir ? join(irDir, `${label}.json`) : undefined);

  if (sources.length === 1) {
    let artifact: CanonicalArtifact;
    try {
      artifact = await service.acquire(sources[0]!, ctx);
    } catch (e) {
      process.stderr.write(`cn run: ${errMessage(e)}\n`);
      return 1;
    }
    return runFull(artifact, baseOut, quiet, only, irPath(labelFor(sources[0]!)));
  }

  const used = new Set<string>();
  const results: { label: string; ok: boolean }[] = [];
  for (const source of sources) {
    let label = labelFor(source);
    if (used.has(label)) {
      let n = 2;
      while (used.has(`${label}-${n}`)) n += 1;
      label = `${label}-${n}`;
    }
    used.add(label);

    if (!quiet) process.stderr.write(`\n── ${label}  (${describeSource(source)}) ──\n`);
    let artifact: CanonicalArtifact;
    try {
      artifact = await service.acquire(source, ctx);
    } catch (e) {
      process.stderr.write(`  ✗ ${label}: acquire failed — ${errMessage(e)}\n`);
      results.push({ label, ok: false });
      continue;
    }
    const code = await runFull(artifact, join(baseOut, label), quiet, only, irPath(label));
    results.push({ label, ok: code === 0 });
  }

  const ok = results.filter((r) => r.ok).length;
  process.stderr.write(
    `\n═══ ran ${results.length} inputs → ${baseOut}/  (${ok} ok, ${results.length - ok} failed) ═══\n`,
  );
  for (const r of results) process.stderr.write(`  ${r.ok ? '✓' : '✗'} ${baseOut}/${r.label}/\n`);
  if (irDir) process.stderr.write(`  IR copies → ${irDir}/<label>.json\n`);
  return results.every((r) => r.ok) ? 0 : 1;
}

/** A short, unique-ish directory label for an input, e.g. github-test, openapi-tasks-api. */
function labelFor(source: SourceRef): string {
  let part = labelSlug(descriptivePart(source));
  if (part.startsWith(`${source.kind}-`)) part = part.slice(source.kind.length + 1);
  return part ? `${source.kind}-${part}` : source.kind;
}

function descriptivePart(source: SourceRef): string {
  switch (source.kind) {
    case 'github':
      return source.repo.split('/').pop() ?? source.repo;
    case 'openapi':
      return baseNoExt(source.location);
    case 'sdk':
      return baseNoExt(source.path);
    case 'mcp':
      return baseNoExt(source.target);
  }
}

function baseNoExt(p: string): string {
  const base = p.split(/[\\/]/).pop() ?? p;
  return base.replace(/\.[^.]+$/, '');
}

function labelSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'input';
}

async function writeJson(outDir: string, name: string, value: unknown): Promise<void> {
  const file = join(outDir, name);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function reportRun(
  artifact: CanonicalArtifact,
  validated: ValidatedArtifact,
  ir: Ir,
  projection: Projection,
  outDir: string,
  irCopyPath?: string,
): void {
  const pin = artifact.provenance.contentHash.replace('sha256:', '').slice(0, 12);
  const files = projection.surfaces.reduce((n, s) => n + s.files.length, 0);
  const proposals = validated.proposals.length;
  process.stderr.write(
    `\n✓ run complete → ${outDir}/\n` +
      `  acquire   ${artifact.type} (${artifact.provenance.trust}) · pin sha256:${pin}   → artifact.json\n` +
      `  ingest    valid · ${proposals} repair proposal${proposals === 1 ? '' : 's'}   → validated.json\n` +
      `  build     IR ${ir.irVersion} · ${ir.operations.length} operation${ir.operations.length === 1 ? '' : 's'} · ${ir.hash.slice(0, 19)}…   → ir.json\n` +
      `  project   ${projection.surfaces.length} surfaces · ${files} files   → surfaces/\n` +
      (irCopyPath ? `  ir copy   IR also stored          → ${irCopyPath}\n` : ''),
  );
  const allDiagnostics = [...validated.diagnostics, ...projection.diagnostics];
  if (allDiagnostics.length > 0) {
    const c = countBySeverity(allDiagnostics);
    process.stderr.write(`  (${c.error} error, ${c.warning} warning, ${c.note} note across stages)\n`);
  }
}

type BuildResult = { source: SourceRef } | { error: string };

function asArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  if (typeof v === 'string') return [v];
  return [];
}

/** Collect every input flag (each repeatable) into a list of sources — used by `cn run`. */
function buildSources(v: RawValues): { sources: SourceRef[] } | { error: string } {
  const sources: SourceRef[] = [];
  const pat = (typeof v['pat'] === 'string' ? v['pat'] : undefined) ?? envPat();
  const ref = typeof v['ref'] === 'string' ? v['ref'] : undefined;
  const spec = typeof v['spec'] === 'string' ? v['spec'] : undefined;
  const lang = typeof v['lang'] === 'string' ? v['lang'] : undefined;
  const command = v['command'] === true;

  for (const repo of asArray(v['github'])) {
    if (!pat) return { error: 'github source needs a PAT: pass --pat or set CN_GITHUB_PAT / GITHUB_TOKEN' };
    const source: GithubSource = { kind: 'github', repo, pat };
    if (ref) source.ref = ref;
    if (spec) source.spec = spec;
    sources.push(source);
  }
  for (const location of asArray(v['openapi'])) {
    const source: OpenApiSource = { kind: 'openapi', location };
    sources.push(source);
  }
  for (const path of asArray(v['sdk'])) {
    const source: SdkSource = { kind: 'sdk', path };
    if (lang !== undefined) {
      if (lang !== 'typescript' && lang !== 'python') {
        return { error: `--lang must be "typescript" or "python", got "${lang}"` };
      }
      source.language = lang;
    }
    sources.push(source);
  }
  for (const target of asArray(v['mcp'])) {
    const source: McpSource = { kind: 'mcp', target };
    if (command) source.command = true;
    sources.push(source);
  }

  if (sources.length === 0) {
    return { error: 'choose at least one input: --github, --openapi, --sdk, or --mcp' };
  }
  return { sources };
}

/** Single-input stages (acquire/ingest/build/project) require exactly one source. */
function buildSource(v: RawValues): BuildResult {
  const built = buildSources(v);
  if ('error' in built) return built;
  if (built.sources.length !== 1) {
    return { error: `this command takes exactly one input (got ${built.sources.length}); use "cn run" for several` };
  }
  return { source: built.sources[0]! };
}

function hasInputFlags(v: RawValues): boolean {
  return (
    asArray(v['github']).length > 0 ||
    asArray(v['openapi']).length > 0 ||
    asArray(v['sdk']).length > 0 ||
    asArray(v['mcp']).length > 0
  );
}

const CONFIG_FILE = 'cn.config.json';

interface InputConfig {
  sources: SourceRef[];
  out?: string;
  only?: SurfaceKind[];
}

/** Load inputs from cn.config.json in the cwd. null = no file (so `cn run` with no flags can use it). */
function loadInputConfig(): InputConfig | { error: string } | null {
  const path = resolve(process.cwd(), CONFIG_FILE);
  if (!existsSync(path)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    return { error: `${CONFIG_FILE}: invalid JSON — ${errMessage(e)}` };
  }
  if (!raw || typeof raw !== 'object') return { error: `${CONFIG_FILE}: expected a JSON object` };
  const cfg = raw as Record<string, unknown>;
  const list = Array.isArray(cfg['inputs']) ? cfg['inputs'] : [];
  const dir = dirname(path);

  const sources: SourceRef[] = [];
  for (const entry of list) {
    const built = sourceFromConfig(entry, dir);
    if ('error' in built) return { error: `${CONFIG_FILE}: ${built.error}` };
    sources.push(built.source);
  }

  const result: InputConfig = { sources };
  if (typeof cfg['out'] === 'string') result.out = cfg['out'];
  const only = coerceOnly(cfg['only']);
  if (only) result.only = only;
  return result;
}

/** Turn one cn.config.json input entry into a SourceRef (paths resolved against the config dir). */
function sourceFromConfig(entry: unknown, dir: string): { source: SourceRef } | { error: string } {
  if (!entry || typeof entry !== 'object') return { error: 'each input must be an object' };
  const e = entry as Record<string, unknown>;
  const localPath = (p: string): string => (/^https?:\/\//i.test(p) ? p : resolve(dir, p));

  if (typeof e['github'] === 'string') {
    const pat = (typeof e['pat'] === 'string' ? e['pat'] : undefined) ?? envPat();
    if (!pat) return { error: `github input "${e['github']}" needs a PAT (set CN_GITHUB_PAT / GITHUB_TOKEN)` };
    const s: GithubSource = { kind: 'github', repo: e['github'], pat };
    if (typeof e['ref'] === 'string') s.ref = e['ref'];
    if (typeof e['spec'] === 'string') s.spec = e['spec'];
    return { source: s };
  }
  if (typeof e['openapi'] === 'string') {
    return { source: { kind: 'openapi', location: localPath(e['openapi']) } };
  }
  if (typeof e['sdk'] === 'string') {
    const s: SdkSource = { kind: 'sdk', path: resolve(dir, e['sdk']) };
    if (e['lang'] === 'typescript' || e['lang'] === 'python') s.language = e['lang'];
    return { source: s };
  }
  if (typeof e['mcp'] === 'string') {
    const command = e['command'] === true;
    const s: McpSource = { kind: 'mcp', target: command ? e['mcp'] : localPath(e['mcp']) };
    if (command) s.command = true;
    return { source: s };
  }
  return { error: `input needs one of github/openapi/sdk/mcp: ${JSON.stringify(entry)}` };
}

function coerceOnly(value: unknown): SurfaceKind[] | undefined {
  const items = typeof value === 'string' ? value.split(',') : Array.isArray(value) ? value : [];
  const requested = items
    .map((s) => String(s).trim())
    .filter(Boolean)
    .filter((r): r is SurfaceKind => SURFACE_KINDS.includes(r as SurfaceKind));
  return requested.length > 0 ? requested : undefined;
}

function envPat(): string | undefined {
  return process.env['CN_GITHUB_PAT'] ?? process.env['GITHUB_TOKEN'] ?? process.env['GH_TOKEN'];
}

function makeContext(quiet: boolean): AcquireContext {
  return {
    now: () => new Date().toISOString(),
    toolVersion: VERSION,
    log: quiet ? undefined : (m) => process.stderr.write(`· ${m}\n`),
  };
}

async function emit(value: unknown, out: string | undefined, defaultName: string): Promise<void> {
  const json = JSON.stringify(value, null, 2);
  if (!out) {
    process.stdout.write(json + '\n');
    return;
  }
  const isDir = (existsSync(out) && statSync(out).isDirectory()) || /[\\/]$/.test(out);
  const file = isDir ? join(out, defaultName) : out;
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, json + '\n', 'utf8');
  process.stderr.write(`→ wrote ${file}\n`);
}

// ---------- summaries (stderr) ----------

const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);

function countOperations(paths: Record<string, unknown> | undefined): number {
  let n = 0;
  for (const item of Object.values(paths ?? {})) {
    if (item && typeof item === 'object') {
      for (const key of Object.keys(item as Record<string, unknown>)) {
        if (HTTP_METHODS.has(key.toLowerCase())) n += 1;
      }
    }
  }
  return n;
}

function writeDiagnostics(diagnostics: Diagnostic[]): void {
  for (const d of diagnostics) {
    const mark = d.severity === 'error' ? 'ERROR' : d.severity === 'warning' ? 'warn' : 'note';
    process.stderr.write(`  [${mark}] ${d.code}: ${d.message}\n`);
  }
}

function writeCounts(diagnostics: Diagnostic[]): void {
  if (diagnostics.length === 0) return;
  const c = countBySeverity(diagnostics);
  process.stderr.write(`  (${c.error} error, ${c.warning} warning, ${c.note} note)\n`);
}

function reportArtifact(artifact: CanonicalArtifact): void {
  const ops = countOperations(artifact.document.paths);
  const shortHash = artifact.provenance.contentHash.replace('sha256:', '').slice(0, 12);
  const shaPart = artifact.provenance.sha ? ` sha=${artifact.provenance.sha.slice(0, 7)}` : '';
  process.stderr.write(
    `\n${hasErrors(artifact.diagnostics) ? '✗' : '✓'} acquired ${artifact.type} ` +
      `(${artifact.provenance.trust}) from ${artifact.provenance.origin}\n` +
      `  ${ops} operation${ops === 1 ? '' : 's'} · pin sha256:${shortHash}${shaPart}\n`,
  );
  writeDiagnostics(artifact.diagnostics);
  writeCounts(artifact.diagnostics);
}

function reportValidated(validated: ValidatedArtifact): void {
  const ops = countOperations(validated.document.paths);
  process.stderr.write(
    `\n${validated.valid ? '✓' : '✗'} ingested ${validated.type} (${validated.provenance.trust}) — ` +
      `${ops} operation${ops === 1 ? '' : 's'}, ${validated.proposals.length} repair proposal${validated.proposals.length === 1 ? '' : 's'}\n`,
  );
  writeDiagnostics(validated.diagnostics);
  for (const p of validated.proposals) {
    const mark = p.severity === 'warning' ? 'warn' : 'note';
    process.stderr.write(`  [propose ${mark}] ${p.code}: ${p.suggestion}\n`);
  }
  writeCounts(validated.diagnostics);
}

function reportIr(ir: Ir): void {
  process.stderr.write(
    `\n✓ built IR ${ir.irVersion} from ${ir.provenance.sourceKind} — ` +
      `${ir.operations.length} operation${ir.operations.length === 1 ? '' : 's'}\n  ${ir.hash}\n`,
  );
  for (const op of ir.operations) {
    process.stderr.write(`  · ${op.id}  ${op.method} ${op.path}  [auth: ${op.auth}]\n`);
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---------- help ----------

function printHelp(): void {
  process.stdout.write(`cn ${VERSION} — Connector Network CLI

USAGE
  cn <command> <input> [options]
  cn help | version

COMMANDS
  run        Everything at once: acquire → ingest → build → project. Takes ONE OR MANY inputs
             (input flags are repeatable); each runs the full pipeline → ./out (or ./out/<label>/).
  acquire    Fetch + pin a source into one origin-blind canonical artifact.
  ingest     Acquire, then Adapt → Assemble → Validate + Repair → a validated artifact.
  build      Acquire + ingest, then build the normalized, content-hashed IR (fails loud if invalid).
  project    Build the IR, then render it into surfaces (SDK · MCP · CLI · docs) under ./surfaces.
  verify     Determinism gate: rebuild IR + surfaces K× (must be byte-identical) and check against
             cn.lock. --update writes the lock. Exit 1 on drift — wire it into CI.

Every command takes the same input (choose one): --github | --openapi | --sdk | --mcp.
Run "cn <command> --help" for the full input/option list.
`);
}

function printStageHelp(stage: Stage): void {
  const tail =
    stage === 'run'
      ? 'Runs the whole pipeline (one or many inputs) → ./out. With NO input flags, runs every input listed in cn.config.json.'
      : stage === 'acquire'
        ? 'Outputs a canonical artifact.'
        : stage === 'ingest'
          ? 'Outputs a validated artifact (adapted, assembled, linted) + repair proposals.'
          : stage === 'build'
            ? 'Outputs the content-hashed IR (only if validation passes).'
            : stage === 'verify'
              ? 'Rebuilds IR + surfaces K× (must be identical) and checks them against cn.lock; --update writes it.'
              : 'Renders the IR into surfaces (SDK · MCP · CLI · docs); writes a tree under ./surfaces.';
  const outputHelp =
    stage === 'run'
      ? '  -o, --out <dir>           Output directory for all artifacts + surfaces (default: ./out).\n' +
        '  --ir                      Also store each input\'s IR in <out>/ir/<label>.json.\n' +
        `  --only <kinds>            Comma list of surfaces to emit (${SURFACE_KINDS.join(', ')}).\n`
      : stage === 'project'
        ? '  -o, --out <dir>           Surfaces root directory (default: ./surfaces).\n' +
          `  --only <kinds>            Comma list of surfaces to emit (${SURFACE_KINDS.join(', ')}).\n`
        : stage === 'verify'
          ? '  --update                  Write/refresh cn.lock from the current output.\n' +
            '  --lock <path>             Lock file path (default: ./cn.lock).\n' +
            '  -k <n>                    Rebuild count for the Pass^k check (default: 3).\n' +
            `  --only <kinds>            Restrict surfaces to lock/check (${SURFACE_KINDS.join(', ')}).\n`
          : '  -o, --out <file|dir>      Write JSON to a file/dir (default: stdout).\n';
  process.stdout.write(`cn ${stage} — ${tail}

INPUTS (${stage === 'run' ? 'one or more — flags are repeatable' : 'choose exactly one'})
  --github <owner/repo>     A GitHub repo (needs a PAT).
  --openapi <path|url>      An OpenAPI document (local file or http(s) URL).
  --sdk <path>              An existing SDK directory (reverse-derived).
  --mcp <path|url>          An MCP server: a tools manifest, or a stdio command with --command.

GITHUB OPTIONS
  --pat <token>             PAT; or env CN_GITHUB_PAT / GITHUB_TOKEN / GH_TOKEN.
  --ref <branch|tag|sha>    Revision to pin (default: repo default branch).
  --spec <path>             Path to the spec within the repo (auto-detected otherwise).

SDK / MCP OPTIONS
  --lang <typescript|python>  Force SDK language (otherwise detected).
  --command                   Treat the --mcp value as a stdio server command to launch.

OUTPUT
${outputHelp}  --quiet                   Suppress progress + summary on stderr.
  -h, --help                Show this help.

EXAMPLES
  cn ${stage} --openapi ./fixtures/lumen/openapi/lumen.json${stage === 'project' ? ' -o surfaces/' : ' -o out/'}
  cn ${stage} --sdk ./fixtures/sdk-sample
  cn ${stage} --mcp ./fixtures/mcp-sample/tools.json${stage === 'run' ? '\n  cn run --openapi a.yaml --sdk ./b --mcp c.json   # several at once → ./out/<label>/\n  cn run                                           # every input in cn.config.json\n  cn run --ir                                      # ditto, and also store each IR in out/ir/<label>.json' : ''}
`);
}

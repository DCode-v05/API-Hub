import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { SurfaceDTO } from '../events';
import type { ProjectRecord, PublishEvent, PublishRegistry, RegistryStatus } from '../records';
import { createPublish, lastPublishedVersion, updatePublish } from './store';
import { writeSurfaceFiles } from './surface-fs';

/**
 * Publishes a generated SDK to a public registry under a platform-owned org, configured globally via
 * env: STUDIO_NPM_TOKEN + STUDIO_NPM_SCOPE (npm), STUDIO_PYPI_TOKEN + STUDIO_PYPI_PREFIX (PyPI). The
 * TypeScript SDK ships its source (the generator points main/types at src/), so it's published as-is;
 * the Python SDK is built (`python -m build`) then uploaded with twine. The published version
 * auto-increments the patch off the last publish so re-publishing always succeeds. No shell.
 */

const NPM_SCOPE = process.env.STUDIO_NPM_SCOPE || '@connector-network';
const PYPI_PREFIX = process.env.STUDIO_PYPI_PREFIX || 'cn-';

const g = globalThis as unknown as { __cnPyTooling?: boolean };

function pythonBin(): string {
  return process.platform === 'win32' ? 'python' : 'python3';
}

function minimalEnv(): NodeJS.ProcessEnv {
  return { PATH: process.env.PATH, NODE_ENV: process.env.NODE_ENV };
}

function npmCli(): { cmd: string; pre: string[] } {
  const local = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (existsSync(local)) return { cmd: process.execPath, pre: [local] };
  return { cmd: process.platform === 'win32' ? 'npm.cmd' : 'npm', pre: [] };
}

async function probePyTooling(): Promise<boolean> {
  if (g.__cnPyTooling !== undefined) return g.__cnPyTooling;
  const ok = await new Promise<boolean>((resolve) => {
    try {
      // Import twine.cli (not just `twine`) so a missing transitive dep (e.g. rich→pygments) is caught
      // here rather than at upload time.
      const child = spawn(pythonBin(), ['-c', 'import build; import twine.cli'], { env: minimalEnv() });
      child.on('error', () => resolve(false));
      child.on('exit', (code) => resolve(code === 0));
    } catch {
      resolve(false);
    }
  });
  g.__cnPyTooling = ok;
  return ok;
}

export async function registryStatus(): Promise<RegistryStatus> {
  return {
    npm: { configured: !!process.env.STUDIO_NPM_TOKEN, scope: NPM_SCOPE },
    pypi: { configured: !!process.env.STUDIO_PYPI_TOKEN, prefix: PYPI_PREFIX, tooling: await probePyTooling() },
  };
}

export interface PublishInput {
  userId: string;
  project: ProjectRecord;
  version: number;
  surface: 'sdk-typescript' | 'sdk-python';
  surfaces: SurfaceDTO[];
}

export async function publishSdk(input: PublishInput, emit: (e: PublishEvent) => void): Promise<void> {
  const { userId, project, version, surface, surfaces } = input;
  const registry: PublishRegistry = surface === 'sdk-typescript' ? 'npm' : 'pypi';
  const s = surfaces.find((x) => x.kind === surface);
  if (!s) return void emit({ t: 'error', message: 'This version has no such SDK surface.' });

  if (registry === 'npm' && !process.env.STUDIO_NPM_TOKEN) {
    return void emit({ t: 'error', message: 'npm publishing is not configured — set STUDIO_NPM_TOKEN.' });
  }
  if (registry === 'pypi') {
    if (!process.env.STUDIO_PYPI_TOKEN) return void emit({ t: 'error', message: 'PyPI publishing is not configured — set STUDIO_PYPI_TOKEN.' });
    if (!(await probePyTooling())) return void emit({ t: 'error', message: 'PyPI publishing needs the `build` and `twine` packages installed (pip install build twine).' });
  }

  const meta = surface === 'sdk-typescript' ? readNpmMeta(s) : readPyMeta(s);
  if (!meta) return void emit({ t: 'error', message: 'Could not read the SDK package manifest.' });

  const packageName = surface === 'sdk-typescript' ? scoped(meta.name) : PYPI_PREFIX + meta.name.toLowerCase();
  const last = await lastPublishedVersion(packageName);
  const nextVersion = last ? bumpPatch(last) : meta.version;

  const rec = await createPublish(userId, { projectId: project.id, version, surfaceKind: surface, registry, packageName, publishedVersion: nextVersion });
  const dir = mkdtempSync(join(tmpdir(), 'cn-pub-'));
  try {
    writeSurfaceFiles(dir, s.files);
    let code: number;

    if (surface === 'sdk-typescript') {
      emit({ t: 'step', name: 'Preparing package' });
      rewriteNpm(dir, packageName, nextVersion);
      writeFileSync(join(dir, '.npmrc'), `//registry.npmjs.org/:_authToken=${process.env.STUDIO_NPM_TOKEN}\n`);
      emit({ t: 'step', name: `Publishing ${packageName}@${nextVersion} to npm` });
      const npm = npmCli();
      code = await runStep(emit, npm.cmd, [...npm.pre, 'publish', '--access', 'public'], dir, minimalEnv());
    } else {
      emit({ t: 'step', name: 'Preparing package' });
      rewritePy(dir, packageName, nextVersion);
      emit({ t: 'step', name: 'Building wheel + sdist (python -m build)' });
      code = await runStep(emit, pythonBin(), ['-m', 'build'], dir, minimalEnv());
      if (code === 0) {
        const distDir = join(dir, 'dist');
        const dist = existsSync(distDir) ? readdirSync(distDir).map((f) => join('dist', f)) : [];
        if (dist.length === 0) {
          emit({ t: 'log', line: 'No artifacts were produced by the build.' });
          code = -1;
        } else {
          emit({ t: 'step', name: `Uploading ${packageName}@${nextVersion} to PyPI (twine)` });
          code = await runStep(emit, pythonBin(), ['-m', 'twine', 'upload', '--non-interactive', ...dist], dir, {
            ...minimalEnv(),
            TWINE_USERNAME: '__token__',
            TWINE_PASSWORD: process.env.STUDIO_PYPI_TOKEN,
          });
        }
      }
    }

    if (code === 0) {
      const url = registry === 'npm' ? `https://www.npmjs.com/package/${packageName}` : `https://pypi.org/project/${packageName}/`;
      await updatePublish(rec.id, { status: 'published', url });
      emit({ t: 'published', publishedVersion: nextVersion, url, packageName });
    } else {
      const message = `Publish failed (exit ${code}). See the log above.`;
      await updatePublish(rec.id, { status: 'failed', error: message });
      emit({ t: 'error', message });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await updatePublish(rec.id, { status: 'failed', error: message });
    emit({ t: 'error', message });
  } finally {
    rmSafe(dir);
  }
}

function runStep(emit: (e: PublishEvent) => void, cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve) => {
    const shown = cmd === process.execPath ? 'node' : cmd;
    emit({ t: 'log', line: `$ ${shown} ${args.join(' ')}` });
    let child;
    try {
      child = spawn(cmd, args, { cwd, env });
    } catch (e) {
      emit({ t: 'log', line: e instanceof Error ? e.message : String(e) });
      resolve(-1);
      return;
    }
    const onData = (c: Buffer): void => {
      const text = c.toString().trimEnd();
      if (text) emit({ t: 'log', line: text });
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.on('error', (e) => {
      emit({ t: 'log', line: e.message });
      resolve(-1);
    });
    child.on('exit', (code) => resolve(code ?? -1));
  });
}

function scoped(name: string): string {
  return NPM_SCOPE ? `${NPM_SCOPE}/${name.replace(/^@[^/]+\//, '')}` : name;
}

function bumpPatch(v: string): string {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
  return m ? `${m[1]}.${m[2]}.${Number(m[3]) + 1}` : `${v}.1`;
}

function readNpmMeta(s: SurfaceDTO): { name: string; version: string } | null {
  const pkg = s.files.find((f) => f.path === 'package.json');
  if (!pkg) return null;
  try {
    const j = JSON.parse(pkg.content) as { name?: string; version?: string };
    if (!j.name) return null;
    return { name: j.name, version: j.version || '0.0.0' };
  } catch {
    return null;
  }
}

function readPyMeta(s: SurfaceDTO): { name: string; version: string } | null {
  const toml = s.files.find((f) => f.path === 'pyproject.toml');
  if (!toml) return null;
  const name = /^name\s*=\s*"([^"]+)"/m.exec(toml.content)?.[1];
  const version = /^version\s*=\s*"([^"]+)"/m.exec(toml.content)?.[1];
  return name ? { name, version: version || '0.0.0' } : null;
}

function rewriteNpm(dir: string, packageName: string, version: string): void {
  const p = join(dir, 'package.json');
  const j = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
  j['name'] = packageName;
  j['version'] = version;
  writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
}

function rewritePy(dir: string, packageName: string, version: string): void {
  const p = join(dir, 'pyproject.toml');
  let toml = readFileSync(p, 'utf8');
  toml = toml.replace(/^name\s*=\s*"[^"]*"/m, `name = "${packageName}"`);
  toml = toml.replace(/^version\s*=\s*"[^"]*"/m, `version = "${version}"`);
  writeFileSync(p, toml);
}

function rmSafe(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
}

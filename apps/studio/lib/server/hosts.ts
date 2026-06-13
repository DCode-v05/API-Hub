import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import type { SurfaceDTO } from '../events';
import type { ProjectRecord } from '../records';
import { CLI_HTTP_WRAPPER, CLI_HTTP_WRAPPER_FILENAME } from './cli-http-template';
import { createDeployment, listActiveDeployments, updateDeployment } from './store';
import { writeSurfaceFiles } from './surface-fs';

/**
 * The local host registry. The studio writes a version's surface to a managed dir and spawns a
 * zero-dependency HTTP server (bound to 127.0.0.1) as a child process: for `mcp` the generated
 * `http-server.mjs` (POST /mcp), for `cli` a wrapper that turns the generated `cli.mjs` into a
 * command service (POST /run). It tracks the live child + a rolling log buffer on globalThis (so dev
 * hot-reload doesn't lose handles); the DB `deployments` row is the durable record.
 */

type HostKind = 'mcp' | 'cli';

const LOG_CAP = 200;
const MAX_HOSTS = 10;
const HEALTH_TIMEOUT_MS = 6000;

interface HostEntry {
  child: ChildProcess;
  kind: HostKind;
  port: number;
  pid: number;
  projectId: string;
  userId: string;
  version: number;
  status: 'starting' | 'running' | 'stopped' | 'failed';
  startedAt: number;
  logs: string[];
}

const g = globalThis as unknown as { __cnHosts?: Map<string, HostEntry> };
function hosts(): Map<string, HostEntry> {
  if (!g.__cnHosts) g.__cnHosts = new Map<string, HostEntry>();
  return g.__cnHosts;
}

function hostsDir(): string {
  return join(process.cwd(), '.hosts');
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

async function waitHealthy(port: number): Promise<boolean> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  return false;
}

export interface StartHostInput {
  userId: string;
  project: ProjectRecord;
  version: number;
  kind: HostKind;
  surfaces: SurfaceDTO[];
  baseUrl: string;
  token?: string;
}

export interface StartHostResult {
  deploymentId: string;
  status: 'running' | 'failed';
  port: number | null;
  error?: string;
}

export async function startHost(input: StartHostInput): Promise<StartHostResult> {
  const { userId, project, version, kind, surfaces, baseUrl, token } = input;
  if (hosts().size >= MAX_HOSTS) {
    return { deploymentId: '', status: 'failed', port: null, error: `Too many hosted servers running (max ${MAX_HOSTS}). Stop one first.` };
  }
  const surface = surfaces.find((s) => s.kind === kind);
  if (!surface) return { deploymentId: '', status: 'failed', port: null, error: `This version has no ${kind.toUpperCase()} surface to host.` };
  const entryFile = kind === 'mcp' ? 'http-server.mjs' : CLI_HTTP_WRAPPER_FILENAME;
  const requiredFile = kind === 'mcp' ? 'http-server.mjs' : 'cli.mjs';
  if (!surface.files.some((f) => f.path === requiredFile)) {
    return { deploymentId: '', status: 'failed', port: null, error: `This ${kind.toUpperCase()} surface is missing ${requiredFile}. Re-sync the project to regenerate it.` };
  }

  // One active host per (project, kind) — stop any existing of this kind first.
  await stopHostsForProject(userId, project.id, kind);

  const port = await freePort();
  const dep = await createDeployment(userId, { projectId: project.id, version, surfaceKind: kind, port, baseUrl });
  const dir = join(hostsDir(), dep.id);

  try {
    mkdirSync(dir, { recursive: true });
    writeSurfaceFiles(dir, surface.files);
    if (kind === 'cli') writeFileSync(join(dir, CLI_HTTP_WRAPPER_FILENAME), CLI_HTTP_WRAPPER);
  } catch (e) {
    await updateDeployment(dep.id, { status: 'failed', error: errMsg(e), stoppedAt: new Date().toISOString() });
    return { deploymentId: dep.id, status: 'failed', port, error: errMsg(e) };
  }

  // Minimal env — the hosted server only needs these; we deliberately do NOT inherit the studio's
  // process.env so its secrets (DATABASE_URL, STUDIO_*, registry tokens) never reach the child.
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    NODE_ENV: process.env.NODE_ENV,
    PORT: String(port),
    HOST: '127.0.0.1',
    CN_BASE_URL: baseUrl,
  };
  if (token) env.CN_TOKEN = token;

  const child = spawn(process.execPath, [join(dir, entryFile)], { cwd: dir, env });
  const entry: HostEntry = {
    child,
    kind,
    port,
    pid: child.pid ?? 0,
    projectId: project.id,
    userId,
    version,
    status: 'starting',
    startedAt: Date.now(),
    logs: [],
  };
  hosts().set(dep.id, entry);

  const pushLog = (chunk: Buffer): void => {
    for (const line of chunk.toString().split('\n')) {
      if (!line) continue;
      entry.logs.push(line);
      if (entry.logs.length > LOG_CAP) entry.logs.shift();
    }
  };
  child.stdout?.on('data', pushLog);
  child.stderr?.on('data', pushLog);
  child.on('exit', (code) => {
    if (entry.status === 'starting' || entry.status === 'running') {
      entry.status = code === 0 ? 'stopped' : 'failed';
      void updateDeployment(dep.id, {
        status: entry.status,
        error: code === 0 ? null : `Server exited (code ${code ?? 'signal'})`,
        stoppedAt: new Date().toISOString(),
      });
    }
  });

  await updateDeployment(dep.id, { pid: child.pid ?? null });

  const healthy = await waitHealthy(port);
  if (!healthy || entry.status === 'failed') {
    const tail = entry.logs.slice(-5).join(' ');
    const message =
      entry.status === 'failed'
        ? tail || 'Server failed to start.'
        : `Server did not become healthy on :${port}.${tail ? ' — ' + tail : ''}`;
    killEntry(entry);
    entry.status = 'failed';
    hosts().delete(dep.id);
    rmSafe(dir);
    await updateDeployment(dep.id, { status: 'failed', error: message, stoppedAt: new Date().toISOString() });
    return { deploymentId: dep.id, status: 'failed', port, error: message };
  }

  entry.status = 'running';
  await updateDeployment(dep.id, { status: 'running' });
  return { deploymentId: dep.id, status: 'running', port };
}

export async function stopHost(userId: string, deploymentId: string): Promise<boolean> {
  const entry = hosts().get(deploymentId);
  if (entry) {
    if (entry.userId !== userId) return false;
    killEntry(entry);
    entry.status = 'stopped';
    hosts().delete(deploymentId);
    rmSafe(join(hostsDir(), deploymentId));
  }
  await updateDeployment(deploymentId, { status: 'stopped', stoppedAt: new Date().toISOString() });
  return true;
}

async function stopHostsForProject(userId: string, projectId: string, kind: HostKind): Promise<void> {
  for (const [id, entry] of hosts()) {
    if (entry.projectId === projectId && entry.userId === userId && entry.kind === kind) {
      killEntry(entry);
      hosts().delete(id);
      rmSafe(join(hostsDir(), id));
      await updateDeployment(id, { status: 'stopped', stoppedAt: new Date().toISOString() });
    }
  }
}

/** Live status + rolling logs for a running deployment (null if not in this process's registry). */
export function getHostLive(deploymentId: string): { status: string; port: number; logs: string[] } | null {
  const e = hosts().get(deploymentId);
  return e ? { status: e.status, port: e.port, logs: [...e.logs] } : null;
}

/**
 * On boot, clean up deployments left `running`/`starting` by a previous studio process: best-effort
 * kill their recorded pid (orphans) and mark them stopped. The in-memory registry is empty after a
 * restart, so nothing here is reachable any more. Best-effort — never throws.
 */
export async function reconcileHosts(): Promise<void> {
  try {
    const active = await listActiveDeployments();
    for (const dep of active) {
      if (dep.pid) killPid(dep.pid);
      rmSafe(join(hostsDir(), dep.id));
      await updateDeployment(dep.id, { status: 'stopped', stoppedAt: new Date().toISOString() });
    }
  } catch {
    /* reconcile is best-effort */
  }
}

/** Best-effort kill of an orphaned pid recorded by a previous process (boot reconcile). */
export function killPid(pid: number): void {
  try {
    if (process.platform === 'win32') spawn('taskkill', ['/PID', String(pid), '/T', '/F']);
    else process.kill(pid, 'SIGTERM');
  } catch {
    /* already gone */
  }
}

function killEntry(entry: HostEntry): void {
  try {
    if (process.platform === 'win32' && entry.pid) spawn('taskkill', ['/PID', String(entry.pid), '/T', '/F']);
    else entry.child.kill('SIGTERM');
  } catch {
    /* ignore */
  }
}

function rmSafe(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NextRequest } from 'next/server';
import { cnBin, repoRoot, resolveUserPath } from '@/lib/server/paths';
import { getCurrentUser } from '@/lib/server/session';
import { getPatToken } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Only the real `cn` subcommands may be launched. We never use a shell, so argv values are passed
// verbatim (no interpolation / injection); and only `node <cnBin>` is ever executed.
const ALLOWED = new Set(['run', 'acquire', 'ingest', 'build', 'project', 'help', 'version', '-h', '--help', '-v', '--version']);
// Subcommands that write artifacts we can read back and show as downloadable output.
const PRODUCING = new Set(['run', 'acquire', 'ingest', 'build', 'project']);
const KILL_AFTER_MS = 5 * 60 * 1000;
const MAX_FILES = 400;
const MAX_TOTAL_BYTES = 4_000_000;
const MAX_FILE_BYTES = 512 * 1024;

/** Find a user-supplied -o/--out value in argv, if any. */
function findOut(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '-o' || a === '--out') return args[i + 1];
    if (a.startsWith('--out=')) return a.slice(6);
    if (a.startsWith('-o=')) return a.slice(3);
  }
  return undefined;
}

/** Read a produced output directory into a flat, size-capped list of text files. */
function readOutput(root: string): { files: { path: string; content: string }[]; truncated: boolean } {
  const files: { path: string; content: string }[] = [];
  let bytes = 0;
  let truncated = false;

  const walk = (rel: string): void => {
    let entries;
    try {
      entries = readdirSync(join(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        walk(r);
      } else if (e.isFile()) {
        if (files.length >= MAX_FILES || bytes >= MAX_TOTAL_BYTES) {
          truncated = true;
          continue;
        }
        const full = join(root, r);
        let size = 0;
        try {
          size = statSync(full).size;
        } catch {
          continue;
        }
        if (size > MAX_FILE_BYTES) {
          truncated = true;
          continue;
        }
        try {
          files.push({ path: r, content: readFileSync(full, 'utf8') });
          bytes += size;
        } catch {
          /* skip unreadable */
        }
      }
    }
  };

  walk('');
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { files, truncated };
}

export async function POST(req: NextRequest): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  let body: { args?: unknown; pat?: unknown; patId?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  let args = Array.isArray(body.args) ? body.args.filter((a): a is string => typeof a === 'string') : [];
  if (args[0] === 'cn') args = args.slice(1); // tolerate a leading "cn"
  if (args.length === 0) args = ['help'];

  // Resolve the GitHub PAT from the form: a typed token, or a saved PAT id (decrypted server-side).
  let githubToken: string | undefined;
  if (typeof body.pat === 'string' && body.pat.trim()) githubToken = body.pat.trim();
  else if (typeof body.patId === 'string' && body.patId) githubToken = await getPatToken(user.id, body.patId);

  const encoder = new TextEncoder();
  let child: ChildProcess | null = null;
  let killTimer: ReturnType<typeof setTimeout> | null = null;
  let tempDir: string | null = null;

  const cleanupTemp = (): void => {
    if (tempDir) {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
      tempDir = null;
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: unknown): void => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          /* closed */
        }
      };

      if (args.length > 60 || args.some((a) => a.length > 8192)) {
        send({ t: 'err', data: 'cn: command too long.\n' });
        send({ t: 'exit', code: 2 });
        controller.close();
        return;
      }
      if (!ALLOWED.has(args[0]!)) {
        send({ t: 'err', data: `cn: "${args[0]}" is not an allowed command.\nAllowed: ${[...ALLOWED].join(', ')}\n` });
        send({ t: 'exit', code: 2 });
        controller.close();
        return;
      }

      // For producing subcommands, capture the output so it can be shown/downloaded. If the user
      // didn't pass -o, write to a temp dir (read back, then deleted) so their filesystem is untouched.
      const capture = PRODUCING.has(args[0]!);
      let outDir: string | null = null;
      let effectiveArgs = args;
      if (capture) {
        const userOut = findOut(args);
        if (userOut && userOut.trim()) {
          outDir = resolveUserPath(userOut.trim());
        } else {
          tempDir = mkdtempSync(join(tmpdir(), 'cn-cli-'));
          outDir = tempDir;
          effectiveArgs = [...args, '-o', tempDir];
        }
      }

      // For --github commands, force the form's PAT into the child env so cn uses it over any repo
      // .env (cn's dotenv won't override an already-set var). Empty when none → cn errors instead of
      // silently falling back to .env.
      const childEnv = args.includes('--github') ? { ...process.env, CN_GITHUB_PAT: githubToken ?? '' } : process.env;

      send({ t: 'start', argv: args });
      try {
        // Run from the repo root so the cn launcher, samples, and cn.config.json resolve.
        child = spawn(process.execPath, [cnBin(), ...effectiveArgs], { cwd: repoRoot(), env: childEnv });
      } catch (e) {
        send({ t: 'err', data: `cn: failed to start — ${e instanceof Error ? e.message : String(e)}\n` });
        send({ t: 'exit', code: 1 });
        cleanupTemp();
        controller.close();
        return;
      }

      killTimer = setTimeout(() => {
        try {
          child?.kill('SIGKILL');
        } catch {
          /* ignore */
        }
      }, KILL_AFTER_MS);

      child.stdout?.on('data', (d: Buffer) => send({ t: 'out', data: d.toString() }));
      child.stderr?.on('data', (d: Buffer) => send({ t: 'err', data: d.toString() }));
      child.on('error', (e) => {
        send({ t: 'err', data: `cn: ${e.message}\n` });
        send({ t: 'exit', code: 1 });
        if (killTimer) clearTimeout(killTimer);
        cleanupTemp();
        controller.close();
      });
      child.on('close', (code) => {
        // On success, read back whatever cn produced and hand it to the client.
        if (capture && code === 0 && outDir) {
          try {
            const { files, truncated } = readOutput(outDir);
            if (files.length > 0) send({ t: 'artifacts', files, truncated });
          } catch {
            /* output unreadable — still report exit */
          }
        }
        cleanupTemp();
        send({ t: 'exit', code: code ?? 0 });
        if (killTimer) clearTimeout(killTimer);
        controller.close();
      });
    },
    cancel() {
      if (killTimer) clearTimeout(killTimer);
      try {
        child?.kill();
      } catch {
        /* ignore */
      }
      cleanupTemp();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

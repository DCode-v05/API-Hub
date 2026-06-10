import { spawn, type ChildProcess } from 'node:child_process';
import type { NextRequest } from 'next/server';
import { cnBin, repoRoot } from '@/lib/server/paths';
import { getCurrentUser } from '@/lib/server/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Only the real `cn` subcommands may be launched. We never use a shell, so argv values are passed
// verbatim (no interpolation / injection); and only `node <cnBin>` is ever executed.
const ALLOWED = new Set(['run', 'acquire', 'ingest', 'build', 'project', 'help', 'version', '-h', '--help', '-v', '--version']);
const KILL_AFTER_MS = 5 * 60 * 1000;

export async function POST(req: NextRequest): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  let body: { args?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  let args = Array.isArray(body.args) ? body.args.filter((a): a is string => typeof a === 'string') : [];
  if (args[0] === 'cn') args = args.slice(1); // tolerate a leading "cn"
  if (args.length === 0) args = ['help'];

  const encoder = new TextEncoder();
  let child: ChildProcess | null = null;
  let killTimer: ReturnType<typeof setTimeout> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: unknown): void => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          /* closed */
        }
      };

      // Validate before spawning — surface problems inline in the terminal instead of an HTTP error.
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

      send({ t: 'start', argv: args });
      try {
        // Run from the repo root so the cn launcher, samples, cn.config.json and .env all resolve.
        child = spawn(process.execPath, [cnBin(), ...args], { cwd: repoRoot(), env: process.env });
      } catch (e) {
        send({ t: 'err', data: `cn: failed to start — ${e instanceof Error ? e.message : String(e)}\n` });
        send({ t: 'exit', code: 1 });
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
        controller.close();
      });
      child.on('close', (code) => {
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

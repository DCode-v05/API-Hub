import type { NextRequest } from 'next/server';
import { runPipeline } from '@/lib/cn/runner';
import { buildSourceFromRequest } from '@/lib/cn/sources';
import type { RunRequest } from '@/lib/events';

// The pipeline uses git/child_process/fs and the TypeScript compiler — Node runtime only.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest): Promise<Response> {
  let body: RunRequest;
  try {
    body = (await req.json()) as RunRequest;
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const encoder = new TextEncoder();
  const ac = new AbortController();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown): void => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          /* stream closed */
        }
      };

      // Everything — including building the source and writing temp files — runs inside this
      // try/finally so any throw still emits a terminal event, cleans up, and closes the stream
      // (a bad body must never leave the SSE response hanging open).
      let built: Awaited<ReturnType<typeof buildSourceFromRequest>> | undefined;
      try {
        if (!body || typeof body !== 'object') {
          send({ t: 'error', stage: 'input', message: 'Invalid request body — expected a JSON object.' });
          send({ t: 'done', ok: false, ms: 0 });
          return;
        }
        built = await buildSourceFromRequest(body);
        if ('error' in built) {
          send({ t: 'error', stage: 'input', message: built.error });
          send({ t: 'done', ok: false, ms: 0 });
          return;
        }
        await runPipeline(built.source, send, ac.signal);
      } catch (e) {
        send({ t: 'error', stage: 'input', message: e instanceof Error ? e.message : String(e) });
        send({ t: 'done', ok: false, ms: 0 });
      } finally {
        if (built && 'cleanup' in built && built.cleanup) await built.cleanup();
        controller.close();
      }
    },
    // Client disconnected — stop the in-process pipeline at the next stage boundary.
    cancel() {
      ac.abort();
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

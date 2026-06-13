import type { NextRequest } from 'next/server';
import { buildRunPayload } from '@/lib/cn/payload';
import { executePipeline } from '@/lib/cn/pipeline';
import { buildSourceFromRequest } from '@/lib/cn/sources';
import type { RunEvent, RunRequest } from '@/lib/events';
import { getCurrentUser } from '@/lib/server/session';
import { getPatToken, saveRun } from '@/lib/server/store';

// The pipeline uses git/child_process/fs and the TypeScript compiler — Node runtime only.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

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
      const send = (event: RunEvent): void => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          /* stream closed */
        }
      };

      let built: Awaited<ReturnType<typeof buildSourceFromRequest>> | undefined;
      try {
        if (!body || typeof body !== 'object') {
          send({ t: 'error', stage: 'input', message: 'Invalid request body — expected a JSON object.' });
          send({ t: 'done', ok: false, ms: 0 });
          return;
        }
        // Resolve a saved PAT (referenced by id) to a real token — server-side, for this user only.
        if (body.kind === 'github' && body.patId && !body.pat?.trim()) {
          const token = await getPatToken(user.id, body.patId);
          if (token) body.pat = token;
        }
        built = await buildSourceFromRequest(body);
        if ('error' in built) {
          send({ t: 'error', stage: 'input', message: built.error });
          send({ t: 'done', ok: false, ms: 0 });
          return;
        }
        const result = await executePipeline(built.source, { emit: send, signal: ac.signal, stagger: true });
        // Record the run (skipped automatically if the client aborted before completion).
        if (!ac.signal.aborted) {
          try {
            const { meta, payload } = buildRunPayload({ userId: user.id, request: body, result });
            await saveRun(meta, payload);
          } catch {
            /* persistence is best-effort — never break the response over it */
          }
        }
      } catch (e) {
        send({ t: 'error', stage: 'input', message: e instanceof Error ? e.message : String(e) });
        send({ t: 'done', ok: false, ms: 0 });
      } finally {
        if (built && 'cleanup' in built && built.cleanup) await built.cleanup();
        controller.close();
      }
    },
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

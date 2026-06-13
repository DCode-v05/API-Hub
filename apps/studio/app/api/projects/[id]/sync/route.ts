import { checkProject } from '@/lib/cn/check-project';
import type { ProjectSyncEvent } from '@/lib/records';
import { tryLockProject, unlockProject } from '@/lib/server/project-locks';
import { getCurrentUser } from '@/lib/server/session';
import { getProject } from '@/lib/server/store';

// Re-runs the project's source through the pipeline and (on change) appends a version. Streams the
// live funnel over SSE, exactly like /api/run, plus a final {t:'version'} frame with the outcome.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const project = await getProject(user.id, id);
  if (!project) return new Response('Not found', { status: 404 });

  if (!tryLockProject(project.id)) {
    return Response.json({ error: 'A sync is already running for this project.' }, { status: 409 });
  }

  const encoder = new TextEncoder();
  const ac = new AbortController();
  let released = false;
  const release = () => {
    if (!released) {
      released = true;
      unlockProject(project.id);
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ProjectSyncEvent): void => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          /* stream closed */
        }
      };
      try {
        const outcome = await checkProject(project, { trigger: 'manual', emit: send, signal: ac.signal });
        send({ t: 'version', outcome });
      } catch (e) {
        // checkProject never throws, but guard the stream regardless.
        send({ t: 'error', stage: 'input', message: e instanceof Error ? e.message : String(e) });
        send({ t: 'done', ok: false, ms: 0 });
      } finally {
        release();
        controller.close();
      }
    },
    cancel() {
      ac.abort();
      release();
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

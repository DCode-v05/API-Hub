import type { NextRequest } from 'next/server';
import { projectSurfaces } from '@/lib/cn/pipeline';
import { publishSdk, registryStatus } from '@/lib/server/publish';
import { tryLockProject, unlockProject } from '@/lib/server/project-locks';
import { getCurrentUser } from '@/lib/server/session';
import { getProject, getProjectVersionPayload, listPublishes } from '@/lib/server/store';
import type { PublishEvent } from '@/lib/records';
import type { RunPayload } from '@/lib/run-payload';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const TARGETS = ['sdk-typescript', 'sdk-python'] as const;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const project = await getProject(user.id, id);
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json({ registry: await registryStatus(), publishes: await listPublishes(user.id, id) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response('Unauthorized', { status: 401 });
  const { id } = await params;
  const project = await getProject(user.id, id);
  if (!project) return new Response('Not found', { status: 404 });

  let body: { version?: number; target?: (typeof TARGETS)[number] };
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }
  const version = Number(body.version);
  const target = body.target;
  if (!Number.isInteger(version) || version <= 0) return new Response('A valid version is required.', { status: 400 });
  if (!target || !TARGETS.includes(target)) return new Response('A valid SDK target is required.', { status: 400 });

  const payload = (await getProjectVersionPayload(user.id, id, version)) as RunPayload | null;
  if (!payload?.ir && !payload?.surfaces) return new Response('That version has no generated surfaces.', { status: 400 });
  // Re-project from the pinned IR with the current generator (deterministic, always up to date).
  const surfaces = payload.ir ? projectSurfaces(payload.ir) : payload.surfaces!;

  const lockKey = `publish:${id}:${target}`;
  if (!tryLockProject(lockKey)) return Response.json({ error: 'A publish is already running for this package.' }, { status: 409 });

  const encoder = new TextEncoder();
  let released = false;
  const release = (): void => {
    if (!released) {
      released = true;
      unlockProject(lockKey);
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: PublishEvent): void => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          /* stream closed */
        }
      };
      try {
        await publishSdk({ userId: user.id, project, version, surface: target, surfaces }, send);
      } catch (e) {
        send({ t: 'error', message: e instanceof Error ? e.message : String(e) });
      } finally {
        release();
        controller.close();
      }
    },
    cancel() {
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

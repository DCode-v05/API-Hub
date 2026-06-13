import type { NextRequest } from 'next/server';
import { isWatchable } from '@/lib/cn/watchable';
import type { RunRequest, StageSourceKind } from '@/lib/events';
import { getCurrentUser } from '@/lib/server/session';
import { createProject, listProjects } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KINDS: StageSourceKind[] = ['github', 'openapi', 'sdk', 'mcp'];

export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  return Response.json({ projects: await listProjects(user.id) });
}

export async function POST(req: NextRequest): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { name?: string; kind?: StageSourceKind; request?: RunRequest; watchEnabled?: boolean; watchIntervalSec?: number };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const name = (body.name ?? '').trim();
  if (!name) return Response.json({ error: 'Project name is required.' }, { status: 400 });
  if (!body.kind || !KINDS.includes(body.kind)) return Response.json({ error: 'A valid input kind is required.' }, { status: 400 });
  if (!body.request || typeof body.request !== 'object') return Response.json({ error: 'An input configuration is required.' }, { status: 400 });

  const request: RunRequest = { ...body.request, kind: body.kind };
  const watch = isWatchable(request);
  if (!watch.ok) return Response.json({ error: watch.reason }, { status: 400 });

  try {
    const project = await createProject(user.id, {
      name,
      kind: body.kind,
      request,
      patId: request.patId ?? null,
      watchEnabled: body.watchEnabled ?? false,
      watchIntervalSec: body.watchIntervalSec,
    });
    return Response.json({ project });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Could not create project.' }, { status: 400 });
  }
}

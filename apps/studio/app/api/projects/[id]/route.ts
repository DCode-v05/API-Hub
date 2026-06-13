import { getCurrentUser } from '@/lib/server/session';
import { deleteProject, getProject, listProjectVersions, updateProject } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const project = await getProject(user.id, id);
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 });
  const versions = await listProjectVersions(user.id, id);
  return Response.json({ project, versions });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  let body: { name?: string; watchEnabled?: boolean; watchIntervalSec?: number };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (body.name !== undefined && !body.name.trim()) return Response.json({ error: 'Project name cannot be empty.' }, { status: 400 });

  try {
    const project = await updateProject(user.id, id, {
      name: body.name,
      watchEnabled: body.watchEnabled,
      watchIntervalSec: body.watchIntervalSec,
    });
    if (!project) return Response.json({ error: 'Not found' }, { status: 404 });
    return Response.json({ project });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Could not update project.' }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const removed = await deleteProject(user.id, id);
  return removed ? Response.json({ ok: true }) : Response.json({ error: 'Not found' }, { status: 404 });
}

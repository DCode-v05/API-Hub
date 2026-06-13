import type { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/server/session';
import { getHostConfig, getProject, setHostConfig } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const project = await getProject(user.id, id);
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 });

  let body: { baseUrl?: string; token?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  await setHostConfig(user.id, id, { baseUrl: (body.baseUrl ?? '').trim(), token: body.token });
  return Response.json({ config: await getHostConfig(user.id, id) });
}

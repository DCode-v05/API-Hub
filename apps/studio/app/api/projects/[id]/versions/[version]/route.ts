import { getCurrentUser } from '@/lib/server/session';
import { getProjectVersionPayload } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; version: string }> }): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, version } = await params;
  const v = Number(version);
  if (!Number.isInteger(v) || v <= 0) return Response.json({ error: 'Invalid version' }, { status: 400 });
  const payload = await getProjectVersionPayload(user.id, id, v);
  return payload ? Response.json(payload) : Response.json({ error: 'Not found' }, { status: 404 });
}

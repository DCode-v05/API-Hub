import { getCurrentUser } from '@/lib/server/session';
import { deletePat } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const removed = await deletePat(user.id, id);
  return removed ? Response.json({ ok: true }) : Response.json({ error: 'Not found' }, { status: 404 });
}

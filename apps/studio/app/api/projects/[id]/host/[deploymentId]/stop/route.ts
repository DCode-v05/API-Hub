import { getCurrentUser } from '@/lib/server/session';
import { stopHost } from '@/lib/server/hosts';
import { getDeployment } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string; deploymentId: string }> }): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { deploymentId } = await params;
  const dep = await getDeployment(user.id, deploymentId);
  if (!dep) return Response.json({ error: 'Not found' }, { status: 404 });
  await stopHost(user.id, deploymentId);
  return Response.json({ ok: true });
}

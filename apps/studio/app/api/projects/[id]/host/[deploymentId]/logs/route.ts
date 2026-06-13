import { getHostLive } from '@/lib/server/hosts';
import { getCurrentUser } from '@/lib/server/session';
import { getDeployment } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; deploymentId: string }> }): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { deploymentId } = await params;
  const dep = await getDeployment(user.id, deploymentId);
  if (!dep) return Response.json({ error: 'Not found' }, { status: 404 });
  const live = getHostLive(deploymentId);
  return Response.json({ status: live?.status ?? dep.status, lines: live?.logs ?? [], port: dep.port, endpoint: dep.endpoint });
}

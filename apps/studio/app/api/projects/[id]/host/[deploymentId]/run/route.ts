import type { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/server/session';
import { getDeployment } from '@/lib/server/store';

// Server-side proxy to a hosted CLI server's POST /run. Lets the browser UI invoke a command without
// a cross-origin request to the host's port (which has no CORS). Auth + ownership gated.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; deploymentId: string }> }): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { deploymentId } = await params;
  const dep = await getDeployment(user.id, deploymentId);
  if (!dep) return Response.json({ error: 'Not found' }, { status: 404 });
  if (dep.surfaceKind !== 'cli') return Response.json({ error: 'This deployment is not a CLI host.' }, { status: 400 });
  if (dep.status !== 'running' || !dep.port) return Response.json({ error: 'This CLI host is not running.' }, { status: 409 });

  let body: { args?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const args = Array.isArray(body.args) ? body.args.filter((a) => typeof a === 'string') : [];

  try {
    const res = await fetch(`http://127.0.0.1:${dep.port}/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ args }),
    });
    return Response.json(await res.json());
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

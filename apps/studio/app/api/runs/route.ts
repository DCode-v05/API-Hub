import type { NextRequest } from 'next/server';
import type { StageSourceKind } from '@/lib/events';
import { getCurrentUser } from '@/lib/server/session';
import { listRuns } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const kind = req.nextUrl.searchParams.get('kind') as StageSourceKind | null;
  const limitRaw = Number(req.nextUrl.searchParams.get('limit'));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 50;
  return Response.json({ runs: await listRuns(user.id, kind ?? undefined, limit) });
}

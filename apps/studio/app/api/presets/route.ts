import type { NextRequest } from 'next/server';
import type { StageSourceKind } from '@/lib/events';
import { getCurrentUser } from '@/lib/server/session';
import { createPreset, listPresets } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const kind = req.nextUrl.searchParams.get('kind') as StageSourceKind | null;
  return Response.json({ presets: await listPresets(user.id, kind ?? undefined) });
}

export async function POST(req: NextRequest): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { kind?: StageSourceKind; name?: string; request?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.kind || !body.request || typeof body.request !== 'object') {
    return Response.json({ error: 'kind and request are required' }, { status: 400 });
  }
  const preset = await createPreset(user.id, body.kind, body.name ?? '', body.request as never);
  return Response.json({ preset });
}

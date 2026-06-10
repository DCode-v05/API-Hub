import type { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/server/session';
import { createPat, listPats } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  return Response.json({ pats: listPats(user.id) });
}

export async function POST(req: NextRequest): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { name?: string; token?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.token || !body.token.trim()) return Response.json({ error: 'A token is required.' }, { status: 400 });

  const pat = await createPat(user.id, body.name ?? '', body.token);
  return Response.json({ pat });
}

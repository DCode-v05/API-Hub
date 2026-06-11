import type { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/server/session';
import { inspectRepo } from '@/lib/server/github';
import { getPatToken } from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  let body: { repo?: string; pat?: string; patId?: string; ref?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const repo = (body.repo ?? '').trim();
  if (!repo) return Response.json({ ok: false, error: 'Enter a repository.' });

  // Explicit token only — typed token, or a saved PAT resolved server-side. No .env fallback.
  const token = body.pat?.trim() || (body.patId ? await getPatToken(user.id, body.patId) : undefined);
  if (!token) return Response.json({ ok: false, error: 'Enter or select a GitHub PAT to check access.' });

  const result = await inspectRepo(repo, token, body.ref);
  return Response.json(result);
}

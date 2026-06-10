import { existsSync, readdirSync, statSync } from 'node:fs';
import type { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/server/session';
import { resolveUserPath } from '@/lib/server/paths';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Detected = 'typescript' | 'python' | null;

export async function POST(req: NextRequest): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  let body: { path?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const raw = (body.path ?? '').trim();
  if (!raw) return Response.json({ ok: false, error: 'Enter a path.' });

  const abs = resolveUserPath(raw);
  if (!existsSync(abs)) return Response.json({ ok: false, exists: false, resolved: abs, error: 'Path not found on the server.' });

  const st = statSync(abs);
  const isDir = st.isDirectory();
  let entries: string[] = [];
  let detected: Detected = null;

  if (isDir) {
    try {
      entries = readdirSync(abs).slice(0, 60);
    } catch {
      /* ignore */
    }
    if (entries.includes('package.json') || entries.some((e) => e.endsWith('.ts'))) detected = 'typescript';
    else if (entries.includes('pyproject.toml') || entries.includes('setup.py') || entries.some((e) => e.endsWith('.py'))) {
      detected = 'python';
    }
  }

  return Response.json({ ok: true, exists: true, isDir, detected, entries, resolved: abs });
}

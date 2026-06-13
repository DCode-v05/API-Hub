import type { NextRequest } from 'next/server';
import { projectSurfaces } from '@/lib/cn/pipeline';
import { getCurrentUser } from '@/lib/server/session';
import { getProjectVersionPayload } from '@/lib/server/store';
import { makeTarball } from '@/lib/server/tarball';
import type { RunPayload } from '@/lib/run-payload';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const version = Number(req.nextUrl.searchParams.get('version'));
  if (!Number.isInteger(version) || version <= 0) return Response.json({ error: 'A valid version is required.' }, { status: 400 });

  const payload = (await getProjectVersionPayload(user.id, id, version)) as RunPayload | null;
  const surfaces = payload?.ir ? projectSurfaces(payload.ir) : payload?.surfaces;
  const cli = surfaces?.find((s) => s.kind === 'cli');
  if (!cli) return Response.json({ error: 'That version has no CLI surface.' }, { status: 404 });

  let name = 'cli';
  let ver = String(version);
  try {
    const j = JSON.parse(cli.files.find((f) => f.path === 'package.json')?.content ?? '{}') as { name?: string; version?: string };
    if (j.name) name = j.name;
    if (j.version) ver = j.version;
  } catch {
    /* fall back to defaults */
  }

  const tgz = makeTarball(cli.files);
  return new Response(new Uint8Array(tgz), {
    headers: {
      'Content-Type': 'application/gzip',
      'Content-Disposition': `attachment; filename="${name}-${ver}.tgz"`,
      'Cache-Control': 'no-store',
    },
  });
}

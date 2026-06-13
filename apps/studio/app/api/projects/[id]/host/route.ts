import type { NextRequest } from 'next/server';
import { projectSurfaces } from '@/lib/cn/pipeline';
import { startHost } from '@/lib/server/hosts';
import { tryLockProject, unlockProject } from '@/lib/server/project-locks';
import { getCurrentUser } from '@/lib/server/session';
import { getDeployment, getHostConfig, getHostToken, getProject, getProjectVersionPayload, listDeployments, setHostConfig } from '@/lib/server/store';
import type { RunPayload } from '@/lib/run-payload';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const project = await getProject(user.id, id);
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json({ deployments: await listDeployments(user.id, id), config: await getHostConfig(user.id, id) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const project = await getProject(user.id, id);
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 });

  let body: { version?: number; kind?: 'mcp' | 'cli'; baseUrl?: string; token?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const version = Number(body.version);
  if (!Number.isInteger(version) || version <= 0) return Response.json({ error: 'A valid version is required.' }, { status: 400 });
  const kind: 'mcp' | 'cli' = body.kind === 'cli' ? 'cli' : 'mcp';

  // Persist any supplied upstream config (base URL and/or token) before starting.
  if (body.baseUrl !== undefined || body.token) {
    const existing = await getHostConfig(user.id, id);
    await setHostConfig(user.id, id, { baseUrl: (body.baseUrl ?? existing.baseUrl).trim(), token: body.token });
  }

  const payload = (await getProjectVersionPayload(user.id, id, version)) as RunPayload | null;
  if (!payload?.ir && !payload?.surfaces) return Response.json({ error: 'That version has no generated surfaces.' }, { status: 400 });
  // Re-project from the pinned IR with the current generator (guarantees the hostable http-server.mjs).
  const surfaces = payload.ir ? projectSurfaces(payload.ir) : payload.surfaces!;

  const cfg = await getHostConfig(user.id, id);
  const irServer = payload.ir?.servers?.[0] ?? '';
  const baseUrl = ((body.baseUrl ?? cfg.baseUrl) || irServer).trim();
  const token = await getHostToken(user.id, id);

  if (!tryLockProject(`host:${id}:${kind}`)) return Response.json({ error: 'A host operation is already running for this project.' }, { status: 409 });
  try {
    const result = await startHost({ userId: user.id, project, version, kind, surfaces, baseUrl, token });
    const deployment = result.deploymentId ? await getDeployment(user.id, result.deploymentId) : null;
    if (result.status === 'failed') return Response.json({ error: result.error ?? 'Failed to start the server.', deployment }, { status: 400 });
    return Response.json({ deployment });
  } finally {
    unlockProject(`host:${id}:${kind}`);
  }
}

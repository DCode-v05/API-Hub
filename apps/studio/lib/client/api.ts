import type { RunRequest, StageSourceKind } from '../events';
import type { PatDTO, ProjectRecord, ProjectVersionMeta, RunMeta } from '../records';

/** Thin client wrappers over the studio's REST endpoints. All are best-effort and never throw. */

/* ── Projects (version-controlled inputs) ─────────────────────────────────── */

/** Fired after a project is created/updated/deleted/synced so the sidebar + dashboard refresh. */
export const PROJECTS_CHANGED = 'cn:projects-changed';
export function notifyProjectsChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PROJECTS_CHANGED));
}

export async function fetchProjects(): Promise<ProjectRecord[]> {
  try {
    const res = await fetch('/api/projects', { cache: 'no-store' });
    if (!res.ok) return [];
    return ((await res.json()) as { projects?: ProjectRecord[] }).projects ?? [];
  } catch {
    return [];
  }
}

export async function fetchProject(id: string): Promise<{ project: ProjectRecord; versions: ProjectVersionMeta[] } | null> {
  try {
    const res = await fetch(`/api/projects/${id}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as { project?: ProjectRecord; versions?: ProjectVersionMeta[] };
    return data.project ? { project: data.project, versions: data.versions ?? [] } : null;
  } catch {
    return null;
  }
}

export interface CreateProjectBody {
  name: string;
  kind: StageSourceKind;
  request: RunRequest;
  watchEnabled?: boolean;
  watchIntervalSec?: number;
}

export async function createProject(body: CreateProjectBody): Promise<{ project: ProjectRecord | null; error?: string }> {
  try {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { project?: ProjectRecord; error?: string };
    if (!res.ok) return { project: null, error: data.error ?? `Request failed (HTTP ${res.status})` };
    return { project: data.project ?? null };
  } catch (e) {
    return { project: null, error: e instanceof Error ? e.message : 'Network error' };
  }
}

export interface UpdateProjectBody {
  name?: string;
  watchEnabled?: boolean;
  watchIntervalSec?: number;
}

export async function updateProject(id: string, patch: UpdateProjectBody): Promise<{ project: ProjectRecord | null; error?: string }> {
  try {
    const res = await fetch(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = (await res.json().catch(() => ({}))) as { project?: ProjectRecord; error?: string };
    if (!res.ok) return { project: null, error: data.error ?? `Request failed (HTTP ${res.status})` };
    return { project: data.project ?? null };
  } catch (e) {
    return { project: null, error: e instanceof Error ? e.message : 'Network error' };
  }
}

export async function deleteProject(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}

/** The full stored payload for one version — replayed through payloadToState + RunResults. */
export async function fetchProjectVersion(id: string, version: number): Promise<unknown | null> {
  try {
    const res = await fetch(`/api/projects/${id}/versions/${version}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchRuns(kind?: StageSourceKind, limit = 50): Promise<RunMeta[]> {
  try {
    const q = new URLSearchParams();
    if (kind) q.set('kind', kind);
    q.set('limit', String(limit));
    const res = await fetch(`/api/runs?${q.toString()}`, { cache: 'no-store' });
    if (!res.ok) return [];
    return ((await res.json()) as { runs?: RunMeta[] }).runs ?? [];
  } catch {
    return [];
  }
}

export async function fetchRunPayload(id: string): Promise<unknown | null> {
  try {
    const res = await fetch(`/api/runs/${id}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function removeRun(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/runs/${id}`, { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}

/* ── PAT vault ────────────────────────────────────────────────────────────── */

export async function fetchPats(): Promise<PatDTO[]> {
  try {
    const res = await fetch('/api/pats', { cache: 'no-store' });
    if (!res.ok) return [];
    return ((await res.json()) as { pats?: PatDTO[] }).pats ?? [];
  } catch {
    return [];
  }
}

export async function savePat(name: string, token: string): Promise<PatDTO | null> {
  try {
    const res = await fetch('/api/pats', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, token }),
    });
    if (!res.ok) return null;
    return ((await res.json()) as { pat?: PatDTO }).pat ?? null;
  } catch {
    return null;
  }
}

export async function removePat(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/pats/${id}`, { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}

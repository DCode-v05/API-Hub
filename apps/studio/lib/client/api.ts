import type { RunRequest, StageSourceKind } from '../events';
import type { PatDTO, PresetRecord, RunMeta } from '../records';

/** Thin client wrappers over the studio's REST endpoints. All are best-effort and never throw. */

export async function fetchPresets(kind: StageSourceKind): Promise<PresetRecord[]> {
  try {
    const res = await fetch(`/api/presets?kind=${encodeURIComponent(kind)}`, { cache: 'no-store' });
    if (!res.ok) return [];
    return ((await res.json()) as { presets?: PresetRecord[] }).presets ?? [];
  } catch {
    return [];
  }
}

/** All of the user's presets, across every input kind (for the sidebar). */
export async function fetchAllPresets(): Promise<PresetRecord[]> {
  try {
    const res = await fetch('/api/presets', { cache: 'no-store' });
    if (!res.ok) return [];
    return ((await res.json()) as { presets?: PresetRecord[] }).presets ?? [];
  } catch {
    return [];
  }
}

/** Fired after a preset is saved/deleted so the sidebar list can refresh. */
export const PRESETS_CHANGED = 'cn:presets-changed';
export function notifyPresetsChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PRESETS_CHANGED));
}

export async function savePreset(kind: StageSourceKind, name: string, request: RunRequest): Promise<PresetRecord | null> {
  try {
    const res = await fetch('/api/presets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, name, request }),
    });
    if (!res.ok) return null;
    return ((await res.json()) as { preset?: PresetRecord }).preset ?? null;
  } catch {
    return null;
  }
}

export async function removePreset(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/presets/${id}`, { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
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

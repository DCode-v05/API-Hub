/**
 * In-memory per-project sync locks, shared by the manual-sync route and the background watcher so a
 * project never syncs twice at once. Process-local (kept on globalThis to survive dev hot-reload) —
 * correct for a single self-hosted instance; a multi-instance deployment would use a Postgres
 * advisory lock instead.
 */

const g = globalThis as unknown as { __cnProjectLocks?: Set<string> };

function locks(): Set<string> {
  if (!g.__cnProjectLocks) g.__cnProjectLocks = new Set<string>();
  return g.__cnProjectLocks;
}

/** Acquire the lock; returns false if a sync is already running for this project. */
export function tryLockProject(id: string): boolean {
  const l = locks();
  if (l.has(id)) return false;
  l.add(id);
  return true;
}

export function unlockProject(id: string): void {
  locks().delete(id);
}

export function isProjectLocked(id: string): boolean {
  return locks().has(id);
}

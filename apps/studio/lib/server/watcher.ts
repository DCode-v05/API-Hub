import type { ProjectRecord } from '../records';
import { checkProject } from '../cn/check-project';
import { ensureReady } from './db';
import { tryLockProject, unlockProject } from './project-locks';
import { listDueWatchedProjects } from './store';

const TICK_MS = 60_000;
const MAX_CONCURRENT = 2;
const DUE_LIMIT = 20;

interface WatcherGlobal {
  __cnWatcher?: { timer: ReturnType<typeof setInterval> };
  __cnWatcherTicking?: boolean;
}
const g = globalThis as unknown as WatcherGlobal;

export function startWatcher(): void {
  if (g.__cnWatcher) return;
  const timer = setInterval(() => void tick(), TICK_MS);
  if (typeof timer.unref === 'function') timer.unref();
  g.__cnWatcher = { timer };
}

export function stopWatcher(): void {
  if (g.__cnWatcher) {
    clearInterval(g.__cnWatcher.timer);
    g.__cnWatcher = undefined;
  }
}

async function tick(): Promise<void> {
  if (g.__cnWatcherTicking) return;
  g.__cnWatcherTicking = true;
  try {
    await ensureReady();
    const due = await listDueWatchedProjects(DUE_LIMIT);
    if (due.length === 0) return;
    let i = 0;
    const workers = Array.from({ length: Math.min(MAX_CONCURRENT, due.length) }, async () => {
      for (;;) {
        const project = due[i++];
        if (!project) break;
        await runOne(project);
      }
    });
    await Promise.all(workers);
  } catch {
  } finally {
    g.__cnWatcherTicking = false;
  }
}

async function runOne(project: ProjectRecord): Promise<void> {
  if (!tryLockProject(project.id)) return;
  try {
    await checkProject(project, { trigger: 'watch' });
  } catch {
  } finally {
    unlockProject(project.id);
  }
}

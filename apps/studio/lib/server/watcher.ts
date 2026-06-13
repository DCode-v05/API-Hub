import type { ProjectRecord } from '../records';
import { checkProject } from '../cn/check-project';
import { ensureReady } from './db';
import { tryLockProject, unlockProject } from './project-locks';
import { listDueWatchedProjects } from './store';

/**
 * The self-hosted auto-sync engine. Started once from instrumentation.ts on server boot (Node
 * runtime only). Every tick it picks up watched projects whose interval has elapsed, re-acquires
 * each source, and appends a new version when the content hash moved — the doc's regeneration loop
 * (§I.6 / §II.2) run as a standing in-process service. Heavy work is deferred to the first tick so
 * boot stays cheap and a momentarily-down DB doesn't crash startup.
 */

const TICK_MS = 60_000;
const MAX_CONCURRENT = 2; // a tick ≈ a real acquire (git clone / URL fetch); keep it gentle
const DUE_LIMIT = 20;

interface WatcherGlobal {
  __cnWatcher?: { timer: ReturnType<typeof setInterval> };
  __cnWatcherTicking?: boolean;
}
const g = globalThis as unknown as WatcherGlobal;

export function startWatcher(): void {
  if (g.__cnWatcher) return; // already running — survives dev hot-reload / module re-eval
  const timer = setInterval(() => void tick(), TICK_MS);
  if (typeof timer.unref === 'function') timer.unref(); // never block process exit
  g.__cnWatcher = { timer };
}

export function stopWatcher(): void {
  if (g.__cnWatcher) {
    clearInterval(g.__cnWatcher.timer);
    g.__cnWatcher = undefined;
  }
}

async function tick(): Promise<void> {
  if (g.__cnWatcherTicking) return; // a prior tick is still running (slow sources) — skip this one
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
    /* never throw out of the watcher loop */
  } finally {
    g.__cnWatcherTicking = false;
  }
}

async function runOne(project: ProjectRecord): Promise<void> {
  if (!tryLockProject(project.id)) return; // a manual sync (or another worker) already has it
  try {
    await checkProject(project, { trigger: 'watch' });
  } catch {
    /* checkProject records its own failures; swallow anything unexpected */
  } finally {
    unlockProject(project.id);
  }
}

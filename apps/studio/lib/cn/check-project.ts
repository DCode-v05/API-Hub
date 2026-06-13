import type { Ir } from '@cn/contracts';
import type { RunEvent } from '../events';
import type { CheckOutcome, ProjectRecord, ProjectTrigger } from '../records';
import type { RunPayload } from '../run-payload';
import {
  appendProjectVersion,
  getPatToken,
  getProjectVersionPayload,
  updateProjectCheck,
} from '../server/store';
import { buildSourceFromRequest } from './sources';
import { diffIr } from './diff';
import { buildRunPayload } from './payload';
import { executePipeline } from './pipeline';

/**
 * The shared sync core, used by BOTH the manual "Sync now" SSE route (pass `emit` for the live
 * funnel) and the background watcher (no emit, headless). It re-acquires the project's source,
 * decides whether anything changed (by content hash), and on change appends a new version with a
 * diff summary. It never throws — every failure is recorded on the project row and returned.
 */

export interface CheckOptions {
  trigger: ProjectTrigger;
  /** When provided, the pipeline's SSE RunEvents are forwarded (manual sync → live funnel). */
  emit?: (e: RunEvent) => void;
  signal?: AbortSignal;
}

export async function checkProject(project: ProjectRecord, opts: CheckOptions): Promise<CheckOutcome> {
  const manual = !!opts.emit;

  // 1. Resolve auth. GitHub projects re-fetch via a saved PAT (raw tokens are never stored).
  const request: typeof project.request = { ...project.request };
  if (project.kind === 'github') {
    if (!project.patId) return preFail(project, 'No saved PAT linked — re-link a token to sync this project.', opts.emit);
    const token = await getPatToken(project.userId, project.patId);
    if (!token) return preFail(project, 'GitHub token unavailable — re-add the PAT and try again.', opts.emit);
    request.pat = token;
  }

  // 2. Build the source. Watchable inputs (URL/path/github) don't write temp files; cleanup anyway.
  const built = await buildSourceFromRequest(request);
  if ('error' in built) return preFail(project, built.error, opts.emit);

  try {
    // 3a. Watch tick: fingerprint first; skip codegen when the content hash hasn't moved.
    if (!manual) {
      const probe = await executePipeline(built.source, { acquireOnly: true, signal: opts.signal });
      if (probe.error || !probe.acquire) {
        await recordError(project, probe.error?.message ?? 'Acquire failed.');
        return { status: 'error', message: probe.error?.message ?? 'Acquire failed.' };
      }
      if (project.latestVersion > 0 && probe.acquire.contentHash === project.latestContentHash) {
        await updateProjectCheck(project.userId, project.id, { lastStatus: 'unchanged' });
        return { status: 'unchanged', contentHash: probe.acquire.contentHash };
      }
    }

    // 3b. Full run. Manual streams the funnel (emit + stagger); watch runs silent.
    const result = await executePipeline(built.source, { emit: opts.emit, signal: opts.signal, stagger: manual });
    if (opts.signal?.aborted) return { status: 'error', message: 'Sync aborted.' };
    if (result.error || !result.acquire || !result.ir) {
      // executePipeline already emitted error+done on the stream — just record the outcome.
      const message = result.error?.message ?? 'Pipeline failed.';
      await recordError(project, message);
      return { status: 'error', message };
    }

    // Manual path can also discover "nothing actually changed" — record, don't create a version.
    if (project.latestVersion > 0 && result.acquire.contentHash === project.latestContentHash) {
      await updateProjectCheck(project.userId, project.id, { lastStatus: 'unchanged' });
      return { status: 'unchanged', contentHash: result.acquire.contentHash };
    }

    // 4. Persist a new version with a diff against the previous one.
    const prev = await loadPrevious(project);
    const fileCount = result.surfaces?.reduce((n, s) => n + s.files.length, 0) ?? 0;
    const summary = diffIr(prev.ir, result.ir, prev.fileCount, fileCount);
    const { meta, payload } = buildRunPayload({ userId: project.userId, request, result });
    const version = await appendProjectVersion(project.userId, project.id, {
      version: project.latestVersion + 1,
      irHash: result.ir.hash,
      contentHash: result.acquire.contentHash,
      sha: result.acquire.sha,
      ok: result.ok,
      valid: result.ingest?.valid ?? false,
      opCount: result.ir.operations.length,
      fileCount,
      errorCount: meta.errorCount,
      warningCount: meta.warningCount,
      summary,
      trigger: opts.trigger,
      payload,
    });
    return { status: 'changed', version };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await recordError(project, message);
    return { status: 'error', message };
  } finally {
    await built.cleanup?.();
  }
}

async function loadPrevious(project: ProjectRecord): Promise<{ ir?: Ir; fileCount: number }> {
  if (project.latestVersion <= 0) return { fileCount: 0 };
  const payload = (await getProjectVersionPayload(project.userId, project.id, project.latestVersion)) as RunPayload | null;
  if (!payload) return { fileCount: 0 };
  const fileCount = payload.surfaces?.reduce((n, s) => n + s.files.length, 0) ?? 0;
  return { ir: payload.ir, fileCount };
}

async function recordError(project: ProjectRecord, message: string): Promise<void> {
  await updateProjectCheck(project.userId, project.id, { lastStatus: 'error', lastError: message });
}

/** A failure before the pipeline ran — emit error+done so the live funnel shows it, and record it. */
async function preFail(project: ProjectRecord, message: string, emit?: (e: RunEvent) => void): Promise<CheckOutcome> {
  await recordError(project, message);
  emit?.({ t: 'error', stage: 'input', message });
  emit?.({ t: 'done', ok: false, ms: 0 });
  return { status: 'error', message };
}

import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { runPipeline } from '@/lib/cn/runner';
import { buildSourceFromRequest } from '@/lib/cn/sources';
import type { DiagnosticDTO, ProposalDTO, RunEvent, RunRequest, StageSourceKind, SurfaceDTO } from '@/lib/events';
import type { RunMeta } from '@/lib/records';
import { getCurrentUser } from '@/lib/server/session';
import { getPatToken, saveRun } from '@/lib/server/store';
import type { Ir } from '@cn/contracts';

// The pipeline uses git/child_process/fs and the TypeScript compiler — Node runtime only.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

interface AcquireAcc {
  trust: 'declared' | 'inferred';
  sourceType: string;
  origin: string;
  sha: string | null;
  contentHash: string;
  operationCount: number;
  diagnostics: DiagnosticDTO[];
}

interface Accumulator {
  source?: { kind: StageSourceKind; describe: string; label: string };
  acquire?: AcquireAcc;
  ingest?: { valid: boolean; diagnostics: DiagnosticDTO[]; proposals: ProposalDTO[] };
  ir?: Ir;
  surfaces?: SurfaceDTO[];
  error?: { stage: string; message: string };
  done?: { ok: boolean; ms: number };
}

function severityCounts(acc: Accumulator): { error: number; warning: number } {
  const all = [...(acc.acquire?.diagnostics ?? []), ...(acc.ingest?.diagnostics ?? [])];
  return {
    error: all.filter((d) => d.severity === 'error').length,
    warning: all.filter((d) => d.severity === 'warning').length,
  };
}

async function persist(userId: string, req: RunRequest, acc: Accumulator): Promise<void> {
  if (!acc.source) return; // never reached acquire — nothing worth recording
  const counts = severityCounts(acc);
  const meta: RunMeta = {
    id: randomUUID(),
    userId,
    kind: acc.source.kind,
    label: acc.source.label || acc.source.kind,
    describe: acc.source.describe,
    ok: acc.done?.ok ?? false,
    valid: acc.ingest?.valid ?? false,
    totalMs: acc.done?.ms ?? 0,
    opCount: acc.ir?.operations.length ?? acc.acquire?.operationCount ?? 0,
    irHash: acc.ir?.hash ?? '',
    fileCount: acc.surfaces?.reduce((n, s) => n + s.files.length, 0) ?? 0,
    errorCount: counts.error + (acc.error ? 1 : 0),
    warningCount: counts.warning,
    proposalCount: acc.ingest?.proposals.length ?? 0,
    createdAt: new Date().toISOString(),
  };
  // Strip the PAT before anything is written to disk.
  const { pat: _pat, ...safeReq } = req;
  const payload = {
    meta,
    request: safeReq,
    source: acc.source,
    acquire: acc.acquire,
    ingest: acc.ingest,
    ir: acc.ir,
    surfaces: acc.surfaces,
    error: acc.error,
  };
  try {
    await saveRun(meta, payload);
  } catch {
    /* persistence is best-effort — never break the response over it */
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  let body: RunRequest;
  try {
    body = (await req.json()) as RunRequest;
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  const encoder = new TextEncoder();
  const ac = new AbortController();
  const acc: Accumulator = {};

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: RunEvent): void => {
        // Mirror each event into the accumulator so the run can be persisted on completion.
        switch (event.t) {
          case 'start':
            acc.source = event.source;
            break;
          case 'acquire':
            acc.acquire = {
              trust: event.trust,
              sourceType: event.sourceType,
              origin: event.origin,
              sha: event.sha,
              contentHash: event.contentHash,
              operationCount: event.operationCount,
              diagnostics: event.diagnostics,
            };
            break;
          case 'ingest':
            acc.ingest = { valid: event.valid, diagnostics: event.diagnostics, proposals: event.proposals };
            break;
          case 'build':
            acc.ir = event.ir;
            break;
          case 'project':
            acc.surfaces = event.surfaces;
            break;
          case 'error':
            acc.error = { stage: String(event.stage), message: event.message };
            break;
          case 'done':
            acc.done = { ok: event.ok, ms: event.ms };
            break;
        }
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          /* stream closed */
        }
      };

      let built: Awaited<ReturnType<typeof buildSourceFromRequest>> | undefined;
      try {
        if (!body || typeof body !== 'object') {
          send({ t: 'error', stage: 'input', message: 'Invalid request body — expected a JSON object.' });
          send({ t: 'done', ok: false, ms: 0 });
          return;
        }
        // Resolve a saved PAT (referenced by id) to a real token — server-side, for this user only.
        if (body.kind === 'github' && body.patId && !body.pat?.trim()) {
          const token = await getPatToken(user.id, body.patId);
          if (token) body.pat = token;
        }
        built = await buildSourceFromRequest(body);
        if ('error' in built) {
          send({ t: 'error', stage: 'input', message: built.error });
          send({ t: 'done', ok: false, ms: 0 });
          return;
        }
        await runPipeline(built.source, send, ac.signal);
        // Record the run (skipped automatically if the client aborted before acquire).
        if (!ac.signal.aborted) await persist(user.id, body, acc);
      } catch (e) {
        send({ t: 'error', stage: 'input', message: e instanceof Error ? e.message : String(e) });
        send({ t: 'done', ok: false, ms: 0 });
      } finally {
        if (built && 'cleanup' in built && built.cleanup) await built.cleanup();
        controller.close();
      }
    },
    cancel() {
      ac.abort();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

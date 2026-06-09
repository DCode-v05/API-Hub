'use client';

import * as React from 'react';
import { Binary, Check, DownloadCloud, Share2, Wand2, X } from 'lucide-react';
import { STAGES, type StageId } from '@/lib/events';
import type { RunState, StageStatus } from '@/lib/state';
import { cx, fmtMs } from '@/lib/ui';
import { Badge, Card, CardContent, CardHeader, CardTitle, Spinner } from './ui';

const STAGE_META: Record<StageId, { name: string; desc: string; Icon: React.ComponentType<{ className?: string }> }> = {
  acquire: { name: 'Acquire', desc: 'fetch · pin · bundle', Icon: DownloadCloud },
  ingest: { name: 'Ingest', desc: 'adapt · validate · repair', Icon: Wand2 },
  build: { name: 'Build IR', desc: 'normalize · content-hash', Icon: Binary },
  project: { name: 'Project', desc: 'SDK · MCP · CLI · docs', Icon: Share2 },
};

function StatusRing({ status, Icon }: { status: StageStatus; Icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div
      className={cx(
        'relative flex h-11 w-11 items-center justify-center rounded-full border transition-colors',
        status === 'pending' && 'border-border bg-muted text-muted-foreground',
        status === 'running' && 'border-accent/40 bg-accent/10 text-accent animate-pulse-ring',
        status === 'done' && 'border-success/40 bg-success/10 text-success',
        status === 'error' && 'border-danger/40 bg-danger/10 text-danger',
      )}
    >
      {status === 'running' ? <Spinner className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
      {status === 'done' && (
        <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-success text-white">
          <Check className="h-2.5 w-2.5" strokeWidth={3} />
        </span>
      )}
      {status === 'error' && (
        <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-white">
          <X className="h-2.5 w-2.5" strokeWidth={3} />
        </span>
      )}
    </div>
  );
}

function Connector({ filled }: { filled: boolean }) {
  return (
    <div className="mx-1 mt-5 hidden h-px flex-1 self-start bg-border sm:block">
      <div className={cx('h-full bg-success transition-all duration-500', filled ? 'w-full' : 'w-0')} />
    </div>
  );
}

function liveLine(state: RunState): string {
  if (state.status === 'idle') return 'Idle — pick a source and run.';
  if (state.error) return state.error.message;
  if (state.status === 'done') return `Done in ${fmtMs(state.totalMs ?? 0)} · ${state.surfaces?.reduce((n, s) => n + s.files.length, 0) ?? 0} files generated`;
  return state.logLine ?? 'Running…';
}

export function PipelineView({ state }: { state: RunState }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <CardTitle className="shrink-0">Pipeline</CardTitle>
          {state.describe ? (
            <span className="min-w-0 truncate font-mono text-xs text-muted-foreground" title={state.describe}>
              {state.describe}
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {state.acquire ? (
            <Badge variant={state.acquire.trust === 'declared' ? 'success' : 'warning'}>{state.acquire.trust}</Badge>
          ) : null}
          {state.totalMs != null ? <span className="font-mono text-xs text-muted-foreground">{fmtMs(state.totalMs)}</span> : null}
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex flex-wrap items-start gap-y-4 sm:flex-nowrap">
          {STAGES.map((id, i) => {
            const meta = STAGE_META[id];
            const st = state.stages[id].status;
            const ms = state.stages[id].ms;
            return (
              <React.Fragment key={id}>
                <div className="flex w-1/2 flex-col items-center gap-2 text-center sm:w-auto sm:flex-1">
                  <StatusRing status={st} Icon={meta.Icon} />
                  <div>
                    <div className="text-[13px] font-semibold">{meta.name}</div>
                    <div className="text-[11px] text-muted-foreground">{meta.desc}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                      {st === 'done' && ms != null ? fmtMs(ms) : st === 'running' ? '…' : st === 'error' ? 'failed' : ''}
                    </div>
                  </div>
                </div>
                {i < STAGES.length - 1 ? <Connector filled={st === 'done'} /> : null}
              </React.Fragment>
            );
          })}
        </div>

        <div className="mt-5 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
          {state.status === 'running' ? (
            <Spinner className="h-3.5 w-3.5 shrink-0 text-accent" />
          ) : state.ok ? (
            <Check className="h-3.5 w-3.5 shrink-0 text-success" />
          ) : state.error ? (
            <X className="h-3.5 w-3.5 shrink-0 text-danger" />
          ) : (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
          )}
          <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">{liveLine(state)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

'use client';

import * as React from 'react';
import { Play, RotateCcw } from 'lucide-react';
import type { RunRequest, StageSourceKind } from '@/lib/events';
import { useRun } from '@/lib/useRun';
import { Badge, Button, Spinner } from '@/components/ui';
import { CliCommand } from '@/components/run/CliCommand';
import { PresetBar } from '@/components/run/PresetBar';
import { RecentRuns } from '@/components/run/RecentRuns';
import { RunResults } from '@/components/run/RunResults';

export function InputWorkspace({
  kind,
  title,
  description,
  Icon,
  trust,
  request,
  runnable,
  invalidHint,
  onLoadPreset,
  children,
}: {
  kind: StageSourceKind;
  title: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
  trust: 'declared' | 'inferred';
  request: RunRequest;
  runnable: boolean;
  invalidHint?: string;
  onLoadPreset: (req: RunRequest) => void;
  children: React.ReactNode;
}) {
  const { state, running, run, reset } = useRun();
  const [reload, setReload] = React.useState(0);
  const active = state.status !== 'idle';

  async function onRun() {
    await run(request);
    setReload((r) => r + 1); // refresh "recent runs" once the run is persisted
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      {/* Header */}
      <header className="mb-6 flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/40 text-foreground">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            <Badge variant={trust === 'declared' ? 'success' : 'warning'}>{trust} trust</Badge>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Main column */}
        <div className="min-w-0 space-y-5">
          <div className="rounded-lg border border-border bg-card p-5">{children}</div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="lg" onClick={onRun} disabled={!runnable || running}>
              {running ? (
                <>
                  <Spinner className="h-4 w-4" />
                  Running pipeline…
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Run pipeline
                </>
              )}
            </Button>
            {active ? (
              <Button size="lg" variant="outline" onClick={reset} disabled={running}>
                <RotateCcw className="h-4 w-4" />
                Clear
              </Button>
            ) : null}
            {!runnable && invalidHint ? <span className="text-xs text-muted-foreground">{invalidHint}</span> : null}
          </div>

          <CliCommand request={request} />

          {/* The pipeline is shown ONLY once a run has started. */}
          {active ? <RunResults state={state} /> : null}
        </div>

        {/* Right rail */}
        <aside className="space-y-5">
          <PresetBar kind={kind} request={request} onLoad={onLoadPreset} />
          <RecentRuns kind={kind} reloadToken={reload} />
        </aside>
      </div>
    </div>
  );
}

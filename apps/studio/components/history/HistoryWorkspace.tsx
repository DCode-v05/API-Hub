'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, FileJson, Github, Loader2, Package, Plug, Trash2, X } from 'lucide-react';
import type { StageSourceKind } from '@/lib/events';
import type { RunMeta } from '@/lib/records';
import { fetchRunPayload, fetchRuns, removeRun } from '@/lib/client/api';
import { payloadToState, type RunPayload } from '@/lib/run-payload';
import { timeAgo } from '@/lib/time';
import { cx } from '@/lib/ui';
import { RunResults } from '@/components/run/RunResults';

const KIND_ICON: Record<StageSourceKind, React.ComponentType<{ className?: string }>> = {
  github: Github,
  openapi: FileJson,
  sdk: Package,
  mcp: Plug,
};

const FILTERS: { value: StageSourceKind | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'github', label: 'GitHub' },
  { value: 'openapi', label: 'OpenAPI' },
  { value: 'sdk', label: 'SDK' },
  { value: 'mcp', label: 'MCP' },
];

export function HistoryWorkspace() {
  const params = useSearchParams();
  const deepLink = params.get('run');

  const [filter, setFilter] = React.useState<StageSourceKind | 'all'>('all');
  const [runs, setRuns] = React.useState<RunMeta[] | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(deepLink);
  const [payload, setPayload] = React.useState<RunPayload | null>(null);
  const [loading, setLoading] = React.useState(false);

  const reload = React.useCallback(async () => {
    const list = await fetchRuns(filter === 'all' ? undefined : filter, 100);
    setRuns(list);
  }, [filter]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const select = React.useCallback(async (id: string) => {
    setSelectedId(id);
    setLoading(true);
    setPayload(null);
    const data = (await fetchRunPayload(id)) as RunPayload | null;
    setPayload(data);
    setLoading(false);
  }, []);

  // Open the deep-linked run once.
  const opened = React.useRef(false);
  React.useEffect(() => {
    if (deepLink && !opened.current) {
      opened.current = true;
      void select(deepLink);
    }
  }, [deepLink, select]);

  async function del(id: string) {
    const ok = await removeRun(id);
    if (!ok) return;
    if (selectedId === id) {
      setSelectedId(null);
      setPayload(null);
    }
    void reload();
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Run history</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every pipeline run, with its diagnostics, IR, and generated surfaces. Replay any of them.</p>
      </header>

      <div className="mb-5 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={cx(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              filter === f.value ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        {/* List */}
        <div className="space-y-1.5">
          {runs === null ? (
            <p className="px-1 py-6 text-sm text-muted-foreground">Loading…</p>
          ) : runs.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              No runs yet. Run the pipeline from any input page.
            </p>
          ) : (
            runs.map((r) => {
              const Icon = KIND_ICON[r.kind];
              const active = r.id === selectedId;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => select(r.id)}
                  className={cx(
                    'group flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                    active ? 'border-foreground/25 bg-muted/60' : 'border-border bg-card hover:bg-muted/40',
                  )}
                >
                  <span
                    className={cx(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                      r.ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger',
                    )}
                  >
                    {r.ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate font-mono text-[13px] text-foreground">{r.label}</span>
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {r.ok ? `${r.opCount} ops · ${r.fileCount} files` : 'failed'} · {timeAgo(r.createdAt)}
                    </span>
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      void del(r.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        void del(r.id);
                      }
                    }}
                    className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                    aria-label={`Delete run ${r.label}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Detail */}
        <div className="min-w-0">
          {loading ? (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading run…
            </div>
          ) : payload ? (
            <RunResults state={payloadToState(payload)} />
          ) : (
            <div className="flex h-full min-h-[260px] items-center justify-center rounded-lg border border-dashed border-border px-4 py-16 text-center text-sm text-muted-foreground">
              Select a run to replay its pipeline, IR, and surfaces.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

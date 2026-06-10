'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Clock, X } from 'lucide-react';
import type { StageSourceKind } from '@/lib/events';
import type { RunMeta } from '@/lib/records';
import { fetchRuns } from '@/lib/client/api';
import { timeAgo } from '@/lib/time';

export function RecentRuns({ kind, reloadToken = 0 }: { kind?: StageSourceKind; reloadToken?: number }) {
  const [runs, setRuns] = React.useState<RunMeta[] | null>(null);

  React.useEffect(() => {
    let alive = true;
    fetchRuns(kind, 6).then((r) => alive && setRuns(r));
    return () => {
      alive = false;
    };
  }, [kind, reloadToken]);

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-1.5 text-[13px] font-semibold">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          Recent runs
        </div>
        <Link href="/history" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          All <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="p-2">
        {runs === null ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">Loading…</p>
        ) : runs.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">No runs yet. Run the pipeline to see history here.</p>
        ) : (
          <ul className="space-y-0.5">
            {runs.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/history?run=${r.id}`}
                  className="flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50"
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                      r.ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
                    }`}
                  >
                    {r.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-xs text-foreground">{r.label}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {r.ok ? `${r.opCount} ops · ${r.fileCount} files` : 'failed'} · {timeAgo(r.createdAt)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

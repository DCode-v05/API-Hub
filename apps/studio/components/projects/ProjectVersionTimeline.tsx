'use client';

import { Check, X } from 'lucide-react';
import type { ProjectVersionMeta } from '@/lib/records';
import { severityLabel, severityTone } from '@/lib/project-display';
import { timeAgo } from '@/lib/time';
import { cx } from '@/lib/ui';
import { Badge } from '@/components/ui';

const TRIGGER_LABEL: Record<ProjectVersionMeta['trigger'], string> = {
  initial: 'initial',
  manual: 'manual',
  watch: 'auto',
};

/** The version history rail. Newest first; click a version to replay its surfaces on the right. */
export function ProjectVersionTimeline({
  versions,
  selected,
  onSelect,
}: {
  versions: ProjectVersionMeta[];
  selected: number | null;
  onSelect: (version: number) => void;
}) {
  if (versions.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        No versions yet. Click <span className="font-medium text-foreground">Sync now</span> to build the first one.
      </p>
    );
  }
  return (
    <ol className="space-y-1.5">
      {versions.map((v) => {
        const active = v.version === selected;
        return (
          <li key={v.id}>
            <button
              type="button"
              onClick={() => onSelect(v.version)}
              className={cx(
                'w-full rounded-lg border px-3 py-2.5 text-left transition-colors',
                active ? 'border-foreground/25 bg-muted/60' : 'border-border bg-card hover:bg-muted/40',
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cx(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                    v.ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger',
                  )}
                >
                  {v.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                </span>
                <span className="font-mono text-[13px] font-semibold text-foreground">v{v.version}</span>
                <Badge variant={severityTone(v.summary.severity)} className="shrink-0">
                  {severityLabel(v.summary.severity)}
                </Badge>
                <span className="ml-auto shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground/70">{TRIGGER_LABEL[v.trigger]}</span>
              </div>
              <p className="mt-1.5 truncate text-xs text-muted-foreground">{v.summary.note}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground/60">
                {v.opCount} ops · {v.fileCount} files · {timeAgo(v.createdAt)}
              </p>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, FolderGit2, Loader2, Lock, X } from 'lucide-react';
import type { RunRequest, StageSourceKind } from '@/lib/events';
import { createProject, notifyProjectsChanged } from '@/lib/client/api';
import { isWatchable } from '@/lib/cn/watchable';
import { WATCH_INTERVALS } from '@/lib/project-display';
import { cx } from '@/lib/ui';
import { Input } from '@/components/ui';

/**
 * Replaces the old presets bar at the top of each input form. Saves the current input as a
 * version-controlled Project (mandatory name + optional auto-watch). Only re-fetchable sources
 * qualify — for pasted/stdio inputs the action is disabled with the reason from `isWatchable`.
 */
export function SaveProjectButton({ kind, request }: { kind: StageSourceKind; request: RunRequest }) {
  const router = useRouter();
  const watch = isWatchable(request);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [watchEnabled, setWatchEnabled] = React.useState(false);
  const [intervalSec, setIntervalSec] = React.useState(900);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function save() {
    if (busy) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Project name is required.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await createProject({ name: trimmed, kind, request, watchEnabled, watchIntervalSec: intervalSec });
    setBusy(false);
    if (!res.project) {
      setError(res.error ?? 'Could not create project.');
      return;
    }
    notifyProjectsChanged();
    router.push(`/projects/${res.project.id}`);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <FolderGit2 className="h-3.5 w-3.5" />
          Project
        </span>
        <span className="text-xs text-muted-foreground/70">— track this source &amp; auto-regenerate on change</span>

        <div className="ml-auto">
          {watch.ok ? (
            <button
              type="button"
              onClick={() => {
                setOpen((o) => !o);
                setError(null);
              }}
              className={cx(
                'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                open ? 'border-foreground/25 bg-muted text-foreground' : 'border-border text-muted-foreground hover:border-foreground/25 hover:text-foreground',
              )}
            >
              <FolderGit2 className="h-3.5 w-3.5" />
              Save as Project
            </button>
          ) : (
            <span
              title={watch.reason}
              className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-1 text-xs font-medium text-muted-foreground/60"
            >
              <Lock className="h-3.5 w-3.5" />
              Save as Project
            </span>
          )}
        </div>
      </div>

      {!watch.ok ? <p className="mt-2 text-xs text-muted-foreground">{watch.reason}</p> : null}

      {open && watch.ok ? (
        <div className="mt-3 space-y-3 rounded-md border border-border bg-muted/20 p-3">
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-foreground">
              Project name <span className="text-danger">*</span>
            </label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void save();
                } else if (e.key === 'Escape') {
                  setOpen(false);
                }
              }}
              placeholder="e.g. Lumen API"
            />
          </div>

          <label className="flex items-start gap-2.5">
            <input
              type="checkbox"
              checked={watchEnabled}
              onChange={(e) => setWatchEnabled(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-foreground"
            />
            <span className="text-[13px] leading-tight">
              <span className="font-medium text-foreground">Auto-sync</span>
              <span className="block text-xs text-muted-foreground">Re-check the source on a schedule and create a new version when it changes.</span>
            </span>
          </label>

          {watchEnabled ? (
            <select
              value={intervalSec}
              onChange={(e) => setIntervalSec(Number(e.target.value))}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground focus:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-ring/15"
            >
              {WATCH_INTERVALS.map((it) => (
                <option key={it.value} value={it.value}>
                  {it.label}
                </option>
              ))}
            </select>
          ) : null}

          {error ? <p className="text-xs text-danger">{error}</p> : null}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-[13px] font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Create project
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

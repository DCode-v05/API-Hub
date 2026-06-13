'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Check, Loader2, Pencil, RefreshCw, Trash2, X } from 'lucide-react';
import type { RunEvent } from '@/lib/events';
import type { ProjectRecord, ProjectVersionMeta } from '@/lib/records';
import {
  deleteProject,
  fetchProject,
  fetchProjectVersion,
  notifyProjectsChanged,
  updateProject,
} from '@/lib/client/api';
import { syncProject } from '@/lib/run-client';
import { INITIAL_RUN, reduce, type RunState } from '@/lib/state';
import { payloadToState, type RunPayload } from '@/lib/run-payload';
import { KIND_ICON, KIND_LABEL, WATCH_INTERVALS, describeRequest, formatInterval, statusMeta } from '@/lib/project-display';
import { timeAgo } from '@/lib/time';
import { cx } from '@/lib/ui';
import { Badge, Button, Input, Spinner } from '@/components/ui';
import { RunResults } from '@/components/run/RunResults';
import { ProjectVersionTimeline } from './ProjectVersionTimeline';

type Action = RunEvent | { t: 'reset' };
function runReducer(state: RunState, action: Action): RunState {
  return action.t === 'reset' ? INITIAL_RUN : reduce(state, action);
}

type Banner = { tone: 'success' | 'muted' | 'danger'; text: string };

export function ProjectDetail({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [project, setProject] = React.useState<ProjectRecord | null>(null);
  const [versions, setVersions] = React.useState<ProjectVersionMeta[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);

  const [runState, dispatch] = React.useReducer(runReducer, INITIAL_RUN);
  const [syncing, setSyncing] = React.useState(false);
  const [banner, setBanner] = React.useState<Banner | null>(null);
  const acRef = React.useRef<AbortController | null>(null);

  const [selected, setSelected] = React.useState<number | null>(null);
  const [payload, setPayload] = React.useState<RunPayload | null>(null);
  const [payloadLoading, setPayloadLoading] = React.useState(false);

  const refresh = React.useCallback(async () => {
    const data = await fetchProject(projectId);
    if (!data) {
      setNotFound(true);
      return;
    }
    setProject(data.project);
    setVersions(data.versions);
  }, [projectId]);

  React.useEffect(() => {
    let alive = true;
    void fetchProject(projectId).then((data) => {
      if (!alive) return;
      if (!data) setNotFound(true);
      else {
        setProject(data.project);
        setVersions(data.versions);
        if (data.versions[0]) setSelected(data.versions[0].version);
      }
      setLoading(false);
    });
    return () => {
      alive = false;
      acRef.current?.abort();
    };
  }, [projectId]);

  // Load the selected version's payload for replay.
  React.useEffect(() => {
    if (selected == null) {
      setPayload(null);
      return;
    }
    let alive = true;
    setPayloadLoading(true);
    setPayload(null);
    void fetchProjectVersion(projectId, selected).then((p) => {
      if (!alive) return;
      setPayload(p as RunPayload | null);
      setPayloadLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [projectId, selected]);

  async function sync() {
    if (syncing) return;
    setSyncing(true);
    setSelected(null); // surrender the right pane to the live funnel
    setBanner(null);
    dispatch({ t: 'reset' });
    const ac = new AbortController();
    acRef.current = ac;
    try {
      await syncProject(
        projectId,
        (e) => {
          if (e.t === 'version') {
            const o = e.outcome;
            if (o.status === 'changed') setBanner({ tone: 'success', text: `Created v${o.version.version} — ${o.version.summary.note}` });
            else if (o.status === 'unchanged') setBanner({ tone: 'muted', text: 'No changes — already up to date.' });
            else setBanner({ tone: 'danger', text: o.message });
            void refresh().then(() => notifyProjectsChanged());
          } else {
            dispatch(e);
          }
        },
        ac.signal,
      );
    } catch (err) {
      setBanner({ tone: 'danger', text: err instanceof Error ? err.message : 'Sync failed.' });
    } finally {
      setSyncing(false);
      acRef.current = null;
    }
  }

  async function patch(p: { name?: string; watchEnabled?: boolean; watchIntervalSec?: number }) {
    const res = await updateProject(projectId, p);
    if (res.project) {
      setProject(res.project);
      notifyProjectsChanged();
    } else {
      setBanner({ tone: 'danger', text: res.error ?? 'Update failed.' });
    }
  }

  async function remove() {
    if (!confirm('Delete this project and all its versions? This cannot be undone.')) return;
    const ok = await deleteProject(projectId);
    if (ok) {
      notifyProjectsChanged();
      router.push('/projects');
    }
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-5 py-16 text-sm text-muted-foreground sm:px-8">
        <Spinner className="h-4 w-4" /> Loading project…
      </div>
    );
  }
  if (notFound || !project) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <p className="text-sm text-muted-foreground">Project not found.</p>
        <Link href="/projects" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to projects
        </Link>
      </div>
    );
  }

  const Icon = KIND_ICON[project.kind];
  const status = statusMeta(project.lastStatus);
  const showLive = selected == null && runState.status !== 'idle';

  return (
    // On lg+ the page becomes a fixed-height panel: the header/watch bar stays put and the two
    // columns below (Versions + pipeline output) each scroll on their own. Below lg it stacks and
    // the page scrolls normally.
    <div className="mx-auto max-w-6xl px-5 py-6 sm:px-8 lg:flex lg:h-[calc(100dvh-3.5rem)] lg:flex-col lg:overflow-hidden lg:py-0">
      <div className="lg:shrink-0 lg:pt-6">
      <Link href="/projects" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Projects
      </Link>

      {/* Header */}
      <header className="mt-3 flex flex-wrap items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/40 text-foreground">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <NameEditor name={project.name} onSave={(name) => patch({ name })} latestVersion={project.latestVersion} />
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{KIND_LABEL[project.kind]}</span>
            <span className="text-muted-foreground/40">·</span>
            <span className="truncate font-mono">{describeRequest(project.request)}</span>
            <span className="text-muted-foreground/40">·</span>
            <span className="inline-flex items-center gap-1.5">
              <span className={cx('h-1.5 w-1.5 rounded-full', toneDot(status.tone))} />
              {status.label}
              {project.lastCheckedAt ? <span className="text-muted-foreground/50">· {timeAgo(project.lastCheckedAt)}</span> : null}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => void sync()} disabled={syncing}>
            {syncing ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
            {syncing ? 'Syncing…' : 'Sync now'}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => void remove()} aria-label="Delete project" title="Delete project">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Watch controls */}
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <WatchToggle enabled={project.watchEnabled} onChange={(v) => void patch({ watchEnabled: v })} />
        <div className="h-5 w-px bg-border" />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Check
          <select
            value={project.watchIntervalSec}
            onChange={(e) => void patch({ watchIntervalSec: Number(e.target.value) })}
            disabled={!project.watchEnabled}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-ring/15 disabled:opacity-50"
          >
            {WATCH_INTERVALS.map((it) => (
              <option key={it.value} value={it.value}>
                {it.label}
              </option>
            ))}
          </select>
        </label>
        <span className="ml-auto text-[11px] text-muted-foreground/70">
          {project.watchEnabled ? `Auto-syncs every ${formatInterval(project.watchIntervalSec)} while the studio is running.` : 'Auto-sync is paused — sync manually anytime.'}
        </span>
      </div>

      {/* Persistent error / sync banner */}
      {project.lastStatus === 'error' && project.lastError ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-danger/25 bg-danger/5 px-4 py-2.5 text-xs text-danger">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Last sync failed: {project.lastError}</span>
        </div>
      ) : null}
      {banner ? (
        <div
          className={cx(
            'mt-3 rounded-lg border px-4 py-2.5 text-xs',
            banner.tone === 'success'
              ? 'border-success/25 bg-success/5 text-success'
              : banner.tone === 'danger'
                ? 'border-danger/25 bg-danger/5 text-danger'
                : 'border-border bg-muted/30 text-muted-foreground',
          )}
        >
          {banner.text}
        </div>
      ) : null}
      </div>

      {/* Versions + results — each column scrolls independently; the header above stays fixed. */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:mt-6 lg:min-h-0 lg:flex-1 lg:grid-cols-[320px_1fr] lg:grid-rows-[minmax(0,1fr)] lg:pb-6">
        <div className="flex min-h-0 flex-col">
          <div className="mb-2 flex shrink-0 items-center justify-between">
            <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Versions</h2>
            <span className="text-[11px] text-muted-foreground/60">{versions.length}</span>
          </div>
          <div className="min-h-0 flex-1 lg:overflow-y-auto lg:pr-1">
            <ProjectVersionTimeline
              versions={versions}
              selected={showLive ? null : selected}
              onSelect={(v) => {
                setSelected(v);
              }}
            />
          </div>
        </div>

        <div className="min-w-0 lg:min-h-0 lg:overflow-y-auto">
          {showLive ? (
            <RunResults state={runState} />
          ) : payloadLoading ? (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-16 text-sm text-muted-foreground">
              <Spinner className="h-4 w-4" /> Loading version…
            </div>
          ) : payload ? (
            <RunResults state={payloadToState(payload)} />
          ) : (
            <div className="flex h-full min-h-[260px] items-center justify-center rounded-lg border border-dashed border-border px-4 py-16 text-center text-sm text-muted-foreground">
              {versions.length === 0 ? 'Sync this project to build its first version.' : 'Select a version to replay its IR and surfaces.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NameEditor({ name, latestVersion, onSave }: { name: string; latestVersion: number; onSave: (name: string) => void }) {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(name);
  React.useEffect(() => setValue(name), [name]);

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (value.trim()) onSave(value.trim());
              setEditing(false);
            } else if (e.key === 'Escape') {
              setValue(name);
              setEditing(false);
            }
          }}
          className="h-8 max-w-xs"
        />
        <button
          type="button"
          onClick={() => {
            if (value.trim()) onSave(value.trim());
            setEditing(false);
          }}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-foreground text-background hover:bg-foreground/90"
          aria-label="Save name"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => {
            setValue(name);
            setEditing(false);
          }}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground"
          aria-label="Cancel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }
  return (
    <div className="group flex items-center gap-2">
      <h1 className="truncate text-xl font-semibold tracking-tight">{name}</h1>
      <Badge variant="outline" className="shrink-0 font-mono">
        v{latestVersion}
      </Badge>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
        aria-label="Rename project"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function WatchToggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className="flex items-center gap-2.5"
    >
      <span
        className={cx(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
          enabled ? 'bg-foreground' : 'bg-muted-foreground/30',
        )}
      >
        <span className={cx('inline-block h-4 w-4 transform rounded-full bg-background transition-transform', enabled ? 'translate-x-4' : 'translate-x-0.5')} />
      </span>
      <span className="text-[13px] font-medium text-foreground">Auto-sync</span>
    </button>
  );
}

function toneDot(tone: ReturnType<typeof statusMeta>['tone']): string {
  switch (tone) {
    case 'success':
      return 'bg-success';
    case 'danger':
      return 'bg-danger';
    case 'warning':
      return 'bg-warning';
    case 'accent':
      return 'bg-accent';
    default:
      return 'bg-muted-foreground/40';
  }
}

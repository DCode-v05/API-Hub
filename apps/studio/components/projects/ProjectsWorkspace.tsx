'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Eye, EyeOff, GitBranch, Plus } from 'lucide-react';
import type { ProjectRecord } from '@/lib/records';
import { PROJECTS_CHANGED, fetchProjects } from '@/lib/client/api';
import { KIND_ICON, KIND_LABEL, describeRequest, formatInterval, statusMeta } from '@/lib/project-display';
import { timeAgo } from '@/lib/time';
import { cx } from '@/lib/ui';
import { Badge } from '@/components/ui';

const CONNECT = [
  { href: '/github', label: 'GitHub' },
  { href: '/openapi', label: 'OpenAPI' },
  { href: '/sdk', label: 'SDK' },
  { href: '/mcp', label: 'MCP' },
] as const;

export function ProjectsWorkspace() {
  const [projects, setProjects] = React.useState<ProjectRecord[] | null>(null);

  React.useEffect(() => {
    let alive = true;
    const load = () => fetchProjects().then((p) => alive && setProjects(p));
    void load();
    const onChange = () => void load();
    window.addEventListener(PROJECTS_CHANGED, onChange);
    return () => {
      alive = false;
      window.removeEventListener(PROJECTS_CHANGED, onChange);
    };
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            A project tracks one source under version control. When the source changes — on a schedule or when you sync —
            the pipeline re-runs and stores a new version of every surface.
          </p>
        </div>
        <NewProjectMenu />
      </header>

      {projects === null ? (
        <p className="px-1 py-10 text-sm text-muted-foreground">Loading…</p>
      ) : projects.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-2.5">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectCard({ project: p }: { project: ProjectRecord }) {
  const Icon = KIND_ICON[p.kind];
  const status = statusMeta(p.lastStatus);
  return (
    <Link
      href={`/projects/${p.id}`}
      className="group flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3.5 transition-colors hover:border-foreground/20 hover:bg-muted/30"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40 text-foreground">
        <Icon className="h-5 w-5" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[15px] font-semibold tracking-tight text-foreground">{p.name}</span>
          <Badge variant="outline" className="shrink-0 font-mono">
            v{p.latestVersion}
          </Badge>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="shrink-0">{KIND_LABEL[p.kind]}</span>
          <span className="text-muted-foreground/40">·</span>
          <span className="truncate font-mono">{describeRequest(p.request)}</span>
        </div>
      </div>

      <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
        {p.watchEnabled ? (
          <Badge variant="accent">
            <Eye className="h-3 w-3" />
            Watching · {formatInterval(p.watchIntervalSec)}
          </Badge>
        ) : (
          <Badge variant="muted">
            <EyeOff className="h-3 w-3" />
            Paused
          </Badge>
        )}
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className={cx('h-1.5 w-1.5 rounded-full', toneDot(status.tone))} />
          {status.label}
          {p.lastCheckedAt ? <span className="text-muted-foreground/50">· {timeAgo(p.lastCheckedAt)}</span> : null}
        </span>
      </div>

      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-foreground" />
    </Link>
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

function NewProjectMenu() {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-9 items-center gap-2 rounded-md bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
      >
        <Plus className="h-4 w-4" />
        New project
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-1.5 w-48 overflow-hidden rounded-lg border border-border bg-card p-1 shadow-lg">
          <p className="px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Connect a source</p>
          {CONNECT.map((c) => {
            const Icon = KIND_ICON[c.href.slice(1) as keyof typeof KIND_ICON];
            return (
              <Link
                key={c.href}
                href={c.href}
                className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
              >
                <Icon className="h-4 w-4 text-muted-foreground" />
                {c.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-14 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-muted/40">
        <GitBranch className="h-6 w-6 text-muted-foreground" />
      </div>
      <h2 className="text-base font-semibold tracking-tight">No projects yet</h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
        Connect a source, then click <span className="font-medium text-foreground">Save as Project</span> to put it under version
        control and (optionally) auto-sync on a schedule.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {CONNECT.map((c) => {
          const Icon = KIND_ICON[c.href.slice(1) as keyof typeof KIND_ICON];
          return (
            <Link
              key={c.href}
              href={c.href}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-[13px] font-medium text-foreground transition-colors hover:border-foreground/20 hover:bg-muted/40"
            >
              <Icon className="h-4 w-4 text-muted-foreground" />
              {c.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

'use client';

import * as React from 'react';
import { AlertTriangle, Check, FileSearch, Github, Loader2, ShieldCheck } from 'lucide-react';
import type { RunRequest } from '@/lib/events';
import { parseGithubUrl } from '@/lib/github';
import { cx } from '@/lib/ui';
import { Button, Field, Input, Label } from '@/components/ui';
import { PatField } from '@/components/run/PatField';
import { InputWorkspace } from './InputWorkspace';

interface Form {
  githubUrl: string;
  repo: string;
  pat: string;
  patId: string;
  ref: string;
  spec: string;
}

const EMPTY: Form = { githubUrl: '', repo: '', pat: '', patId: '', ref: '', spec: '' };

interface Inspection {
  ok: boolean;
  error?: string;
  defaultBranch?: string;
  isPrivate?: boolean;
  branches?: string[];
  specs?: string[];
}

function toRequest(f: Form): RunRequest {
  return {
    kind: 'github',
    repo: f.repo.trim(),
    pat: f.pat.trim() || undefined,
    patId: f.patId || undefined,
    ref: f.ref.trim() || undefined,
    spec: f.spec.trim() || undefined,
  };
}

export function GithubWorkspace() {
  const [f, setF] = React.useState<Form>(EMPTY);
  const set = (patch: Partial<Form>) => setF((prev) => ({ ...prev, ...patch }));

  const [inspecting, setInspecting] = React.useState(false);
  const [inspection, setInspection] = React.useState<Inspection | null>(null);

  const parsed = f.githubUrl.trim() ? parseGithubUrl(f.githubUrl) : null;
  const hasToken = !!f.patId || f.pat.trim().length > 0;
  const runnable = f.repo.trim().includes('/') && hasToken;

  async function inspect() {
    if (!runnable) return;
    setInspecting(true);
    setInspection(null);
    try {
      const res = await fetch('/api/github', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          repo: f.repo.trim(),
          pat: f.pat.trim() || undefined,
          patId: f.patId || undefined,
          ref: f.ref.trim() || undefined,
        }),
      });
      const data = (await res.json()) as Inspection;
      setInspection(data);
      if (data.ok && !f.ref.trim() && data.defaultBranch) set({ ref: data.defaultBranch });
    } catch (e) {
      setInspection({ ok: false, error: e instanceof Error ? e.message : 'Request failed' });
    } finally {
      setInspecting(false);
    }
  }

  return (
    <InputWorkspace
      kind="github"
      title="GitHub repository"
      description="Clone a public or private repo with a PAT, pin the commit SHA, locate the OpenAPI spec, and bundle its $refs into one origin-blind artifact."
      Icon={Github}
      trust="declared"
      request={toRequest(f)}
      runnable={runnable}
      invalidHint='Enter a repo (owner/repo) and a GitHub token.'
    >
      <div className="space-y-4">
        <Field label="GitHub URL" hint="optional · auto-fills the fields below">
          <Input
            placeholder="https://github.com/owner/repo/blob/main/openapi.yaml"
            value={f.githubUrl}
            onChange={(e) => {
              const githubUrl = e.target.value;
              const p = parseGithubUrl(githubUrl);
              // When the URL parses, it is the source of truth: mirror repo/ref/spec from it,
              // clearing ref/spec the URL no longer carries (deleting them from the URL clears the
              // fields). When the URL doesn't parse, leave the manual fields untouched.
              set({
                githubUrl,
                ...(p ? { repo: `${p.owner}/${p.repo}`, ref: p.ref ?? '', spec: p.spec ?? '' } : {}),
              });
            }}
            className="font-mono"
          />
        </Field>
        {f.githubUrl.trim() ? (
          parsed ? (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1 text-success">
                <Check className="h-3.5 w-3.5" /> Parsed
              </span>
              <code className="break-all font-mono text-foreground">
                {parsed.owner}/{parsed.repo}
              </code>
              {parsed.ref ? <span>ref <code className="font-mono text-foreground">{parsed.ref}</code></span> : null}
              {parsed.spec ? <span>spec <code className="break-all font-mono text-foreground">{parsed.spec}</code></span> : null}
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-warning">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Not a GitHub repo URL — set the fields below manually.
            </p>
          )
        ) : null}

        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> or set manually <span className="h-px flex-1 bg-border" />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <Label>Repository</Label>
            <span className="text-xs text-muted-foreground">owner/repo</span>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="DCode-v05/Test"
              value={f.repo}
              onChange={(e) => set({ repo: e.target.value })}
              className="font-mono"
            />
            <Button variant="secondary" onClick={inspect} disabled={!runnable || inspecting} className="shrink-0">
              {inspecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Check
            </Button>
          </div>
        </div>

        <PatField patId={f.patId || undefined} pat={f.pat} onChange={(v) => set({ patId: v.patId ?? '', pat: v.pat })} />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Ref</Label>
            {inspection?.ok && inspection.branches && inspection.branches.length > 0 ? (
              <select
                value={f.ref}
                onChange={(e) => set({ ref: e.target.value })}
                className="h-9 w-full rounded-md border border-border bg-background px-3 font-mono text-sm text-foreground focus:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-ring/15"
              >
                {!inspection.branches.includes(f.ref) && f.ref ? <option value={f.ref}>{f.ref}</option> : null}
                {inspection.branches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                    {b === inspection.defaultBranch ? '  (default)' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <Input placeholder="main" value={f.ref} onChange={(e) => set({ ref: e.target.value })} className="font-mono" />
            )}
          </div>
          <Field label="Spec path" hint="optional">
            <Input
              placeholder="openapi.yaml  (auto-detected)"
              value={f.spec}
              onChange={(e) => set({ spec: e.target.value })}
              className="font-mono"
            />
          </Field>
        </div>

        {/* Inspection result */}
        {inspection ? (
          inspection.ok ? (
            <div className="space-y-2.5 rounded-md border border-success/25 bg-success/5 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-success">
                <ShieldCheck className="h-3.5 w-3.5" />
                Access confirmed · {inspection.isPrivate ? 'private' : 'public'} · default branch{' '}
                <code className="font-mono">{inspection.defaultBranch}</code>
              </p>
              {inspection.specs && inspection.specs.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                    <FileSearch className="h-3 w-3" /> Detected spec files — click to use
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {inspection.specs.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => set({ spec: s })}
                        className={cx(
                          'rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors',
                          f.spec === s
                            ? 'border-foreground/30 bg-foreground text-background'
                            : 'border-border bg-card text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">No obvious spec files found — the acquirer will auto-detect, or set the path manually.</p>
              )}
            </div>
          ) : (
            <p className="flex items-center gap-1.5 rounded-md border border-danger/25 bg-danger/5 px-3 py-2 text-xs text-danger">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {inspection.error}
            </p>
          )
        ) : null}
      </div>
    </InputWorkspace>
  );
}

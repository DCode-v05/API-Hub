'use client';

import * as React from 'react';
import { AlertTriangle, Check, FileJson, Github, Package, Play, Plug, Sparkles } from 'lucide-react';
import type { RunRequest, SampleId, StageSourceKind } from '@/lib/events';
import { parseGithubUrl } from '@/lib/github';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Field, Input, SegmentedControl, Spinner, Textarea } from './ui';
import { cx } from '@/lib/ui';

const KIND_OPTIONS = [
  { value: 'github' as const, label: <><Github className="h-3.5 w-3.5" />GitHub</> },
  { value: 'openapi' as const, label: <><FileJson className="h-3.5 w-3.5" />OpenAPI</> },
  { value: 'sdk' as const, label: <><Package className="h-3.5 w-3.5" />SDK</> },
  { value: 'mcp' as const, label: <><Plug className="h-3.5 w-3.5" />MCP</> },
];

const SAMPLES: { id: SampleId; kind: StageSourceKind; label: string; trust: 'declared' | 'inferred' }[] = [
  { id: 'openapi', kind: 'openapi', label: 'OpenAPI · Tasks API', trust: 'declared' },
  { id: 'github', kind: 'github', label: 'GitHub · DCode-v05/Test', trust: 'declared' },
  { id: 'sdk-ts', kind: 'sdk', label: 'SDK · TypeScript', trust: 'inferred' },
  { id: 'sdk-py', kind: 'sdk', label: 'SDK · Python', trust: 'inferred' },
  { id: 'mcp', kind: 'mcp', label: 'MCP · Tasks tools', trust: 'inferred' },
];

type Form = {
  kind: StageSourceKind;
  githubUrl: string;
  repo: string;
  pat: string;
  ref: string;
  spec: string;
  openapiMode: 'url' | 'paste' | 'path';
  openapiUrl: string;
  openapiContent: string;
  openapiPath: string;
  sdkPath: string;
  lang: '' | 'typescript' | 'python';
  mcpMode: 'url' | 'paste' | 'path' | 'command';
  mcpUrl: string;
  mcpContent: string;
  mcpPath: string;
  mcpCommand: string;
};

const EMPTY: Form = {
  kind: 'openapi',
  githubUrl: '',
  repo: '',
  pat: '',
  ref: '',
  spec: '',
  openapiMode: 'url',
  openapiUrl: '',
  openapiContent: '',
  openapiPath: '',
  sdkPath: '',
  lang: '',
  mcpMode: 'url',
  mcpUrl: '',
  mcpContent: '',
  mcpPath: '',
  mcpCommand: '',
};

function toRequest(f: Form): RunRequest {
  switch (f.kind) {
    case 'github':
      return { kind: 'github', repo: f.repo, pat: f.pat, ref: f.ref, spec: f.spec };
    case 'openapi':
      return {
        kind: 'openapi',
        openapiUrl: f.openapiMode === 'url' ? f.openapiUrl : undefined,
        openapiContent: f.openapiMode === 'paste' ? f.openapiContent : undefined,
        openapiPath: f.openapiMode === 'path' ? f.openapiPath : undefined,
      };
    case 'sdk':
      return { kind: 'sdk', sdkPath: f.sdkPath, lang: f.lang || undefined };
    case 'mcp':
      return {
        kind: 'mcp',
        mcpUrl: f.mcpMode === 'url' ? f.mcpUrl : undefined,
        mcpContent: f.mcpMode === 'paste' ? f.mcpContent : undefined,
        mcpPath: f.mcpMode === 'path' ? f.mcpPath : undefined,
        mcpCommand: f.mcpMode === 'command' ? f.mcpCommand : undefined,
      };
  }
}

function ModeTabs<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            value === o.value ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function InputPanel({ onRun, running }: { onRun: (req: RunRequest) => void; running: boolean }) {
  const [f, setF] = React.useState<Form>(EMPTY);
  const set = (patch: Partial<Form>) => setF((prev) => ({ ...prev, ...patch }));
  const parsedUrl = f.githubUrl.trim() ? parseGithubUrl(f.githubUrl) : null;

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Input source</CardTitle>
        <Badge variant="outline">{f.kind}</Badge>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Samples */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            Try a sample
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SAMPLES.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={running}
                onClick={() => onRun({ kind: s.kind, sample: s.id })}
                className="group inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-foreground/30 hover:bg-muted disabled:opacity-50"
              >
                {s.label}
                <span
                  role="img"
                  aria-label={`${s.trust} trust`}
                  title={`${s.trust} trust`}
                  className={cx('h-1.5 w-1.5 rounded-full', s.trust === 'declared' ? 'bg-success' : 'bg-warning')}
                />
              </button>
            ))}
          </div>
        </div>

        <div className="h-px bg-border" />

        {/* Kind picker */}
        <SegmentedControl options={KIND_OPTIONS} value={f.kind} onChange={(v) => set({ kind: v })} />

        {/* Per-kind form */}
        {f.kind === 'github' && (
          <div className="space-y-3.5 animate-fade-in">
            <Field label="GitHub URL" hint="optional · auto-fills below">
              <Input
                placeholder="https://github.com/owner/repo/blob/main/openapi.yaml"
                value={f.githubUrl}
                onChange={(e) => {
                  const githubUrl = e.target.value;
                  const parsed = parseGithubUrl(githubUrl);
                  set({
                    githubUrl,
                    ...(parsed
                      ? {
                          repo: `${parsed.owner}/${parsed.repo}`,
                          ...(parsed.ref !== undefined ? { ref: parsed.ref } : {}),
                          ...(parsed.spec !== undefined ? { spec: parsed.spec } : {}),
                        }
                      : {}),
                  });
                }}
                className="font-mono"
              />
            </Field>
            {f.githubUrl.trim() ? (
              parsedUrl ? (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1 text-success">
                    <Check className="h-3.5 w-3.5" />
                    Parsed
                  </span>
                  <code className="break-all font-mono text-foreground">
                    {parsedUrl.owner}/{parsedUrl.repo}
                  </code>
                  {parsedUrl.ref ? (
                    <span>
                      ref <code className="break-all font-mono text-foreground">{parsedUrl.ref}</code>
                    </span>
                  ) : null}
                  {parsedUrl.spec ? (
                    <span>
                      spec <code className="break-all font-mono text-foreground">{parsedUrl.spec}</code>
                    </span>
                  ) : null}
                </div>
              ) : (
                <p className="flex items-center gap-1.5 text-xs text-warning">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  Not a GitHub repo URL — set the fields below manually.
                </p>
              )
            ) : null}
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              or set manually
              <span className="h-px flex-1 bg-border" />
            </div>
            <Field label="Repository" hint="owner/repo">
              <Input placeholder="DCode-v05/Test" value={f.repo} onChange={(e) => set({ repo: e.target.value })} className="font-mono" />
            </Field>
            <Field label="Personal access token" hint="blank → .env">
              <Input type="password" placeholder="ghp_…  (or CN_GITHUB_PAT from .env)" value={f.pat} onChange={(e) => set({ pat: e.target.value })} className="font-mono" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ref" hint="optional">
                <Input placeholder="main" value={f.ref} onChange={(e) => set({ ref: e.target.value })} className="font-mono" />
              </Field>
              <Field label="Spec path" hint="optional">
                <Input placeholder="openapi.yaml" value={f.spec} onChange={(e) => set({ spec: e.target.value })} className="font-mono" />
              </Field>
            </div>
          </div>
        )}

        {f.kind === 'openapi' && (
          <div className="space-y-3 animate-fade-in">
            <ModeTabs
              value={f.openapiMode}
              onChange={(v) => set({ openapiMode: v })}
              options={[
                { value: 'url', label: 'URL' },
                { value: 'paste', label: 'Paste' },
                { value: 'path', label: 'Local path' },
              ]}
            />
            {f.openapiMode === 'url' && (
              <Input placeholder="https://api.example.com/openapi.json" value={f.openapiUrl} onChange={(e) => set({ openapiUrl: e.target.value })} className="font-mono" />
            )}
            {f.openapiMode === 'paste' && (
              <Textarea rows={9} placeholder="Paste an OpenAPI 3.x spec (YAML or JSON)…" value={f.openapiContent} onChange={(e) => set({ openapiContent: e.target.value })} />
            )}
            {f.openapiMode === 'path' && (
              <Input placeholder="samples/openapi/tasks-api.yaml" value={f.openapiPath} onChange={(e) => set({ openapiPath: e.target.value })} className="font-mono" />
            )}
          </div>
        )}

        {f.kind === 'sdk' && (
          <div className="space-y-3.5 animate-fade-in">
            <Field label="SDK directory" hint="local path">
              <Input placeholder="samples/sdk-typescript" value={f.sdkPath} onChange={(e) => set({ sdkPath: e.target.value })} className="font-mono" />
            </Field>
            <Field label="Language" hint="auto-detected">
              <SegmentedControl
                value={f.lang || 'auto'}
                onChange={(v) => set({ lang: v === 'auto' ? '' : (v as 'typescript' | 'python') })}
                options={[
                  { value: 'auto', label: 'Auto' },
                  { value: 'typescript', label: 'TypeScript' },
                  { value: 'python', label: 'Python' },
                ]}
              />
            </Field>
          </div>
        )}

        {f.kind === 'mcp' && (
          <div className="space-y-3 animate-fade-in">
            <ModeTabs
              value={f.mcpMode}
              onChange={(v) => set({ mcpMode: v })}
              options={[
                { value: 'url', label: 'Manifest URL' },
                { value: 'paste', label: 'Paste' },
                { value: 'path', label: 'Local path' },
                { value: 'command', label: 'Stdio command' },
              ]}
            />
            {f.mcpMode === 'url' && <Input placeholder="https://…/tools.json" value={f.mcpUrl} onChange={(e) => set({ mcpUrl: e.target.value })} className="font-mono" />}
            {f.mcpMode === 'paste' && <Textarea rows={9} placeholder='Paste a tools manifest: { "tools": [ … ] }' value={f.mcpContent} onChange={(e) => set({ mcpContent: e.target.value })} />}
            {f.mcpMode === 'path' && <Input placeholder="samples/mcp/tasks-tools.json" value={f.mcpPath} onChange={(e) => set({ mcpPath: e.target.value })} className="font-mono" />}
            {f.mcpMode === 'command' && <Input placeholder="node ./my-mcp-server.js" value={f.mcpCommand} onChange={(e) => set({ mcpCommand: e.target.value })} className="font-mono" />}
          </div>
        )}

        <Button className="w-full" size="lg" disabled={running} onClick={() => onRun(toRequest(f))}>
          {running ? <><Spinner className="h-4 w-4" />Running pipeline…</> : <><Play className="h-4 w-4" />Run pipeline</>}
        </Button>
      </CardContent>
    </Card>
  );
}

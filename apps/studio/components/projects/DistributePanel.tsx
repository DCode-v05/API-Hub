'use client';

import * as React from 'react';
import { Check, Copy, Download, ExternalLink, Package, Play, Plug, RefreshCw, Square, Terminal, Upload } from 'lucide-react';
import type { DeploymentRecord, HostConfig, PublishEvent, PublishRecord, RegistryStatus } from '@/lib/records';
import { cliPackUrl, fetchHost, fetchHostLogs, fetchPublishState, runCliCommand, startHost, stopHost } from '@/lib/client/api';
import { publishSdk } from '@/lib/run-client';
import { cx } from '@/lib/ui';
import { Badge, Button, Input, Spinner } from '@/components/ui';

/**
 * The "Distribute" surface for a project version: host the MCP server as a local process, download
 * the CLI package, and publish the SDKs to npm / PyPI — each a status-driven card.
 */
export function DistributePanel({ projectId, version }: { projectId: string; version: number }) {
  const [host, setHost] = React.useState<{ deployments: DeploymentRecord[]; config: HostConfig } | null>(null);
  const [pub, setPub] = React.useState<{ registry: RegistryStatus; publishes: PublishRecord[] } | null>(null);

  const reloadHost = React.useCallback(() => {
    void fetchHost(projectId).then(setHost);
  }, [projectId]);
  const reloadPub = React.useCallback(() => {
    void fetchPublishState(projectId).then(setPub);
  }, [projectId]);

  React.useEffect(() => {
    reloadHost();
    reloadPub();
  }, [reloadHost, reloadPub]);

  return (
    <div className="space-y-4">
      <McpSection projectId={projectId} version={version} host={host} reload={reloadHost} />
      <CliSection projectId={projectId} version={version} host={host} reload={reloadHost} />
      <SdkSection projectId={projectId} version={version} pub={pub} reload={reloadPub} />
    </div>
  );
}

/* ── MCP server ───────────────────────────────────────────────────────────── */

function McpSection({
  projectId,
  version,
  host,
  reload,
}: {
  projectId: string;
  version: number;
  host: { deployments: DeploymentRecord[]; config: HostConfig } | null;
  reload: () => void;
}) {
  const config = host?.config;
  const active = host?.deployments.find((d) => d.surfaceKind === 'mcp' && (d.status === 'running' || d.status === 'starting')) ?? null;
  const lastFailed = !active ? (host?.deployments.find((d) => d.surfaceKind === 'mcp' && d.status === 'failed') ?? null) : null;

  const [baseUrl, setBaseUrl] = React.useState('');
  const [token, setToken] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (config) setBaseUrl(config.baseUrl);
  }, [config?.baseUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  async function start() {
    setBusy(true);
    setError(null);
    const r = await startHost(projectId, { version, kind: 'mcp', baseUrl: baseUrl.trim() || undefined, token: token.trim() || undefined });
    setBusy(false);
    setToken('');
    if (!r.deployment || r.error) setError(r.error ?? 'Failed to start the server.');
    reload();
  }
  async function stop(id: string) {
    await stopHost(projectId, id);
    reload();
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <header className="mb-3 flex items-center gap-2">
        <Plug className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold tracking-tight">MCP server</h3>
        {active?.status === 'running' ? (
          <Badge variant="success">
            <span className="h-1.5 w-1.5 rounded-full bg-success" /> Running
          </Badge>
        ) : active?.status === 'starting' ? (
          <Badge variant="warning">Starting…</Badge>
        ) : null}
        <span className="ml-auto text-[11px] text-muted-foreground">runs while the studio is running</span>
      </header>

      {active ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
            <span className="text-xs text-muted-foreground">Endpoint</span>
            <code className="font-mono text-[13px] text-foreground">{active.endpoint ?? `:${active.port}`}</code>
            {active.endpoint ? <CopyBtn text={active.endpoint} /> : null}
            <span className="ml-auto" />
            <Button variant="secondary" size="sm" onClick={() => void stop(active.id)}>
              <Square className="h-3.5 w-3.5" /> Stop
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Bound to <code className="font-mono">127.0.0.1</code> · port {active.port} · POST JSON-RPC to <code className="font-mono">/mcp</code>, health at <code className="font-mono">/health</code>.
          </p>
          {active.status === 'running' ? <HostLogs projectId={projectId} deploymentId={active.id} /> : null}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-[13px] font-medium text-foreground">Upstream base URL</span>
              <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com" className="font-mono" />
            </label>
            <label className="space-y-1.5">
              <span className="text-[13px] font-medium text-foreground">
                API token <span className="font-normal text-muted-foreground">{config?.hasToken ? '· saved' : '· stored encrypted'}</span>
              </span>
              <Input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={config?.hasToken ? '•••••••• (leave blank to reuse)' : 'Bearer token for the upstream API'}
                className="font-mono"
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => void start()} disabled={busy}>
              {busy ? <Spinner className="h-4 w-4" /> : <Plug className="h-4 w-4" />}
              {busy ? 'Starting…' : 'Host MCP server'}
            </Button>
            <span className="text-xs text-muted-foreground">Spawns the generated server on a free local port.</span>
          </div>
          {error ? <p className="text-xs text-danger">{error}</p> : null}
          {lastFailed?.error ? <p className="text-xs text-danger">Last attempt failed: {lastFailed.error}</p> : null}
        </div>
      )}
    </section>
  );
}

function HostLogs({ projectId, deploymentId }: { projectId: string; deploymentId: string }) {
  const [lines, setLines] = React.useState<string[]>([]);
  React.useEffect(() => {
    let alive = true;
    const tick = () => {
      void fetchHostLogs(projectId, deploymentId).then((r) => {
        if (alive && r) setLines(r.lines);
      });
    };
    tick();
    const h = setInterval(tick, 2500);
    return () => {
      alive = false;
      clearInterval(h);
    };
  }, [projectId, deploymentId]);
  if (lines.length === 0) return null;
  return (
    <pre className="max-h-40 overflow-auto rounded-lg border border-border bg-background p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
      {lines.join('\n')}
    </pre>
  );
}

/* ── CLI: host as a command service + download ────────────────────────────── */

function CliSection({
  projectId,
  version,
  host,
  reload,
}: {
  projectId: string;
  version: number;
  host: { deployments: DeploymentRecord[]; config: HostConfig } | null;
  reload: () => void;
}) {
  const active = host?.deployments.find((d) => d.surfaceKind === 'cli' && (d.status === 'running' || d.status === 'starting')) ?? null;
  const lastFailed = !active ? (host?.deployments.find((d) => d.surfaceKind === 'cli' && d.status === 'failed') ?? null) : null;
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function startCli() {
    setBusy(true);
    setError(null);
    const r = await startHost(projectId, { version, kind: 'cli' });
    setBusy(false);
    if (!r.deployment || r.error) setError(r.error ?? 'Failed to start the CLI service.');
    reload();
  }
  async function stop(id: string) {
    await stopHost(projectId, id);
    reload();
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <header className="mb-3 flex items-center gap-2">
        <Package className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold tracking-tight">CLI</h3>
        {active?.status === 'running' ? (
          <Badge variant="success">
            <span className="h-1.5 w-1.5 rounded-full bg-success" /> Running
          </Badge>
        ) : active?.status === 'starting' ? (
          <Badge variant="warning">Starting…</Badge>
        ) : null}
        <span className="ml-auto text-[11px] text-muted-foreground">run as an HTTP command service</span>
      </header>

      {active ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
            <span className="text-xs text-muted-foreground">Endpoint</span>
            <code className="font-mono text-[13px] text-foreground">{active.endpoint ?? `:${active.port}`}</code>
            {active.endpoint ? <CopyBtn text={active.endpoint} /> : null}
            <span className="ml-auto" />
            <Button variant="secondary" size="sm" onClick={() => void stop(active.id)}>
              <Square className="h-3.5 w-3.5" /> Stop
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Bound to <code className="font-mono">127.0.0.1</code> · port {active.port} · <code className="font-mono">POST /run {'{ "args": ["…"] }'}</code> → <code className="font-mono">{'{ exitCode, stdout, stderr }'}</code>.
          </p>
          {active.status === 'running' ? <CliTester projectId={projectId} deploymentId={active.id} /> : null}
          {active.status === 'running' ? <HostLogs projectId={projectId} deploymentId={active.id} /> : null}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void startCli()} disabled={busy}>
            {busy ? <Spinner className="h-4 w-4" /> : <Terminal className="h-4 w-4" />}
            {busy ? 'Starting…' : 'Host CLI service'}
          </Button>
          <span className="text-xs text-muted-foreground">Runs the generated CLI behind <code className="font-mono">POST /run</code> on a free local port (uses the same upstream config as above).</span>
          {error ? <p className="w-full text-xs text-danger">{error}</p> : null}
          {lastFailed?.error ? <p className="w-full text-xs text-danger">Last attempt failed: {lastFailed.error}</p> : null}
        </div>
      )}

      <div className="my-4 h-px bg-border" />

      {/* Download the installable package */}
      <a
        href={cliPackUrl(projectId, version)}
        download
        className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted/40"
      >
        <Download className="h-4 w-4" /> Download package (.tgz)
      </a>
      <div className="mt-3 space-y-2">
        <CommandRow cmd="npm i -g ./<downloaded-file>.tgz" />
        <CommandRow cmd="CN_BASE_URL=… CN_TOKEN=… <bin> <resource> <verb> --flags" />
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">An installable npm tarball of the generated CLI — run it directly on any machine (set the upstream base URL + token via env).</p>
    </section>
  );
}

function CliTester({ projectId, deploymentId }: { projectId: string; deploymentId: string }) {
  const [cmd, setCmd] = React.useState('--help');
  const [busy, setBusy] = React.useState(false);
  const [out, setOut] = React.useState<{ exitCode?: number; stdout?: string; stderr?: string; error?: string } | null>(null);

  async function run() {
    setBusy(true);
    setOut(null);
    const r = await runCliCommand(projectId, deploymentId, parseArgs(cmd));
    setBusy(false);
    setOut(r);
  }

  const text = out ? (out.error ?? ([out.stdout, out.stderr].filter(Boolean).join('\n') || `(no output, exit ${out.exitCode ?? '?'})`)) : '';
  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-center gap-2">
        <code className="text-xs text-muted-foreground">$</code>
        <input
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void run();
            }
          }}
          placeholder="--help    (or:  <resource> <verb> --flag value)"
          className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-ring/15"
        />
        <Button size="sm" onClick={() => void run()} disabled={busy || !cmd.trim()}>
          {busy ? <Spinner className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          Run
        </Button>
      </div>
      {out ? (
        <pre
          className={cx(
            'max-h-48 overflow-auto rounded-md border bg-background p-2.5 font-mono text-[11px] leading-relaxed',
            out.error || (out.exitCode != null && out.exitCode !== 0) ? 'border-danger/30 text-danger' : 'border-border text-muted-foreground',
          )}
        >
          {out.exitCode != null ? `exit ${out.exitCode}\n` : ''}
          {text}
        </pre>
      ) : null}
    </div>
  );
}

/** Tokenize a command string, honoring simple "double" / 'single' quotes. */
function parseArgs(cmd: string): string[] {
  return (cmd.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((t) => t.replace(/^["']|["']$/g, ''));
}

/* ── SDK publishing ───────────────────────────────────────────────────────── */

function SdkSection({
  projectId,
  version,
  pub,
  reload,
}: {
  projectId: string;
  version: number;
  pub: { registry: RegistryStatus; publishes: PublishRecord[] } | null;
  reload: () => void;
}) {
  const reg = pub?.registry;
  const npmOk = !!reg?.npm.configured;
  const pyOk = !!(reg?.pypi.configured && reg?.pypi.tooling);
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <header className="mb-3 flex items-center gap-2">
        <Upload className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold tracking-tight">SDK packages</h3>
      </header>
      <div className="space-y-2.5">
        <SdkRow
          projectId={projectId}
          version={version}
          target="sdk-typescript"
          label="TypeScript"
          registryLabel="npm"
          configured={npmOk}
          hint={reg ? `scope ${reg.npm.scope}` : ''}
          notConfiguredHint="Set STUDIO_NPM_TOKEN to enable npm publishing."
          install={(name) => `npm i ${name}`}
          last={pub?.publishes.find((p) => p.surfaceKind === 'sdk-typescript') ?? null}
          reload={reload}
        />
        <SdkRow
          projectId={projectId}
          version={version}
          target="sdk-python"
          label="Python"
          registryLabel="PyPI"
          configured={pyOk}
          hint={reg ? `prefix ${reg.pypi.prefix}` : ''}
          notConfiguredHint={
            reg && reg.pypi.configured && !reg.pypi.tooling
              ? 'PyPI publishing needs the `build` + `twine` packages (pip install build twine).'
              : 'Set STUDIO_PYPI_TOKEN to enable PyPI publishing.'
          }
          install={(name) => `pip install ${name}`}
          last={pub?.publishes.find((p) => p.surfaceKind === 'sdk-python') ?? null}
          reload={reload}
        />
      </div>
    </section>
  );
}

function SdkRow({
  projectId,
  version,
  target,
  label,
  registryLabel,
  configured,
  hint,
  notConfiguredHint,
  install,
  last,
  reload,
}: {
  projectId: string;
  version: number;
  target: 'sdk-typescript' | 'sdk-python';
  label: string;
  registryLabel: string;
  configured: boolean;
  hint: string;
  notConfiguredHint: string;
  install: (pkg: string) => string;
  last: PublishRecord | null;
  reload: () => void;
}) {
  const [phase, setPhase] = React.useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [log, setLog] = React.useState<string[]>([]);
  const [result, setResult] = React.useState<{ packageName: string; version: string; url: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function publish() {
    setPhase('running');
    setLog([]);
    setResult(null);
    setError(null);
    try {
      await publishSdk(projectId, version, target, (e: PublishEvent) => {
        if (e.t === 'log') setLog((l) => [...l, e.line]);
        else if (e.t === 'step') setLog((l) => [...l, `▸ ${e.name}`]);
        else if (e.t === 'published') {
          setResult({ packageName: e.packageName, version: e.publishedVersion, url: e.url });
          setLog((l) => [...l, `✓ Published ${e.packageName}@${e.publishedVersion}`]);
          setPhase('done');
          reload();
        } else if (e.t === 'error') {
          setError(e.message);
          setPhase('error');
        }
      });
      // If the stream ended without an explicit published/error frame, settle gracefully.
      setPhase((p) => (p === 'running' ? 'idle' : p));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  }

  const published = result ?? (last && last.status === 'published' ? { packageName: last.packageName, version: last.publishedVersion, url: last.url ?? '' } : null);

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold text-foreground">{label}</span>
        <Badge variant="outline">{registryLabel}</Badge>
        {published ? (
          <a href={published.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-accent hover:underline">
            {published.packageName}@{published.version} <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">{hint}</span>
        )}
        <div className="ml-auto">
          <Button size="sm" variant={published ? 'secondary' : 'default'} onClick={() => void publish()} disabled={!configured || phase === 'running'}>
            {phase === 'running' ? <Spinner className="h-3.5 w-3.5" /> : published ? <RefreshCw className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
            {phase === 'running' ? 'Publishing…' : published ? 'Publish update' : 'Publish'}
          </Button>
        </div>
      </div>

      {!configured ? <p className="mt-2 text-[11px] text-muted-foreground">{notConfiguredHint}</p> : null}

      {published ? <CommandRow cmd={install(published.packageName)} className="mt-2" /> : null}

      {(phase === 'running' || log.length > 0) && phase !== 'idle' ? (
        <pre className="mt-2 max-h-44 overflow-auto rounded-md border border-border bg-background p-2.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {log.join('\n') || 'Starting…'}
        </pre>
      ) : null}
      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
    </div>
  );
}

/* ── small helpers ────────────────────────────────────────────────────────── */

function CommandRow({ cmd, className }: { cmd: string; className?: string }) {
  return (
    <div className={cx('flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2', className)}>
      <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{cmd}</code>
      <CopyBtn text={cmd} />
    </div>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
      className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      aria-label="Copy to clipboard"
      title="Copy"
    >
      {done ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

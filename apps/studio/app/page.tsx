'use client';

import * as React from 'react';
import { AlertTriangle, ArrowRight, Binary, Layers } from 'lucide-react';
import { Header } from '@/components/Header';
import { InputPanel } from '@/components/InputPanel';
import { PipelineView } from '@/components/PipelineView';
import { DiagnosticsPanel } from '@/components/DiagnosticsPanel';
import { IrExplorer } from '@/components/IrExplorer';
import { SurfacesBrowser } from '@/components/SurfacesBrowser';
import { Card, CardContent } from '@/components/ui';
import { runStudio } from '@/lib/run-client';
import { INITIAL_RUN, reduce } from '@/lib/state';
import type { RunRequest } from '@/lib/events';
import { cx } from '@/lib/ui';

type Tab = 'diagnostics' | 'ir' | 'surfaces';

export default function Page() {
  const [state, dispatch] = React.useReducer(reduce, INITIAL_RUN);
  const [tab, setTab] = React.useState<Tab>('ir');
  const [running, setRunning] = React.useState(false);
  const inFlight = React.useRef(false);

  const onRun = React.useCallback(async (req: RunRequest) => {
    if (inFlight.current) return; // synchronous guard — race-proof regardless of render timing
    inFlight.current = true;
    setRunning(true);
    dispatch({ t: 'start', source: { kind: req.kind, describe: 'starting…', label: '' } });
    try {
      await runStudio(req, (e) => {
        dispatch(e);
        if (e.t === 'ingest' && !e.valid) setTab('diagnostics');
        else if (e.t === 'error') setTab('diagnostics');
        else if (e.t === 'build') setTab('ir');
        else if (e.t === 'project') setTab('surfaces');
      });
    } catch (err) {
      dispatch({ t: 'error', stage: 'input', message: err instanceof Error ? err.message : String(err) });
      dispatch({ t: 'done', ok: false, ms: 0 });
    } finally {
      inFlight.current = false;
      setRunning(false);
    }
  }, []);

  const diagCount = (state.acquire?.diagnostics.length ?? 0) + (state.ingest?.diagnostics.length ?? 0) + (state.ingest?.proposals.length ?? 0);
  const tabs: { id: Tab; label: string; count?: number; Icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'diagnostics', label: 'Diagnostics', count: diagCount, Icon: AlertTriangle },
    { id: 'ir', label: 'IR', count: state.ir?.operations.length, Icon: Binary },
    { id: 'surfaces', label: 'Surfaces', count: state.surfaces?.reduce((n, s) => n + s.files.length, 0), Icon: Layers },
  ];

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-7xl px-5 py-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
          <div className="lg:sticky lg:top-20 lg:self-start">
            <InputPanel onRun={onRun} running={running} />
          </div>

          <div className="min-w-0 space-y-6">
            {state.status === 'idle' ? (
              <Hero />
            ) : (
              <>
                <PipelineView state={state} />

                <Card>
                  <div className="flex items-center gap-1 border-b border-border px-2">
                    {tabs.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTab(t.id)}
                        className={cx(
                          'relative flex items-center gap-1.5 px-3 py-3 text-[13px] font-medium transition-colors',
                          tab === t.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        <t.Icon className="h-3.5 w-3.5" />
                        {t.label}
                        {t.count != null ? (
                          <span className="rounded-full bg-muted px-1.5 text-[11px] font-normal text-muted-foreground">{t.count}</span>
                        ) : null}
                        {tab === t.id ? <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-foreground" /> : null}
                      </button>
                    ))}
                  </div>
                  <CardContent>
                    {tab === 'diagnostics' ? <DiagnosticsPanel state={state} /> : null}
                    {tab === 'ir' ? state.ir ? <IrExplorer ir={state.ir} /> : <Pending label="The IR appears once the build stage completes." /> : null}
                    {tab === 'surfaces' ? state.surfaces ? <SurfacesBrowser surfaces={state.surfaces} label={state.label} /> : <Pending label="Surfaces appear once the project stage completes." /> : null}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function Pending({ label }: { label: string }) {
  return <p className="py-14 text-center text-sm text-muted-foreground">{label}</p>;
}

function Hero() {
  const stages = [
    { name: 'Acquire', sub: 'fetch · pin · bundle' },
    { name: 'Ingest', sub: 'adapt · validate · repair' },
    { name: 'Build IR', sub: 'content-hashed' },
    { name: 'Project', sub: 'SDK · MCP · CLI · docs' },
  ];
  return (
    <Card className="overflow-hidden">
      <div className="bg-grid border-b border-border px-7 py-10">
        <h1 className="max-w-xl text-2xl font-semibold tracking-tight">
          Turn any API source into an SDK, an MCP server, a CLI, and docs.
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Point the studio at a GitHub repo, an OpenAPI spec, an existing SDK, or an MCP server. Watch it climb to one
          content-hashed IR and fan out into every surface — live.
        </p>
      </div>
      <CardContent>
        <div className="flex flex-wrap items-center gap-y-3">
          {stages.map((s, i) => (
            <React.Fragment key={s.name}>
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                <div className="text-[13px] font-semibold">{s.name}</div>
                <div className="font-mono text-[11px] text-muted-foreground">{s.sub}</div>
              </div>
              {i < stages.length - 1 ? <ArrowRight className="mx-2 h-4 w-4 shrink-0 text-muted-foreground" /> : null}
            </React.Fragment>
          ))}
        </div>
        <p className="mt-5 text-xs text-muted-foreground">
          Tip: hit a <span className="font-medium text-foreground">Try a sample</span> chip on the left to run the whole
          pipeline in one click. <span className="text-success">●</span> declared ·{' '}
          <span className="text-warning">●</span> inferred (reverse-derived).
        </p>
      </CardContent>
    </Card>
  );
}

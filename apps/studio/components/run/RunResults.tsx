'use client';

import * as React from 'react';
import { AlertTriangle, Binary, Check, FlaskConical, Layers, X } from 'lucide-react';
import type { RunState } from '@/lib/state';
import type { TestResult } from '@/lib/events';
import { cx } from '@/lib/ui';
import { Card, CardContent } from '@/components/ui';
import { PipelineView } from '@/components/PipelineView';
import { DiagnosticsPanel } from '@/components/DiagnosticsPanel';
import { IrExplorer } from '@/components/IrExplorer';
import { SurfacesBrowser } from '@/components/SurfacesBrowser';

type Tab = 'diagnostics' | 'ir' | 'surfaces' | 'tests';

/** The pipeline funnel + output tabs. Rendered only while a run is in progress or finished. */
export function RunResults({ state }: { state: RunState }) {
  const [tab, setTab] = React.useState<Tab>('ir');

  // Auto-advance the active tab as each stage lands, mirroring the live pipeline.
  React.useEffect(() => {
    if (state.ir) setTab('ir');
  }, [state.ir]);
  React.useEffect(() => {
    if (state.surfaces) setTab('surfaces');
  }, [state.surfaces]);
  React.useEffect(() => {
    if (state.tests) setTab('tests');
  }, [state.tests]);
  React.useEffect(() => {
    if (state.error || (state.ingest && !state.ingest.valid)) setTab('diagnostics');
  }, [state.error, state.ingest]);

  const diagCount =
    (state.acquire?.diagnostics.length ?? 0) + (state.ingest?.diagnostics.length ?? 0) + (state.ingest?.proposals.length ?? 0);

  const tabs: { id: Tab; label: string; count?: number; Icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'diagnostics', label: 'Diagnostics', count: diagCount, Icon: AlertTriangle },
    { id: 'ir', label: 'IR', count: state.ir?.operations.length, Icon: Binary },
    { id: 'surfaces', label: 'Surfaces', count: state.surfaces?.reduce((n, s) => n + s.files.length, 0), Icon: Layers },
    { id: 'tests', label: 'Tests', count: state.tests?.length, Icon: FlaskConical },
  ];

  return (
    <div className="space-y-6">
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
          {tab === 'ir' ? (
            state.ir ? <IrExplorer ir={state.ir} /> : <Pending label="The IR appears once the build stage completes." />
          ) : null}
          {tab === 'surfaces' ? (
            state.surfaces ? (
              <SurfacesBrowser surfaces={state.surfaces} label={state.label} />
            ) : (
              <Pending label="Surfaces appear once the project stage completes." />
            )
          ) : null}
          {tab === 'tests' ? (
            state.tests ? <TestsPanel tests={state.tests} /> : <Pending label="Test cases run automatically once the surfaces are generated." />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

/** What each test category verifies — shown under its header so the purpose is clear in the UI. */
const CATEGORY_INFO: Record<string, string> = {
  Pipeline: 'The source was fetched, validated, and normalized to one standard OpenAPI 3.1 document.',
  IR: 'The content-hashed intermediate representation — the single source every surface is built from — is well-formed.',
  Project: 'Runnable surfaces were rendered from the IR.',
  MCP: 'The generated MCP server is spec-correct and hostable (tools, JSON-Schema inputs, annotations, HTTP + Dockerfile).',
  SDK: 'The generated SDKs are structurally complete (client, resources, models, package).',
  Determinism: 'Same input → byte-identical IR and files across 3 rebuilds (the Pass^k guarantee). Reliability is verified, not assumed.',
  'Round-trip':
    'A generated surface is fed BACK through the pipeline (→ IR′) to confirm the conversion was lossless — no operations were dropped in translation. ' +
    'It works because every surface (SDK · MCP · OpenAPI) is a projection of the same IR, so the output of one direction is a valid input to another. ' +
    'A green result means you could round-trip (e.g. MCP → SDK → MCP) without losing anything — a self-test no single-direction generator (Stainless / Fern / Speakeasy) can do.',
};

/** Conversion test results — one row per check, with a green tick (pass) or red cross (fail). */
function TestsPanel({ tests }: { tests: TestResult[] }) {
  const passed = tests.filter((t) => t.status === 'pass').length;
  const failed = tests.length - passed;
  const allGreen = failed === 0;

  // Group by category, preserving first-seen order.
  const groups: { name: string; items: TestResult[] }[] = [];
  for (const t of tests) {
    let g = groups.find((x) => x.name === t.category);
    if (!g) {
      g = { name: t.category, items: [] };
      groups.push(g);
    }
    g.items.push(t);
  }

  return (
    <div className="space-y-5">
      <div
        className={cx(
          'flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-medium',
          allGreen ? 'border-emerald-600/30 bg-emerald-500/10 text-emerald-400' : 'border-red-600/30 bg-red-500/10 text-red-400',
        )}
      >
        {allGreen ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
        {allGreen ? `All ${tests.length} test cases passed` : `${failed} of ${tests.length} test cases failed`}
        <span className="ml-auto font-mono text-xs text-muted-foreground">{passed} passed · {failed} failed</span>
      </div>

      {groups.map((g) => (
        <div key={g.name}>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.name}</h4>
          {CATEGORY_INFO[g.name] ? (
            <p className="mb-2 max-w-3xl text-[12.5px] leading-relaxed text-muted-foreground">{CATEGORY_INFO[g.name]}</p>
          ) : null}
          <div className="overflow-hidden rounded-lg border border-border">
            {g.items.map((t, i) => (
              <div
                key={t.name}
                className={cx('flex items-start gap-3 px-4 py-3', i > 0 ? 'border-t border-border' : '')}
              >
                <TickCross status={t.status} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-foreground">{t.name}</div>
                  <div className="mt-0.5 truncate font-mono text-[12px] text-muted-foreground">{t.detail}</div>
                </div>
                <span
                  className={cx(
                    'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                    t.status === 'pass' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400',
                  )}
                >
                  {t.status === 'pass' ? 'PASS' : 'FAIL'}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The green tick / red cross button. */
function TickCross({ status }: { status: 'pass' | 'fail' }) {
  return (
    <span
      className={cx(
        'mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full',
        status === 'pass' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white',
      )}
      aria-label={status === 'pass' ? 'passed' : 'failed'}
    >
      {status === 'pass' ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <X className="h-3.5 w-3.5" strokeWidth={3} />}
    </span>
  );
}

function Pending({ label }: { label: string }) {
  return <p className="py-14 text-center text-sm text-muted-foreground">{label}</p>;
}

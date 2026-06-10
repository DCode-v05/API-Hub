'use client';

import * as React from 'react';
import { AlertTriangle, Binary, Layers } from 'lucide-react';
import type { RunState } from '@/lib/state';
import { cx } from '@/lib/ui';
import { Card, CardContent } from '@/components/ui';
import { PipelineView } from '@/components/PipelineView';
import { DiagnosticsPanel } from '@/components/DiagnosticsPanel';
import { IrExplorer } from '@/components/IrExplorer';
import { SurfacesBrowser } from '@/components/SurfacesBrowser';

type Tab = 'diagnostics' | 'ir' | 'surfaces';

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
    if (state.error || (state.ingest && !state.ingest.valid)) setTab('diagnostics');
  }, [state.error, state.ingest]);

  const diagCount =
    (state.acquire?.diagnostics.length ?? 0) + (state.ingest?.diagnostics.length ?? 0) + (state.ingest?.proposals.length ?? 0);

  const tabs: { id: Tab; label: string; count?: number; Icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'diagnostics', label: 'Diagnostics', count: diagCount, Icon: AlertTriangle },
    { id: 'ir', label: 'IR', count: state.ir?.operations.length, Icon: Binary },
    { id: 'surfaces', label: 'Surfaces', count: state.surfaces?.reduce((n, s) => n + s.files.length, 0), Icon: Layers },
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
        </CardContent>
      </Card>
    </div>
  );
}

function Pending({ label }: { label: string }) {
  return <p className="py-14 text-center text-sm text-muted-foreground">{label}</p>;
}

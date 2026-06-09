'use client';

import * as React from 'react';
import { AlertTriangle, CheckCircle2, Info, Lightbulb, XCircle } from 'lucide-react';
import type { DiagnosticDTO } from '@/lib/events';
import type { RunState } from '@/lib/state';
import { cx } from '@/lib/ui';

const SEV = {
  error: { Icon: XCircle, cls: 'text-danger', label: 'error' },
  warning: { Icon: AlertTriangle, cls: 'text-warning', label: 'warning' },
  note: { Icon: Info, cls: 'text-muted-foreground', label: 'note' },
} as const;

function DiagRow({ d, stage }: { d: DiagnosticDTO; stage: string }) {
  const sev = SEV[d.severity];
  return (
    <div className="flex items-start gap-2.5 px-4 py-2.5">
      <sev.Icon className={cx('mt-0.5 h-4 w-4 shrink-0', sev.cls)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <code className="font-mono text-xs text-foreground">{d.code}</code>
          <span className="rounded bg-muted px-1.5 py-px text-[10px] uppercase tracking-wide text-muted-foreground">{stage}</span>
        </div>
        <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{d.message}</p>
      </div>
    </div>
  );
}

export function DiagnosticsPanel({ state }: { state: RunState }) {
  const diags: { d: DiagnosticDTO; stage: string }[] = [
    ...(state.acquire?.diagnostics ?? []).map((d) => ({ d, stage: 'acquire' })),
    ...(state.ingest?.diagnostics ?? []).map((d) => ({ d, stage: 'ingest' })),
  ];
  const proposals = state.ingest?.proposals ?? [];
  const errors = diags.filter((x) => x.d.severity === 'error').length;
  const warnings = diags.filter((x) => x.d.severity === 'warning').length;
  const notes = diags.filter((x) => x.d.severity === 'note').length;

  if (diags.length === 0 && proposals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <CheckCircle2 className="h-8 w-8 text-success" />
        <p className="text-sm font-medium">No diagnostics</p>
        <p className="text-xs text-muted-foreground">The source was clean — nothing to report.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 px-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><XCircle className="h-3.5 w-3.5 text-danger" />{errors} error{errors === 1 ? '' : 's'}</span>
        <span className="flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 text-warning" />{warnings} warning{warnings === 1 ? '' : 's'}</span>
        <span className="flex items-center gap-1.5"><Info className="h-3.5 w-3.5" />{notes} note{notes === 1 ? '' : 's'}</span>
        {proposals.length > 0 ? (
          <span className="flex items-center gap-1.5"><Lightbulb className="h-3.5 w-3.5 text-accent" />{proposals.length} repair proposal{proposals.length === 1 ? '' : 's'}</span>
        ) : null}
      </div>

      {diags.length > 0 ? (
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {diags.map((x, i) => (
            <DiagRow key={i} d={x.d} stage={x.stage} />
          ))}
        </div>
      ) : null}

      {proposals.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1 text-[13px] font-medium">
            <Lightbulb className="h-4 w-4 text-accent" />
            Repair proposals
            <span className="text-xs font-normal text-muted-foreground">advisory · never auto-applied</span>
          </div>
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {proposals.map((p, i) => (
              <div key={i} className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="shrink-0 rounded bg-accent/10 px-1.5 py-px font-mono text-[11px] text-accent">{p.op}</span>
                  <code className="min-w-0 truncate font-mono text-xs text-muted-foreground">{p.target}</code>
                </div>
                <p className="mt-1 text-[13px] text-foreground">{p.suggestion}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{p.reason}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

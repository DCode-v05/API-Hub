'use client';

import * as React from 'react';
import { Check, ChevronRight, Copy } from 'lucide-react';
import type { Ir, IrOperation } from '@cn/contracts';
import { cx } from '@/lib/ui';
import { Badge } from './ui';

const METHOD_CLS: Record<string, string> = {
  GET: 'text-accent',
  POST: 'text-success',
  PUT: 'text-warning',
  PATCH: 'text-warning',
  DELETE: 'text-danger',
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        if (!navigator.clipboard) return;
        navigator.clipboard.writeText(text).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          },
          () => {},
        );
      }}
      className="text-muted-foreground transition-colors hover:text-foreground"
      title="Copy"
      aria-label={copied ? 'Copied' : 'Copy'}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-medium">{value}</div>
    </div>
  );
}

function OperationRow({ op }: { op: IrOperation }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50"
      >
        <ChevronRight className={cx('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
        <span className={cx('w-14 shrink-0 font-mono text-xs font-semibold', METHOD_CLS[op.method] ?? 'text-foreground')}>{op.method}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{op.path}</span>
        <Badge variant="outline" className="hidden sm:inline-flex">{op.auth}</Badge>
        <code className="hidden shrink-0 font-mono text-[11px] text-muted-foreground md:block">{op.id}</code>
      </button>
      {open ? (
        <div className="space-y-3 border-t border-border bg-muted/30 px-4 py-3 animate-fade-in">
          {op.summary ? <p className="text-[13px] text-foreground">{op.summary}</p> : null}
          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Input</div>
            {op.input.length === 0 ? (
              <p className="text-xs text-muted-foreground">No parameters.</p>
            ) : (
              <div className="overflow-hidden rounded-md border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/60 text-muted-foreground">
                    <tr>
                      <th className="px-2.5 py-1.5 font-medium">name</th>
                      <th className="px-2.5 py-1.5 font-medium">type</th>
                      <th className="px-2.5 py-1.5 font-medium">in</th>
                      <th className="px-2.5 py-1.5 font-medium">required</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border font-mono">
                    {op.input.map((f) => (
                      <tr key={f.name + f.in}>
                        <td className="px-2.5 py-1.5">{f.name}</td>
                        <td className="px-2.5 py-1.5 text-muted-foreground">{f.ref ?? f.type}</td>
                        <td className="px-2.5 py-1.5 text-muted-foreground">{f.in}</td>
                        <td className="px-2.5 py-1.5">{f.required ? <span className="text-success">yes</span> : <span className="text-muted-foreground">no</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {op.output.length > 0 ? (
            <div>
              <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Output</div>
              <div className="flex flex-wrap gap-1.5">
                {op.output.map((o) => (
                  <span key={`${o.status}-${o.ref ?? o.type}`} className="rounded border border-border px-2 py-0.5 font-mono text-xs">
                    {o.status} → {o.ref ?? o.type}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function IrExplorer({ ir }: { ir: Ir }) {
  const schemaNames = Object.keys(ir.schemas ?? {});
  const byResource = new Map<string, IrOperation[]>();
  for (const op of ir.operations) {
    const list = byResource.get(op.resource) ?? [];
    list.push(op);
    byResource.set(op.resource, list);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="API" value={`${ir.title} ${ir.apiVersion}`} />
          <Stat label="Operations" value={ir.operations.length} />
          <Stat label="Schemas" value={schemaNames.length} />
          <Stat label="IR version" value={<span className="font-mono">{ir.irVersion}</span>} />
        </div>
        <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">hash</span>
          <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{ir.hash}</code>
          <CopyButton text={ir.hash} />
        </div>
        {ir.servers.length > 0 ? (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">server</span>
            <code className="truncate font-mono text-xs text-muted-foreground">{ir.servers[0]}</code>
          </div>
        ) : null}
      </div>

      <div className="space-y-4">
        {[...byResource.entries()].map(([resource, ops]) => (
          <div key={resource} className="overflow-hidden rounded-lg border border-border">
            <div className="flex items-center justify-between bg-muted/40 px-4 py-2">
              <span className="text-[13px] font-semibold">{resource}</span>
              <span className="font-mono text-xs text-muted-foreground">{ops.length} op{ops.length === 1 ? '' : 's'}</span>
            </div>
            <div className="divide-y divide-border">
              {ops.map((op) => (
                <OperationRow key={op.id} op={op} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

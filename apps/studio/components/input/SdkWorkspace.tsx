'use client';

import * as React from 'react';
import { AlertTriangle, CheckCircle2, FolderSearch, Loader2, Package } from 'lucide-react';
import type { RunRequest } from '@/lib/events';
import { cx } from '@/lib/ui';
import { Button, Field, Input, Label, SegmentedControl } from '@/components/ui';
import { InputWorkspace } from './InputWorkspace';

type Lang = '' | 'typescript' | 'python';

interface Form {
  sdkPath: string;
  lang: Lang;
}

const EMPTY: Form = { sdkPath: '', lang: '' };

interface Check {
  ok: boolean;
  exists?: boolean;
  isDir?: boolean;
  detected?: 'typescript' | 'python' | null;
  entries?: string[];
  resolved?: string;
  error?: string;
}

const SAMPLES = [
  { label: 'TypeScript sample', path: 'samples/sdk-typescript' },
  { label: 'Python sample', path: 'samples/sdk-python' },
];

function toRequest(f: Form): RunRequest {
  return { kind: 'sdk', sdkPath: f.sdkPath.trim(), lang: f.lang || undefined };
}

export function SdkWorkspace() {
  const [f, setF] = React.useState<Form>(EMPTY);
  const set = (patch: Partial<Form>) => setF((prev) => ({ ...prev, ...patch }));
  const [checking, setChecking] = React.useState(false);
  const [check, setCheck] = React.useState<Check | null>(null);

  const runnable = f.sdkPath.trim().length > 0;

  async function validate() {
    if (!runnable) return;
    setChecking(true);
    setCheck(null);
    try {
      const res = await fetch('/api/fs/check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: f.sdkPath.trim() }),
      });
      const data = (await res.json()) as Check;
      setCheck(data);
      if (data.ok && data.detected && !f.lang) set({ lang: data.detected });
    } catch (e) {
      setCheck({ ok: false, error: e instanceof Error ? e.message : 'Request failed' });
    } finally {
      setChecking(false);
    }
  }

  return (
    <InputWorkspace
      kind="sdk"
      title="Existing SDK"
      description="Reverse-derive an API from a TypeScript or Python client. If the package embeds a spec it's used directly; otherwise method signatures are introspected. Carries lower (inferred) trust."
      Icon={Package}
      trust="inferred"
      request={toRequest(f)}
      runnable={runnable}
      invalidHint="Enter the local path to an SDK directory."
      onLoadPreset={(req) => {
        setCheck(null);
        setF({ sdkPath: req.sdkPath ?? '', lang: (req.lang as Lang) ?? '' });
      }}
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <Label>SDK directory</Label>
            <span className="text-xs text-muted-foreground">local path</span>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="samples/sdk-typescript"
              value={f.sdkPath}
              onChange={(e) => set({ sdkPath: e.target.value })}
              className="font-mono"
            />
            <Button variant="secondary" onClick={validate} disabled={!runnable || checking} className="shrink-0">
              {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderSearch className="h-4 w-4" />}
              Validate
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {SAMPLES.map((s) => (
              <button
                key={s.path}
                type="button"
                onClick={() => set({ sdkPath: s.path })}
                className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <Field label="Language" hint="auto-detected from the directory">
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

        {check ? (
          check.ok && check.exists ? (
            <div className="space-y-2 rounded-md border border-success/25 bg-success/5 p-3">
              <p className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-success">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Found {check.isDir ? 'directory' : 'file'}
                {check.detected ? (
                  <span className="text-muted-foreground">
                    · detected <code className="font-mono text-foreground">{check.detected}</code>
                  </span>
                ) : null}
              </p>
              {check.resolved ? (
                <p className="break-all font-mono text-[11px] text-muted-foreground">{check.resolved}</p>
              ) : null}
              {check.entries && check.entries.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {check.entries.slice(0, 18).map((e) => (
                    <code key={e} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {e}
                    </code>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="flex items-center gap-1.5 rounded-md border border-danger/25 bg-danger/5 px-3 py-2 text-xs text-danger">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {check.error}
            </p>
          )
        ) : null}

        <div className={cx('rounded-md border border-border bg-muted/20 p-3 text-[11px] leading-relaxed text-muted-foreground')}>
          <span className="font-medium text-foreground">What gets read:</span> an embedded spec if present, otherwise exported
          client methods are introspected into operations. Reverse-derived schemas are scanned for external <code className="font-mono">$ref</code>s too.
        </div>
      </div>
    </InputWorkspace>
  );
}

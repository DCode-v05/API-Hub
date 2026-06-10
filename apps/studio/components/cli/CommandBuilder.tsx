'use client';

import * as React from 'react';
import { Terminal as TerminalIcon } from 'lucide-react';
import { cx } from '@/lib/ui';
import { Field, Input, Label, SegmentedControl } from '@/components/ui';
import { CopyButton } from '@/components/run/CopyButton';

type Command = 'run' | 'acquire' | 'ingest' | 'build' | 'project';
type Kind = 'github' | 'openapi' | 'sdk' | 'mcp';

const COMMANDS: { value: Command; label: string; desc: string }[] = [
  { value: 'run', label: 'run', desc: 'Acquire → ingest → build → project (everything).' },
  { value: 'acquire', label: 'acquire', desc: 'Fetch + pin into a canonical artifact.' },
  { value: 'ingest', label: 'ingest', desc: 'Adapt · assemble · validate · repair.' },
  { value: 'build', label: 'build', desc: 'Build the content-hashed IR.' },
  { value: 'project', label: 'project', desc: 'Render the IR into surfaces.' },
];

const KINDS: { value: Kind; label: string }[] = [
  { value: 'github', label: 'GitHub' },
  { value: 'openapi', label: 'OpenAPI' },
  { value: 'sdk', label: 'SDK' },
  { value: 'mcp', label: 'MCP' },
];

const SURFACES = ['sdk-typescript', 'sdk-python', 'mcp', 'cli', 'docs'];

interface State {
  command: Command;
  kind: Kind;
  repo: string;
  ref: string;
  spec: string;
  openapi: string;
  sdk: string;
  lang: '' | 'typescript' | 'python';
  mcp: string;
  mcpCommand: boolean;
  out: string;
  ir: boolean;
  only: string[];
}

const INIT: State = {
  command: 'run',
  kind: 'openapi',
  repo: '',
  ref: '',
  spec: '',
  openapi: 'samples/openapi/tasks-api.yaml',
  sdk: 'samples/sdk-typescript',
  mcp: 'samples/mcp/tasks-tools.json',
  mcpCommand: false,
  lang: '',
  out: '',
  ir: false,
  only: [],
};

function quote(arg: string): string {
  if (arg === '') return '""';
  return /[\s"'`$&|;<>(){}\\]/.test(arg) ? `"${arg.replace(/(["\\$`])/g, '\\$1')}"` : arg;
}

function buildArgs(s: State): string[] {
  const argv: string[] = [s.command];
  switch (s.kind) {
    case 'github':
      argv.push('--github', s.repo.trim() || 'owner/repo');
      if (s.ref.trim()) argv.push('--ref', s.ref.trim());
      if (s.spec.trim()) argv.push('--spec', s.spec.trim());
      break;
    case 'openapi':
      argv.push('--openapi', s.openapi.trim() || './openapi.yaml');
      break;
    case 'sdk':
      argv.push('--sdk', s.sdk.trim() || './sdk-dir');
      if (s.lang) argv.push('--lang', s.lang);
      break;
    case 'mcp':
      argv.push('--mcp', s.mcp.trim() || './tools.json');
      if (s.mcpCommand) argv.push('--command');
      break;
  }
  if ((s.command === 'run' || s.command === 'project') && s.only.length > 0) argv.push('--only', s.only.join(','));
  if (s.command === 'run' && s.ir) argv.push('--ir');
  if (s.out.trim()) argv.push('-o', s.out.trim());
  return argv;
}

export function CommandBuilder({ onRun }: { onRun: (args: string[]) => void }) {
  const [s, setS] = React.useState<State>(INIT);
  const set = (patch: Partial<State>) => setS((prev) => ({ ...prev, ...patch }));
  const argv = buildArgs(s);
  const display = ['cn', ...argv].map(quote).join(' ');

  const toggleOnly = (k: string) =>
    set({ only: s.only.includes(k) ? s.only.filter((x) => x !== k) : [...s.only, k] });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <div className="space-y-5">
        {/* Command */}
        <div className="space-y-2">
          <Label>Command</Label>
          <div className="flex flex-wrap gap-1.5">
            {COMMANDS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => set({ command: c.value })}
                className={cx(
                  'rounded-md px-3 py-1.5 font-mono text-xs transition-colors',
                  s.command === c.value ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground',
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{COMMANDS.find((c) => c.value === s.command)?.desc}</p>
        </div>

        {/* Input type */}
        <div className="space-y-2">
          <Label>Input</Label>
          <SegmentedControl options={KINDS} value={s.kind} onChange={(v) => set({ kind: v })} />
        </div>

        {/* Per-kind fields */}
        {s.kind === 'github' ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Repo">
              <Input value={s.repo} onChange={(e) => set({ repo: e.target.value })} placeholder="owner/repo" className="font-mono" />
            </Field>
            <Field label="Ref">
              <Input value={s.ref} onChange={(e) => set({ ref: e.target.value })} placeholder="main" className="font-mono" />
            </Field>
            <Field label="Spec">
              <Input value={s.spec} onChange={(e) => set({ spec: e.target.value })} placeholder="openapi.yaml" className="font-mono" />
            </Field>
          </div>
        ) : null}
        {s.kind === 'openapi' ? (
          <Field label="OpenAPI URL or path">
            <Input value={s.openapi} onChange={(e) => set({ openapi: e.target.value })} className="font-mono" />
          </Field>
        ) : null}
        {s.kind === 'sdk' ? (
          <div className="space-y-3">
            <Field label="SDK directory">
              <Input value={s.sdk} onChange={(e) => set({ sdk: e.target.value })} className="font-mono" />
            </Field>
            <Field label="Language">
              <SegmentedControl
                value={s.lang || 'auto'}
                onChange={(v) => set({ lang: v === 'auto' ? '' : (v as 'typescript' | 'python') })}
                options={[
                  { value: 'auto', label: 'Auto' },
                  { value: 'typescript', label: 'TypeScript' },
                  { value: 'python', label: 'Python' },
                ]}
              />
            </Field>
          </div>
        ) : null}
        {s.kind === 'mcp' ? (
          <div className="space-y-2">
            <Field label="MCP manifest / command">
              <Input value={s.mcp} onChange={(e) => set({ mcp: e.target.value })} className="font-mono" />
            </Field>
            <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <input type="checkbox" checked={s.mcpCommand} onChange={(e) => set({ mcpCommand: e.target.checked })} className="h-3.5 w-3.5" />
              Treat as a stdio command (<code className="font-mono">--command</code>)
            </label>
          </div>
        ) : null}

        {/* Options */}
        <div className="space-y-3 border-t border-border pt-4">
          <Label>Options</Label>
          {s.command === 'run' || s.command === 'project' ? (
            <div className="space-y-1.5">
              <span className="text-xs text-muted-foreground">
                <code className="font-mono">--only</code> surfaces {s.only.length === 0 ? '(all)' : ''}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {SURFACES.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => toggleOnly(k)}
                    className={cx(
                      'rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors',
                      s.only.includes(k) ? 'border-foreground/30 bg-foreground text-background' : 'border-border bg-card text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-4">
            {s.command === 'run' ? (
              <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <input type="checkbox" checked={s.ir} onChange={(e) => set({ ir: e.target.checked })} className="h-3.5 w-3.5" />
                <code className="font-mono">--ir</code> (store each IR)
              </label>
            ) : null}
            <div className="flex items-center gap-2">
              <Label className="text-muted-foreground">
                <code className="font-mono">-o</code>
              </Label>
              <Input value={s.out} onChange={(e) => set({ out: e.target.value })} placeholder="out/" className="h-8 w-40 font-mono text-xs" />
            </div>
          </div>
        </div>
      </div>

      {/* Preview */}
      <div className="lg:sticky lg:top-20 lg:self-start">
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <TerminalIcon className="h-3.5 w-3.5" /> Generated command
            </span>
            <CopyButton text={display} />
          </div>
          <pre className="overflow-x-auto px-3 py-3 font-mono text-[13px] leading-relaxed text-foreground">
            <code>{display}</code>
          </pre>
          <div className="border-t border-border p-3">
            <button
              type="button"
              onClick={() => onRun(argv)}
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
            >
              <TerminalIcon className="h-4 w-4" />
              Run in terminal
            </button>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Tip: run with no input flags (<code className="font-mono">cn run</code>) to use every input listed in <code className="font-mono">cn.config.json</code>.
        </p>
      </div>
    </div>
  );
}

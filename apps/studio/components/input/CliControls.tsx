'use client';

import { Check, Info, Pencil, Play, Terminal as TerminalIcon } from 'lucide-react';
import { SUBCOMMANDS, SURFACES, type InputCli } from '@/lib/useInputCli';
import { cx } from '@/lib/ui';
import { CopyButton } from '@/components/run/CopyButton';

/** Left-column CLI controls: subcommand, options, the generated command, and Run / Insert. */
export function CliControls({ cli }: { cli: InputCli }) {
  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="space-y-2">
        <span className="text-[13px] font-medium">Builder</span>
        <div className="flex flex-wrap gap-1.5">
          {SUBCOMMANDS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => cli.setSub(c)}
              className={cx(
                'rounded-md px-2.5 py-1 font-mono text-xs transition-colors',
                cli.sub === c ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Options (only for subcommands that support them) */}
      {cli.showOnly || cli.showIr ? (
        <div className="space-y-2.5">
          {cli.showOnly ? (
            <div className="space-y-1.5">
              <span className="text-xs text-muted-foreground">
                <code className="font-mono">--only</code> surfaces {cli.only.length === 0 ? '(all)' : ''}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {SURFACES.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => cli.toggleOnly(k)}
                    className={cx(
                      'rounded-full border px-2 py-0.5 font-mono text-[10px] transition-colors',
                      cli.only.includes(k) ? 'border-foreground/30 bg-foreground text-background' : 'border-border bg-card text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {cli.showIr ? (
            <button
              type="button"
              onClick={() => cli.setIr(!cli.ir)}
              aria-pressed={cli.ir}
              className={cx(
                'inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-[13px] transition-colors',
                cli.ir ? 'border-foreground/30 bg-muted text-foreground' : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              <span
                className={cx(
                  'flex h-4 w-4 items-center justify-center rounded-[4px] border transition-colors',
                  cli.ir ? 'border-foreground bg-foreground text-background' : 'border-muted-foreground/40',
                )}
              >
                {cli.ir ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
              </span>
              <code className="font-mono">--ir</code>
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Generated command */}
      <div className="space-y-2 rounded-md border border-border bg-muted/20 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <TerminalIcon className="h-3.5 w-3.5" /> Command
          </span>
          <CopyButton text={cli.display} />
        </div>
        <pre className="overflow-x-auto font-mono text-[12px] leading-relaxed text-foreground">
          <code>{cli.display}</code>
        </pre>
        {cli.note ? (
          <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Info className="mt-px h-3 w-3 shrink-0" />
            {cli.note}
          </p>
        ) : null}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={cli.run}
          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
        >
          <Play className="h-4 w-4" />
          Run
        </button>
        <button
          type="button"
          onClick={cli.insert}
          title="Put the command in the prompt to edit before running"
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-border px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <Pencil className="h-4 w-4" />
          Insert
        </button>
      </div>
    </div>
  );
}

'use client';

import * as React from 'react';
import { BookOpen, Layers, Terminal as TerminalIcon } from 'lucide-react';
import type { InputCli } from '@/lib/useInputCli';
import { cx } from '@/lib/ui';
import { Terminal } from '@/components/cli/Terminal';
import { CliDocs } from '@/components/cli/CliDocs';
import { OutputFiles } from '@/components/cli/OutputFiles';

type View = 'terminal' | 'output' | 'help';

/** Right-column CLI output: the live terminal, the files cn produced, and the full `cn` reference. */
export function CliOutput({ cli }: { cli: InputCli }) {
  const [view, setView] = React.useState<View>('terminal');
  const hasOutput = !!cli.artifacts && cli.artifacts.length > 0;

  // While a run is starting, keep the terminal in view; jump to Output once files land.
  React.useEffect(() => {
    if (cli.queued) setView('terminal');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cli.queued?.token]);
  React.useEffect(() => {
    if (hasOutput) setView('output');
  }, [cli.artifacts, hasOutput]);
  // On Clear, drop back to the (now empty) terminal.
  React.useEffect(() => {
    if (cli.clearToken) setView('terminal');
  }, [cli.clearToken]);

  const tabs: { id: View; label: string; Icon: React.ComponentType<{ className?: string }>; count?: number }[] = [
    { id: 'terminal', label: 'Terminal', Icon: TerminalIcon },
    { id: 'output', label: 'Output', Icon: Layers, count: hasOutput ? cli.artifacts!.length : undefined },
    { id: 'help', label: 'Help', Icon: BookOpen },
  ];

  return (
    <div className="space-y-4">
      <div className="inline-flex gap-1 rounded-lg border border-border bg-muted p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setView(t.id)}
            className={cx(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
              view === t.id ? 'bg-card text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <t.Icon className="h-3.5 w-3.5" />
            {t.label}
            {t.count != null ? (
              <span className="rounded-full bg-muted px-1.5 text-[11px] font-normal text-muted-foreground">{t.count}</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Terminal stays mounted so its session survives switching tabs. */}
      <div className={cx(view === 'terminal' ? 'block' : 'hidden')}>
        <Terminal queued={cli.queued} insert={cli.inserted} onArtifacts={cli.setArtifacts} clearToken={cli.clearToken} auth={cli.auth} />
      </div>
      {view === 'output' ? (
        hasOutput ? (
          <OutputFiles files={cli.artifacts!} truncated={cli.artifactsTruncated} />
        ) : (
          <p className="rounded-lg border border-dashed border-border bg-card/40 px-4 py-14 text-center text-sm text-muted-foreground">
            Run a producing command (run · build · project · acquire · ingest) and the generated files appear here, with a .zip download.
          </p>
        )
      ) : null}
      {view === 'help' ? <CliDocs /> : null}
    </div>
  );
}

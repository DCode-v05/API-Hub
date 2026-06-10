'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { BookOpen, SlidersHorizontal, Terminal as TerminalIcon } from 'lucide-react';
import { tokenize } from '@/lib/cli-client';
import { cx } from '@/lib/ui';
import { Terminal } from './Terminal';
import { CommandBuilder } from './CommandBuilder';
import { CliDocs } from './CliDocs';

type Tab = 'terminal' | 'builder' | 'docs';

const TABS: { id: Tab; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'terminal', label: 'Terminal', Icon: TerminalIcon },
  { id: 'builder', label: 'Builder', Icon: SlidersHorizontal },
  { id: 'docs', label: 'Docs', Icon: BookOpen },
];

export function CliWorkspace() {
  const params = useSearchParams();
  const cmd = params.get('cmd') ?? '';
  const [tab, setTab] = React.useState<Tab>('terminal');
  const [queued, setQueued] = React.useState<{ args: string[]; token: number } | null>(null);
  const tokenRef = React.useRef(0);

  // Deep link from an input page's "Open in terminal" — prefill and auto-run.
  React.useEffect(() => {
    if (cmd) {
      tokenRef.current += 1;
      setQueued({ args: tokenize(cmd), token: tokenRef.current });
      setTab('terminal');
    }
  }, [cmd]);

  const runInTerminal = (args: string[]) => {
    tokenRef.current += 1;
    setQueued({ args, token: tokenRef.current });
    setTab('terminal');
  };

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Command line</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Run <code className="font-mono">cn</code> in a live terminal, build commands visually, or read the full reference.
        </p>
      </header>

      <div className="mb-5 inline-flex gap-1 rounded-lg border border-border bg-muted p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cx(
              'inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-colors',
              tab === t.id ? 'bg-card text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <t.Icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Keep the Terminal mounted across tab switches so its session/output persists. */}
      <div className={cx(tab === 'terminal' ? 'block' : 'hidden')}>
        <Terminal prefill={cmd} queued={queued} />
      </div>
      {tab === 'builder' ? <CommandBuilder onRun={runInTerminal} /> : null}
      {tab === 'docs' ? <CliDocs /> : null}
    </div>
  );
}

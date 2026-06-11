'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { Play, Terminal as TerminalIcon, Workflow } from 'lucide-react';
import type { RunRequest, StageSourceKind } from '@/lib/events';
import { useRun } from '@/lib/useRun';
import { useInputCli } from '@/lib/useInputCli';
import { fetchPresets } from '@/lib/client/api';
import { cx } from '@/lib/ui';
import { Button, Spinner } from '@/components/ui';
import { PresetsToolbar } from '@/components/run/PresetsToolbar';
import { RunResults } from '@/components/run/RunResults';
import { CliControls } from './CliControls';
import { CliOutput } from './CliOutput';

type Mode = 'studio' | 'cli';

function ModeToggle({ mode, setMode, shortcut }: { mode: Mode; setMode: (m: Mode) => void; shortcut: string }) {
  const items: { id: Mode; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'studio', label: 'Studio', Icon: Workflow },
    { id: 'cli', label: 'CLI', Icon: TerminalIcon },
  ];
  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex rounded-lg border border-border bg-muted p-1">
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            onClick={() => setMode(it.id)}
            aria-pressed={mode === it.id}
            className={cx(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
              mode === it.id ? 'bg-card text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <it.Icon className="h-3.5 w-3.5" />
            {it.label}
          </button>
        ))}
      </div>
      <kbd
        title="Swap Studio / CLI"
        className="hidden items-center rounded border border-border bg-muted px-1.5 py-1 font-mono text-[10px] text-muted-foreground sm:inline-flex"
      >
        {shortcut}
      </kbd>
    </div>
  );
}

export function InputWorkspace({
  kind,
  title,
  description,
  Icon,
  trust,
  request,
  runnable,
  invalidHint,
  onLoadPreset,
  children,
}: {
  kind: StageSourceKind;
  title: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
  trust: 'declared' | 'inferred';
  request: RunRequest;
  runnable: boolean;
  invalidHint?: string;
  onLoadPreset: (req: RunRequest) => void;
  children: React.ReactNode;
}) {
  const { state, running, run } = useRun();
  const cli = useInputCli(request);
  const [mode, setMode] = React.useState<Mode>('studio');
  const [isMac, setIsMac] = React.useState(false);
  const active = state.status !== 'idle';

  // Studio splits once a run starts; CLI is split (terminal beside the controls) from the off.
  const split = mode === 'cli' || (mode === 'studio' && active);

  const studioRef = React.useRef<HTMLDivElement>(null);
  const cliRef = React.useRef<HTMLDivElement>(null);

  // Load a preset chosen from the sidebar (?preset=<id>) into the form, once per id.
  const params = useSearchParams();
  const presetId = params.get('preset');
  const loadedPreset = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!presetId || loadedPreset.current === presetId) return;
    loadedPreset.current = presetId;
    let alive = true;
    fetchPresets(kind).then((list) => {
      const preset = list.find((p) => p.id === presetId);
      if (alive && preset) onLoadPreset(preset.request);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetId, kind]);

  React.useEffect(() => {
    setIsMac(typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || navigator.userAgent));
  }, []);

  // Keyboard shortcut: Ctrl/⌘ + ; swaps Studio ↔ CLI (home-row, no browser conflicts).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === ';' || e.code === 'Semicolon')) {
        e.preventDefault();
        setMode((m) => (m === 'studio' ? 'cli' : 'studio'));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // On smaller screens the columns stack — bring the output into view when a run starts.
  React.useEffect(() => {
    if (mode === 'studio' && active) studioRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [active, mode]);
  React.useEffect(() => {
    if (mode === 'cli' && cli.queued) cliRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cli.queued?.token, mode]);

  const shortcut = isMac ? '⌘ ;' : 'Ctrl ;';

  return (
    <div
      className={cx(
        'mx-auto px-4 py-6 transition-[max-width] duration-500 ease-out sm:px-6 lg:px-8',
        // When split, become a fixed-height panel so the page itself doesn't scroll — only the
        // right (output) column scrolls internally; the header + input stay put.
        split ? 'max-w-[1480px] xl:flex xl:h-[calc(100dvh-3.5rem)] xl:flex-col xl:overflow-hidden' : 'max-w-3xl',
      )}
    >
      {/* Header: input type with the Studio/CLI toggle right beside it. */}
      <header className="mb-5 flex items-start gap-4 xl:shrink-0">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/40 text-foreground">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            <div className="w-full sm:ml-auto sm:w-auto">
              <ModeToggle mode={mode} setMode={setMode} shortcut={shortcut} />
            </div>
          </div>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p>
        </div>
      </header>

      {/* Centered input that slides left into an equal split once there's output. The grid columns
          animate from [1fr 0fr] to [1fr 1fr] while the container widens — a smooth glide. */}
      <div
        className={cx(
          'grid grid-cols-1 gap-6 transition-[grid-template-columns] duration-500 ease-out',
          // Split: fill the panel height (one full-height row) so each column can scroll on its own.
          split ? 'xl:min-h-0 xl:flex-1 xl:grid-cols-[1fr_1fr] xl:grid-rows-[minmax(0,1fr)]' : 'xl:grid-cols-[1fr_0fr]',
        )}
      >
        {/* LEFT — input. Fixed in place; only scrolls internally if it can't fit the panel height. */}
        <div className="min-w-0 space-y-5 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
          <div className="rounded-lg border border-border bg-card p-5">
            <PresetsToolbar kind={kind} request={request} onLoad={onLoadPreset} />
            <div className="my-4 h-px bg-border" />
            {children}
          </div>

          {/* Studio actions */}
          <div className={cx(mode === 'studio' ? 'block' : 'hidden')}>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="lg" onClick={() => void run(request)} disabled={!runnable || running}>
                {running ? (
                  <>
                    <Spinner className="h-4 w-4" />
                    Running pipeline…
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Run pipeline
                  </>
                )}
              </Button>
              {!runnable && invalidHint ? <span className="text-xs text-muted-foreground">{invalidHint}</span> : null}
            </div>
          </div>

          {/* CLI controls */}
          <div className={cx(mode === 'cli' ? 'block' : 'hidden')}>
            <CliControls cli={cli} />
          </div>
        </div>

        {/* RIGHT — output. The only scrolling region when split: it scrolls internally while the
            header + input stay put. Always mounted so run state + terminal session persist. */}
        <div className="min-w-0 overflow-hidden xl:min-h-0 xl:overflow-y-auto">
          <div ref={studioRef} className={cx('scroll-mt-20', mode === 'studio' ? 'block' : 'hidden')}>
            {active ? <RunResults state={state} /> : null}
          </div>
          <div ref={cliRef} className={cx('scroll-mt-20', mode === 'cli' ? 'block' : 'hidden')}>
            <CliOutput cli={cli} />
          </div>
        </div>
      </div>
    </div>
  );
}

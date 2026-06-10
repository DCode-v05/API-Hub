'use client';

import * as React from 'react';
import { CornerDownLeft, Square, Trash2 } from 'lucide-react';
import { runCliStream, tokenize, type CliEvent } from '@/lib/cli-client';
import { cx } from '@/lib/ui';

type Entry = { kind: 'cmd' | 'out' | 'err' | 'sys'; text: string };

const ENTRY_CLASS: Record<Entry['kind'], string> = {
  cmd: 'text-accent font-medium',
  out: 'text-foreground',
  err: 'text-muted-foreground',
  sys: 'text-muted-foreground',
};

const QUICK: { label: string; cmd: string }[] = [
  { label: 'help', cmd: 'help' },
  { label: 'version', cmd: 'version' },
  { label: 'run · OpenAPI sample', cmd: 'run --openapi samples/openapi/tasks-api.yaml' },
  { label: 'project · MCP sample', cmd: 'project --mcp samples/mcp/tasks-tools.json' },
];

export function Terminal({ prefill, queued }: { prefill?: string; queued?: { args: string[]; token: number } | null }) {
  const [entries, setEntries] = React.useState<Entry[]>([
    { kind: 'sys', text: 'Connector Network CLI — type a cn command and press Enter. Try "help".\n' },
  ]);
  const [input, setInput] = React.useState(prefill ?? '');
  const [running, setRunning] = React.useState(false);
  const [history, setHistory] = React.useState<string[]>([]);
  const histIdx = React.useRef<number>(-1);
  const acRef = React.useRef<AbortController | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inFlight = React.useRef(false);

  const append = React.useCallback((e: Entry) => {
    setEntries((prev) => {
      const next = [...prev, e];
      return next.length > 1200 ? next.slice(next.length - 1200) : next;
    });
  }, []);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries]);

  const runArgs = React.useCallback(
    async (args: string[]) => {
      if (inFlight.current || args.length === 0) return;
      inFlight.current = true;
      setRunning(true);
      append({ kind: 'cmd', text: `\n$ cn ${args.join(' ')}\n` });
      const ac = new AbortController();
      acRef.current = ac;
      const onEvent = (ev: CliEvent) => {
        if (ev.t === 'out') append({ kind: 'out', text: ev.data });
        else if (ev.t === 'err') append({ kind: 'err', text: ev.data });
        else if (ev.t === 'exit') append({ kind: 'sys', text: `\n[process exited with code ${ev.code}]\n` });
      };
      try {
        await runCliStream(args, onEvent, ac.signal);
      } finally {
        inFlight.current = false;
        setRunning(false);
        acRef.current = null;
      }
    },
    [append],
  );

  // Run programmatic commands handed in from the builder or a deep link.
  React.useEffect(() => {
    if (queued && queued.token > 0 && queued.args.length > 0) {
      setInput(queued.args.join(' '));
      void runArgs(queued.args);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queued?.token]);

  function submit(raw: string) {
    const args = tokenize(raw.trim());
    if (args.length === 0) return;
    setHistory((h) => [...h, raw.trim()]);
    histIdx.current = -1;
    setInput('');
    void runArgs(args);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit(input);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      histIdx.current = histIdx.current < 0 ? history.length - 1 : Math.max(0, histIdx.current - 1);
      setInput(history[histIdx.current] ?? '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (histIdx.current < 0) return;
      histIdx.current += 1;
      if (histIdx.current >= history.length) {
        histIdx.current = -1;
        setInput('');
      } else {
        setInput(history[histIdx.current] ?? '');
      }
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {QUICK.map((q) => (
          <button
            key={q.cmd}
            type="button"
            disabled={running}
            onClick={() => submit(q.cmd)}
            className="rounded-full border border-border bg-muted/40 px-2.5 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            {q.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1.5">
          {running ? (
            <button
              type="button"
              onClick={() => acRef.current?.abort()}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-danger"
            >
              <Square className="h-3 w-3" /> Stop
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setEntries([])}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <Trash2 className="h-3 w-3" /> Clear
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-[#0b0b0c] text-[#e5e5e5] dark:bg-[#0b0b0c]">
        <div className="flex items-center gap-1.5 border-b border-white/10 px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          <span className="ml-2 font-mono text-[11px] text-white/40">cn — connector-network</span>
        </div>
        <div ref={scrollRef} className="h-[420px] overflow-y-auto px-4 py-3 font-mono text-[12px] leading-relaxed">
          <pre className="whitespace-pre-wrap break-words">
            {entries.map((e, i) => (
              <span key={i} className={cx(e.kind === 'cmd' ? 'text-[#7aa2f7] font-medium' : e.kind === 'sys' ? 'text-white/45' : e.kind === 'err' ? 'text-white/70' : 'text-[#e5e5e5]')}>
                {e.text}
              </span>
            ))}
            {running ? <span className="animate-pulse text-white/60">▋</span> : null}
          </pre>
        </div>
        <div className="flex items-center gap-2 border-t border-white/10 px-3 py-2.5">
          <span className="select-none font-mono text-[12px] text-[#28c840]">cn</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={running}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            placeholder={running ? 'running…' : 'run --openapi samples/openapi/tasks-api.yaml'}
            className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-white placeholder:text-white/30 focus:outline-none disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => submit(input)}
            disabled={running || !input.trim()}
            className="inline-flex items-center gap-1 rounded-md border border-white/15 px-2 py-1 text-[11px] text-white/70 transition-colors hover:text-white disabled:opacity-40"
          >
            <CornerDownLeft className="h-3 w-3" /> Run
          </button>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Runs the real <code className="font-mono text-foreground">cn</code> binary on this machine from the repo root. ↑/↓ recalls history. Only <code className="font-mono">cn</code> subcommands are permitted.
      </p>
    </div>
  );
}

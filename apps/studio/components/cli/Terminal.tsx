'use client';

import * as React from 'react';
import { CornerDownLeft, Square } from 'lucide-react';
import { runCliStream, tokenize, type CliEvent, type CliFile } from '@/lib/cli-client';
import { fetchPats, notifyPresetsChanged, savePat } from '@/lib/client/api';
import type { PatDTO } from '@/lib/records';
import { cx } from '@/lib/ui';

type Entry = { kind: 'cmd' | 'out' | 'err' | 'sys'; text: string };

const WELCOME: Entry = { kind: 'sys', text: 'Connector Network CLI — type a cn command and press Enter. Try "help".\n' };

const QUICK: { label: string; cmd: string }[] = [
  { label: 'help', cmd: 'help' },
  { label: 'version', cmd: 'version' },
  { label: 'run · OpenAPI sample', cmd: 'run --openapi samples/openapi/tasks-api.yaml' },
  { label: 'project · MCP sample', cmd: 'project --mcp samples/mcp/tasks-tools.json' },
];

type Auth = { pat?: string; patId?: string };

// A multi-step, in-terminal prompt for a missing GitHub PAT (mimics git/sudo password prompts).
type PatStep =
  | { kind: 'choose'; args: string[]; pats: PatDTO[] }
  | { kind: 'token'; args: string[] }
  | { kind: 'save'; args: string[]; token: string }
  | { kind: 'name'; args: string[]; token: string };

export function Terminal({
  prefill,
  queued,
  insert,
  onArtifacts,
  clearToken,
  auth,
}: {
  prefill?: string;
  queued?: { args: string[]; token: number } | null;
  insert?: { text: string; token: number } | null;
  onArtifacts?: (files: CliFile[] | null, truncated?: boolean) => void;
  clearToken?: number;
  auth?: Auth;
}) {
  const [entries, setEntries] = React.useState<Entry[]>([WELCOME]);
  const [input, setInput] = React.useState(prefill ?? '');
  const [running, setRunning] = React.useState(false);
  const [history, setHistory] = React.useState<string[]>([]);
  const [pat, setPat] = React.useState<PatStep | null>(null);
  const histIdx = React.useRef<number>(-1);
  const acRef = React.useRef<AbortController | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const inFlight = React.useRef(false);
  const authRef = React.useRef(auth);
  authRef.current = auth;
  // Token entered this session so further --github commands don't re-prompt.
  const sessionAuthRef = React.useRef<Auth | null>(null);

  const append = React.useCallback((e: Entry) => {
    setEntries((prev) => {
      const next = [...prev, e];
      return next.length > 1200 ? next.slice(next.length - 1200) : next;
    });
  }, []);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries, pat]);

  const runArgs = React.useCallback(
    async (args: string[], authOverride?: Auth) => {
      if (inFlight.current || args.length === 0) return;
      const hasPat = (a?: Auth | null) => !!(a?.pat?.trim() || a?.patId);
      const formAuth = authRef.current;
      const resolved = authOverride ?? (hasPat(formAuth) ? formAuth : null) ?? sessionAuthRef.current ?? undefined;

      // A --github command with no token (and no inline --pat) → start an in-terminal PAT prompt.
      if (args.includes('--github') && !args.includes('--pat') && !hasPat(resolved)) {
        append({ kind: 'err', text: '\ncn: a GitHub personal access token is required for this command.\n' });
        const pats = await fetchPats();
        if (pats.length > 0) {
          append({
            kind: 'sys',
            text:
              'Saved tokens:\n' +
              pats.map((p, i) => `  ${i + 1}) ${p.name}  ··${p.last4}`).join('\n') +
              '\nEnter a number to use one, or "n" to paste a new token.\n',
          });
          setPat({ kind: 'choose', args, pats });
        } else {
          append({ kind: 'sys', text: 'Paste a GitHub personal access token (input hidden), then press Enter:\n' });
          setPat({ kind: 'token', args });
        }
        inputRef.current?.focus();
        return;
      }

      inFlight.current = true;
      setRunning(true);
      onArtifacts?.(null);
      append({ kind: 'cmd', text: `\n$ cn ${args.join(' ')}\n` });
      const ac = new AbortController();
      acRef.current = ac;
      const onEvent = (ev: CliEvent) => {
        if (ev.t === 'out') append({ kind: 'out', text: ev.data });
        else if (ev.t === 'err') append({ kind: 'err', text: ev.data });
        else if (ev.t === 'artifacts') {
          onArtifacts?.(ev.files, ev.truncated);
          append({ kind: 'sys', text: `\n→ ${ev.files.length} file${ev.files.length === 1 ? '' : 's'} generated — see the Output tab.\n` });
        } else if (ev.t === 'exit') append({ kind: 'sys', text: `\n[process exited with code ${ev.code}]\n` });
      };
      try {
        await runCliStream(args, onEvent, ac.signal, resolved);
      } finally {
        inFlight.current = false;
        setRunning(false);
        acRef.current = null;
      }
    },
    [append, onArtifacts],
  );

  const runWith = React.useCallback(
    (args: string[], a: Auth) => {
      sessionAuthRef.current = a;
      void runArgs(args, a);
    },
    [runArgs],
  );

  // Answer the current in-terminal PAT prompt step.
  const answerPat = React.useCallback(
    async (raw: string) => {
      const step = pat;
      if (!step) return;
      const a = raw.trim();

      if (step.kind === 'choose') {
        if (/^n(ew)?$/i.test(a)) {
          append({ kind: 'sys', text: 'Paste a GitHub personal access token (input hidden), then press Enter:\n' });
          setPat({ kind: 'token', args: step.args });
          return;
        }
        const n = Number(a);
        if (Number.isInteger(n) && n >= 1 && n <= step.pats.length) {
          const chosen = step.pats[n - 1]!;
          setPat(null);
          append({ kind: 'sys', text: `Using saved token "${chosen.name}".\n` });
          runWith(step.args, { patId: chosen.id });
        } else {
          append({ kind: 'err', text: `Invalid choice "${a}". Enter a number 1–${step.pats.length}, or "n" for a new token.\n` });
        }
        return;
      }

      if (step.kind === 'token') {
        if (!a) {
          append({ kind: 'err', text: 'No token entered. Paste a token, then press Enter:\n' });
          return;
        }
        append({ kind: 'sys', text: 'Save this token for next time? [y/N]:\n' });
        setPat({ kind: 'save', args: step.args, token: a });
        return;
      }

      if (step.kind === 'save') {
        if (/^y(es)?$/i.test(a)) {
          append({ kind: 'sys', text: 'Name this token [github token]:\n' });
          setPat({ kind: 'name', args: step.args, token: step.token });
        } else {
          setPat(null);
          runWith(step.args, { pat: step.token });
        }
        return;
      }

      if (step.kind === 'name') {
        const name = a || 'github token';
        setPat(null);
        const created = await savePat(name, step.token);
        if (created) {
          notifyPresetsChanged();
          append({ kind: 'sys', text: `✓ Saved token "${name}".\n` });
          runWith(step.args, { patId: created.id });
        } else {
          append({ kind: 'err', text: 'Could not save the token; using it for this run only.\n' });
          runWith(step.args, { pat: step.token });
        }
      }
    },
    [pat, append, runWith],
  );

  // Programmatic commands from the builder / a deep link.
  React.useEffect(() => {
    if (queued && queued.token > 0 && queued.args.length > 0) {
      setInput(queued.args.join(' '));
      void runArgs(queued.args);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queued?.token]);

  // Builder "Insert" — drop the command into the prompt, editable, without running.
  React.useEffect(() => {
    if (insert && insert.token > 0) {
      setInput(insert.text);
      inputRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insert?.token]);

  // External "Clear" — reset scrollback, any in-progress prompt, and the session token.
  React.useEffect(() => {
    if (clearToken && clearToken > 0) {
      setEntries([WELCOME]);
      setPat(null);
      sessionAuthRef.current = null;
    }
  }, [clearToken]);

  function submitTyped(raw: string) {
    const args = tokenize(raw.trim());
    if (args.length === 0) return;
    setHistory((h) => [...h, raw.trim()]);
    histIdx.current = -1;
    setInput('');
    void runArgs(args);
  }

  function onEnter() {
    const value = input;
    if (pat) {
      setInput('');
      void answerPat(value);
    } else {
      submitTyped(value);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      onEnter();
    } else if (e.key === 'Escape' && pat) {
      e.preventDefault();
      setPat(null);
      setInput('');
      append({ kind: 'sys', text: '^C — cancelled.\n' });
    } else if (e.key === 'ArrowUp' && !pat) {
      e.preventDefault();
      if (history.length === 0) return;
      histIdx.current = histIdx.current < 0 ? history.length - 1 : Math.max(0, histIdx.current - 1);
      setInput(history[histIdx.current] ?? '');
    } else if (e.key === 'ArrowDown' && !pat) {
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

  const masked = pat?.kind === 'token';
  const promptPrefix = !pat
    ? 'cn'
    : pat.kind === 'choose'
      ? '›'
      : pat.kind === 'token'
        ? 'PAT:'
        : pat.kind === 'save'
          ? '[y/N]'
          : 'name:';
  const placeholder = running
    ? 'running…'
    : pat?.kind === 'choose'
      ? 'number, or "n" for a new token'
      : pat?.kind === 'token'
        ? 'paste token (hidden) · Esc to cancel'
        : pat?.kind === 'save'
          ? 'y / n'
          : pat?.kind === 'name'
            ? 'github token'
            : 'run --openapi samples/openapi/tasks-api.yaml';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {QUICK.map((q) => (
          <button
            key={q.cmd}
            type="button"
            disabled={running || !!pat}
            onClick={() => submitTyped(q.cmd)}
            className="rounded-full border border-border bg-muted/40 px-2.5 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            {q.label}
          </button>
        ))}
        {running ? (
          <button
            type="button"
            onClick={() => acRef.current?.abort()}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-danger"
          >
            <Square className="h-3 w-3" /> Stop
          </button>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-[#0b0b0c] text-[#e5e5e5] dark:bg-[#0b0b0c]">
        <div className="flex items-center gap-1.5 border-b border-white/10 px-3 py-2">
          <span className="font-mono text-[11px] text-white/40">cn — connector-network</span>
        </div>
        <div ref={scrollRef} className="h-[clamp(200px,calc(100dvh-30rem),480px)] overflow-y-auto px-4 py-3 font-mono text-[12px] leading-relaxed">
          <pre className="whitespace-pre-wrap break-words">
            {entries.map((e, i) => (
              <span key={i} className={cx(e.kind === 'cmd' ? 'text-[#7aa2f7] font-medium' : e.kind === 'sys' ? 'text-white/45' : e.kind === 'err' ? 'text-[#f7a36b]' : 'text-[#e5e5e5]')}>
                {e.text}
              </span>
            ))}
            {running ? <span className="animate-pulse text-white/60">▋</span> : null}
          </pre>
        </div>
        <div className="flex items-center gap-2 border-t border-white/10 px-3 py-2.5">
          <span className={cx('select-none font-mono text-[12px]', pat ? 'text-[#f7a36b]' : 'text-[#28c840]')}>{promptPrefix}</span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={running}
            type={masked ? 'password' : 'text'}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            placeholder={placeholder}
            className="min-w-0 flex-1 bg-transparent font-mono text-[12px] text-white placeholder:text-white/30 focus:outline-none disabled:opacity-60"
          />
          <button
            type="button"
            onClick={onEnter}
            disabled={running || (!pat && !input.trim())}
            className="inline-flex items-center gap-1 rounded-md border border-white/15 px-2 py-1 text-[11px] text-white/70 transition-colors hover:text-white disabled:opacity-40"
          >
            <CornerDownLeft className="h-3 w-3" /> {pat ? 'Enter' : 'Run'}
          </button>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Runs the real <code className="font-mono text-foreground">cn</code> binary on this machine from the repo root. ↑/↓ recalls history. Only <code className="font-mono">cn</code> subcommands are permitted.
      </p>
    </div>
  );
}

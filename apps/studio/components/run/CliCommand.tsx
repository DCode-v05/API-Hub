'use client';

import Link from 'next/link';
import { Info, Terminal } from 'lucide-react';
import type { RunRequest } from '@/lib/events';
import { toCliCommand } from '@/lib/cli-command';
import { CopyButton } from './CopyButton';

/** Shows the `cn` command equivalent to the current form, with copy + "open in terminal". */
export function CliCommand({ request }: { request: RunRequest }) {
  const cmd = toCliCommand(request);
  const terminalHref = `/cli?cmd=${encodeURIComponent(cmd.argv.join(' '))}`;

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Terminal className="h-3.5 w-3.5" />
          Equivalent CLI command
        </div>
        <div className="flex items-center gap-1.5">
          <CopyButton text={cmd.display} />
          <Link
            href={terminalHref}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <Terminal className="h-3.5 w-3.5" />
            Open in terminal
          </Link>
        </div>
      </div>
      <pre className="overflow-x-auto px-3 py-2.5 font-mono text-xs leading-relaxed text-foreground">
        <code>{cmd.display}</code>
      </pre>
      {cmd.note ? (
        <p className="flex items-start gap-1.5 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          <Info className="mt-px h-3 w-3 shrink-0" />
          {cmd.note}
        </p>
      ) : null}
    </div>
  );
}

'use client';

import * as React from 'react';
import { Check, Copy, Download, FileCode, FileText } from 'lucide-react';
import type { SurfaceDTO } from '@/lib/events';
import { cx } from '@/lib/ui';
import { Button } from './ui';

const SURFACE_LABEL: Record<string, string> = {
  'sdk-typescript': 'SDK · TypeScript',
  'sdk-python': 'SDK · Python',
  mcp: 'MCP server',
  cli: 'CLI',
  docs: 'Docs',
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
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export function SurfacesBrowser({ surfaces, label }: { surfaces: SurfaceDTO[]; label?: string }) {
  const [activeKind, setActiveKind] = React.useState(surfaces[0]?.kind ?? '');
  const [activePath, setActivePath] = React.useState(surfaces[0]?.files[0]?.path ?? '');
  const [zipping, setZipping] = React.useState(false);

  // A new run replaces `surfaces` without remounting — reset the selection so the highlighted
  // tab/file and the shown content can't disagree.
  React.useEffect(() => {
    setActiveKind(surfaces[0]?.kind ?? '');
    setActivePath(surfaces[0]?.files[0]?.path ?? '');
  }, [surfaces]);

  const surface = surfaces.find((s) => s.kind === activeKind) ?? surfaces[0];
  const file = surface?.files.find((f) => f.path === activePath) ?? surface?.files[0];
  const totalFiles = surfaces.reduce((n, s) => n + s.files.length, 0);

  const selectSurface = (kind: string) => {
    setActiveKind(kind);
    const s = surfaces.find((x) => x.kind === kind);
    setActivePath(s?.files[0]?.path ?? '');
  };

  async function downloadZip() {
    setZipping(true);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      for (const s of surfaces) for (const f of s.files) zip.file(`${s.dir}/${f.path}`, f.content);
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${label ?? 'surfaces'}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setZipping(false);
    }
  }

  if (surfaces.length === 0) return <p className="py-10 text-center text-sm text-muted-foreground">No surfaces.</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {surfaces.map((s) => (
            <button
              key={s.kind}
              type="button"
              onClick={() => selectSurface(s.kind)}
              className={cx(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                s.kind === activeKind ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {SURFACE_LABEL[s.kind] ?? s.kind}
              <span className={cx('ml-1.5 font-mono', s.kind === activeKind ? 'text-background/60' : 'text-muted-foreground/70')}>{s.files.length}</span>
            </button>
          ))}
        </div>
        <Button variant="secondary" size="sm" onClick={downloadZip} disabled={zipping}>
          <Download className="h-4 w-4" />
          {zipping ? 'Zipping…' : `Download .zip (${totalFiles})`}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-0 overflow-hidden rounded-lg border border-border md:grid-cols-[230px_1fr]">
        {/* File list */}
        <div className="max-h-[460px] overflow-y-auto border-b border-border bg-muted/20 md:border-b-0 md:border-r">
          {surface?.files.map((f) => {
            const isDoc = f.path.endsWith('.md');
            return (
              <button
                key={f.path}
                type="button"
                onClick={() => setActivePath(f.path)}
                className={cx(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-xs transition-colors',
                  f.path === activePath ? 'bg-card text-foreground' : 'text-muted-foreground hover:bg-card/50 hover:text-foreground',
                )}
              >
                {isDoc ? <FileText className="h-3.5 w-3.5 shrink-0" /> : <FileCode className="h-3.5 w-3.5 shrink-0" />}
                <span className="truncate">{f.path}</span>
              </button>
            );
          })}
        </div>

        {/* Code viewer */}
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2">
            <code className="min-w-0 truncate font-mono text-xs text-muted-foreground">{surface?.dir}/{file?.path}</code>
            <span className="shrink-0">{file ? <CopyButton text={file.content} /> : null}</span>
          </div>
          <pre className="max-h-[420px] overflow-auto bg-card p-4 font-mono text-xs leading-relaxed text-foreground">
            <code>{file?.content ?? ''}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}

'use client';

import * as React from 'react';
import { Download, FileCode, FileText } from 'lucide-react';
import type { CliFile } from '@/lib/cli-client';
import { cx } from '@/lib/ui';
import { Button } from '@/components/ui';
import { CopyButton } from '@/components/run/CopyButton';

/** Browses the files `cn` produced (read back from its output dir) with a .zip download. */
export function OutputFiles({ files, truncated }: { files: CliFile[]; truncated?: boolean }) {
  const [activePath, setActivePath] = React.useState(files[0]?.path ?? '');
  const [zipping, setZipping] = React.useState(false);

  // A new run replaces `files` without remounting — reset the selection.
  React.useEffect(() => {
    setActivePath(files[0]?.path ?? '');
  }, [files]);

  const file = files.find((f) => f.path === activePath) ?? files[0];

  async function downloadZip() {
    setZipping(true);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      for (const f of files) zip.file(f.path, f.content);
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'cn-output.zip';
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setZipping(false);
    }
  }

  if (files.length === 0) return <p className="py-10 text-center text-sm text-muted-foreground">No output files.</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13px] text-muted-foreground">
          <span className="font-medium text-foreground">{files.length}</span> file{files.length === 1 ? '' : 's'} generated
          {truncated ? <span className="ml-1 text-warning">· output truncated</span> : null}
        </span>
        <Button variant="secondary" size="sm" onClick={downloadZip} disabled={zipping}>
          <Download className="h-4 w-4" />
          {zipping ? 'Zipping…' : `Download .zip (${files.length})`}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-0 overflow-hidden rounded-lg border border-border md:grid-cols-[230px_1fr]">
        {/* File list */}
        <div className="max-h-[460px] overflow-y-auto border-b border-border bg-muted/20 md:border-b-0 md:border-r">
          {files.map((f) => {
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
            <code className="min-w-0 truncate font-mono text-xs text-muted-foreground">{file?.path}</code>
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

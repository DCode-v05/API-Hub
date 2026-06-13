'use client';

import * as React from 'react';
import { FileJson, FileUp, Info } from 'lucide-react';
import type { RunRequest } from '@/lib/events';
import { cx } from '@/lib/ui';
import { Field, Input, Textarea } from '@/components/ui';
import { InputWorkspace } from './InputWorkspace';

type Mode = 'url' | 'paste' | 'upload' | 'path';

interface Form {
  mode: Mode;
  url: string;
  content: string;
  fileName: string;
  path: string;
}

const EMPTY: Form = { mode: 'url', url: '', content: '', fileName: '', path: '' };

const EXAMPLE = `openapi: 3.1.0
info:
  title: Tasks API
  version: 1.0.0
servers:
  - url: https://api.example.com
paths:
  /tasks:
    get:
      operationId: listTasks
      summary: List tasks
      responses:
        '200': { description: OK }
    post:
      operationId: createTask
      summary: Create a task
      responses:
        '201': { description: Created }
`;

function toRequest(f: Form): RunRequest {
  return {
    kind: 'openapi',
    openapiUrl: f.mode === 'url' ? f.url.trim() || undefined : undefined,
    openapiContent: f.mode === 'paste' || f.mode === 'upload' ? f.content.trim() || undefined : undefined,
    openapiPath: f.mode === 'path' ? f.path.trim() || undefined : undefined,
  };
}

function runnableFor(f: Form): boolean {
  if (f.mode === 'url') return f.url.trim().length > 0;
  if (f.mode === 'path') return f.path.trim().length > 0;
  return f.content.trim().length > 0;
}

interface SpecInfo {
  format: 'json' | 'yaml';
  openapi?: string;
  title?: string;
  version?: string;
  ops?: number;
  error?: string;
}

const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);

function countOps(paths: unknown): number {
  if (!paths || typeof paths !== 'object') return 0;
  let n = 0;
  for (const item of Object.values(paths as Record<string, unknown>)) {
    if (item && typeof item === 'object') {
      for (const k of Object.keys(item as Record<string, unknown>)) if (HTTP_METHODS.has(k.toLowerCase())) n += 1;
    }
  }
  return n;
}

function analyzeSpec(text: string): SpecInfo | null {
  const t = text.trim();
  if (!t) return null;
  if (t.startsWith('{')) {
    try {
      const obj = JSON.parse(t) as { openapi?: string; swagger?: string; info?: { title?: string; version?: string }; paths?: unknown };
      return {
        format: 'json',
        openapi: obj.openapi ?? obj.swagger,
        title: obj.info?.title,
        version: obj.info?.version,
        ops: countOps(obj.paths),
      };
    } catch {
      return { format: 'json', error: 'Invalid JSON — check for a trailing comma or unquoted key.' };
    }
  }
  // YAML: best-effort surface read (no parser bundled on the client).
  const ver = t.match(/^\s*(openapi|swagger)\s*:\s*["']?([\d.]+)/m);
  const title = t.match(/^\s*title\s*:\s*["']?(.+?)["']?\s*$/m);
  const version = t.match(/^\s*version\s*:\s*["']?(.+?)["']?\s*$/m);
  return {
    format: 'yaml',
    openapi: ver?.[2],
    title: title?.[1],
    version: version?.[1],
  };
}

const MODES: { value: Mode; label: string }[] = [
  { value: 'url', label: 'URL' },
  { value: 'paste', label: 'Paste' },
  { value: 'upload', label: 'Upload' },
  { value: 'path', label: 'Local path' },
];

export function OpenApiWorkspace() {
  const [f, setF] = React.useState<Form>(EMPTY);
  const [dragging, setDragging] = React.useState(false);
  const set = (patch: Partial<Form>) => setF((prev) => ({ ...prev, ...patch }));

  const info = f.mode === 'paste' || f.mode === 'upload' ? analyzeSpec(f.content) : null;

  async function ingestFile(file: File) {
    const text = await file.text();
    set({ content: text, fileName: file.name, mode: 'upload' });
  }

  return (
    <InputWorkspace
      kind="openapi"
      title="OpenAPI document"
      description="Load an OpenAPI 3.0 / 3.1 document (Swagger 2.0 is upgraded best-effort). External $refs are bundled into one self-contained, origin-blind artifact."
      Icon={FileJson}
      trust="declared"
      request={toRequest(f)}
      runnable={runnableFor(f)}
      invalidHint="Provide a URL, paste a spec, upload a file, or set a local path."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => set({ mode: m.value })}
              className={cx(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                f.mode === m.value ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        {f.mode === 'url' ? (
          <Field label="Document URL">
            <Input
              placeholder="https://api.example.com/openapi.json"
              value={f.url}
              onChange={(e) => set({ url: e.target.value })}
              className="font-mono"
            />
          </Field>
        ) : null}

        {f.mode === 'path' ? (
          <Field label="Local file path" hint="resolved on the server">
            <Input
              placeholder="samples/openapi/tasks-api.yaml"
              value={f.path}
              onChange={(e) => set({ path: e.target.value })}
              className="font-mono"
            />
          </Field>
        ) : null}

        {f.mode === 'upload' ? (
          <div>
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) void ingestFile(file);
              }}
              className={cx(
                'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-10 text-center transition-colors',
                dragging ? 'border-foreground/40 bg-muted/60' : 'border-border bg-muted/20 hover:bg-muted/40',
              )}
            >
              <FileUp className="h-6 w-6 text-muted-foreground" />
              <span className="text-sm font-medium">{f.fileName || 'Drop a spec here, or click to choose'}</span>
              <span className="text-xs text-muted-foreground">.json · .yaml · .yml</span>
              <input
                type="file"
                accept=".json,.yaml,.yml,application/json,text/yaml"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void ingestFile(file);
                }}
              />
            </label>
            {f.content ? (
              <pre className="mt-3 max-h-44 overflow-auto rounded-md border border-border bg-card p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                <code>{f.content.slice(0, 1500)}{f.content.length > 1500 ? '\n…' : ''}</code>
              </pre>
            ) : null}
          </div>
        ) : null}

        {f.mode === 'paste' ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium">Spec (YAML or JSON)</span>
              <button
                type="button"
                onClick={() => set({ content: EXAMPLE })}
                className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Load example
              </button>
            </div>
            <Textarea
              rows={12}
              placeholder="Paste an OpenAPI 3.x spec…"
              value={f.content}
              onChange={(e) => set({ content: e.target.value })}
            />
          </div>
        ) : null}

        {/* Live analysis for paste/upload */}
        {info ? (
          info.error ? (
            <p className="flex items-center gap-1.5 rounded-md border border-danger/25 bg-danger/5 px-3 py-2 text-xs text-danger">
              <Info className="h-3.5 w-3.5 shrink-0" />
              {info.error}
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-mono uppercase">{info.format}</span>
              {info.openapi ? (
                <span>
                  spec <code className="font-mono text-foreground">{info.openapi}</code>
                </span>
              ) : null}
              {info.title ? (
                <span>
                  title <span className="text-foreground">{info.title}</span>
                </span>
              ) : null}
              {info.version ? (
                <span>
                  v<span className="text-foreground">{info.version}</span>
                </span>
              ) : null}
              {info.ops != null ? (
                <span>
                  <span className="text-foreground">{info.ops}</span> operations
                </span>
              ) : null}
            </div>
          )
        ) : null}
      </div>
    </InputWorkspace>
  );
}

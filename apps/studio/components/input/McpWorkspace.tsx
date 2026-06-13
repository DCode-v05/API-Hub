'use client';

import * as React from 'react';
import { AlertTriangle, Info, Plug, Wrench } from 'lucide-react';
import type { RunRequest } from '@/lib/events';
import { cx } from '@/lib/ui';
import { Field, Input, Textarea } from '@/components/ui';
import { InputWorkspace } from './InputWorkspace';

type Mode = 'url' | 'paste' | 'path' | 'command';

interface Form {
  mode: Mode;
  url: string;
  content: string;
  path: string;
  command: string;
}

const EMPTY: Form = { mode: 'path', url: '', content: '', path: '', command: '' };

function toRequest(f: Form): RunRequest {
  return {
    kind: 'mcp',
    mcpUrl: f.mode === 'url' ? f.url.trim() || undefined : undefined,
    mcpContent: f.mode === 'paste' ? f.content.trim() || undefined : undefined,
    mcpPath: f.mode === 'path' ? f.path.trim() || undefined : undefined,
    mcpCommand: f.mode === 'command' ? f.command.trim() || undefined : undefined,
  };
}

function runnableFor(f: Form): boolean {
  if (f.mode === 'url') return f.url.trim().length > 0;
  if (f.mode === 'paste') return f.content.trim().length > 0;
  if (f.mode === 'path') return f.path.trim().length > 0;
  return f.command.trim().length > 0;
}

interface ManifestInfo {
  ok: boolean;
  error?: string;
  count?: number;
  tools?: { name?: string; description?: string }[];
}

function analyzeManifest(text: string): ManifestInfo | null {
  const t = text.trim();
  if (!t) return null;
  try {
    const obj = JSON.parse(t) as { tools?: { name?: string; description?: string }[] };
    const tools = Array.isArray(obj.tools) ? obj.tools : [];
    return { ok: true, count: tools.length, tools: tools.slice(0, 30) };
  } catch {
    return { ok: false, error: 'Invalid JSON — an MCP manifest is { "tools": [ … ] }.' };
  }
}

const MODES: { value: Mode; label: string }[] = [
  { value: 'path', label: 'Local file' },
  { value: 'url', label: 'Manifest URL' },
  { value: 'paste', label: 'Paste' },
  { value: 'command', label: 'Stdio command' },
];

export function McpWorkspace() {
  const [f, setF] = React.useState<Form>(EMPTY);
  const set = (patch: Partial<Form>) => setF((prev) => ({ ...prev, ...patch }));
  const manifest = f.mode === 'paste' ? analyzeManifest(f.content) : null;

  return (
    <InputWorkspace
      kind="mcp"
      title="MCP server"
      description="Read an MCP server’s advertised tools and map each tool’s inputSchema to an operation — from a manifest file, a URL, pasted JSON, or a live stdio command. Carries lower (inferred) trust."
      Icon={Plug}
      trust="inferred"
      request={toRequest(f)}
      runnable={runnableFor(f)}
      invalidHint="Provide a manifest (file / URL / paste) or a stdio command."
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

        {f.mode === 'path' ? (
          <div className="space-y-2">
            <Field label="Manifest file path" hint="resolved on the server">
              <Input
                placeholder="samples/mcp/tasks-tools.json"
                value={f.path}
                onChange={(e) => set({ path: e.target.value })}
                className="font-mono"
              />
            </Field>
            <button
              type="button"
              onClick={() => set({ path: 'samples/mcp/tasks-tools.json' })}
              className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Use bundled sample
            </button>
          </div>
        ) : null}

        {f.mode === 'url' ? (
          <Field label="Manifest URL">
            <Input
              placeholder="https://…/tools.json"
              value={f.url}
              onChange={(e) => set({ url: e.target.value })}
              className="font-mono"
            />
          </Field>
        ) : null}

        {f.mode === 'paste' ? (
          <Field label="Tools manifest (JSON)">
            <Textarea
              rows={11}
              placeholder='{ "tools": [ { "name": "create_task", "inputSchema": { … } } ] }'
              value={f.content}
              onChange={(e) => set({ content: e.target.value })}
            />
          </Field>
        ) : null}

        {f.mode === 'command' ? (
          <div className="space-y-2">
            <Field label="Stdio server command" hint="launched with --command">
              <Input
                placeholder="node ./my-mcp-server.js"
                value={f.command}
                onChange={(e) => set({ command: e.target.value })}
                className="font-mono"
              />
            </Field>
            <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Info className="mt-px h-3 w-3 shrink-0" />
              The server is spawned and queried for its advertised tools, then shut down. Only run commands you trust.
            </p>
          </div>
        ) : null}

        {/* Tool preview for pasted manifests */}
        {manifest ? (
          manifest.ok ? (
            <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium">
                <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                {manifest.count} tool{manifest.count === 1 ? '' : 's'} advertised
              </p>
              {manifest.tools && manifest.tools.length > 0 ? (
                <ul className="space-y-1">
                  {manifest.tools.map((t, i) => (
                    <li key={`${t.name ?? 'tool'}-${i}`} className="flex items-baseline gap-2 text-xs">
                      <code className="font-mono text-foreground">{t.name ?? '(unnamed)'}</code>
                      {t.description ? <span className="truncate text-muted-foreground">{t.description}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <p className="flex items-center gap-1.5 rounded-md border border-danger/25 bg-danger/5 px-3 py-2 text-xs text-danger">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {manifest.error}
            </p>
          )
        ) : null}
      </div>
    </InputWorkspace>
  );
}

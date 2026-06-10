'use client';

import * as React from 'react';
import { Bookmark, Plus, Trash2 } from 'lucide-react';
import type { RunRequest, StageSourceKind } from '@/lib/events';
import type { PresetRecord } from '@/lib/records';
import { fetchPresets, removePreset, savePreset } from '@/lib/client/api';
import { Button, Input } from '@/components/ui';

/** Save the current input config as a named preset, and reload saved ones. PATs are never stored. */
export function PresetBar({
  kind,
  request,
  onLoad,
}: {
  kind: StageSourceKind;
  request: RunRequest;
  onLoad: (req: RunRequest) => void;
}) {
  const [presets, setPresets] = React.useState<PresetRecord[]>([]);
  const [name, setName] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    fetchPresets(kind).then((p) => alive && setPresets(p));
    return () => {
      alive = false;
    };
  }, [kind]);

  async function save() {
    setBusy(true);
    const preset = await savePreset(kind, name.trim() || `${kind} preset`, request);
    setBusy(false);
    if (preset) {
      setPresets((prev) => [preset, ...prev]);
      setName('');
    }
  }

  async function del(id: string) {
    const ok = await removePreset(id);
    if (ok) setPresets((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-1.5 border-b border-border px-4 py-2.5 text-[13px] font-semibold">
        <Bookmark className="h-3.5 w-3.5 text-muted-foreground" />
        Presets
      </div>
      <div className="space-y-3 p-4">
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this config…" className="h-8 text-[13px]" />
          <Button size="sm" variant="secondary" onClick={save} disabled={busy} className="shrink-0">
            <Plus className="h-3.5 w-3.5" />
            Save
          </Button>
        </div>

        {presets.length === 0 ? (
          <p className="text-xs text-muted-foreground">No saved presets yet. Save the current form to reuse it later.</p>
        ) : (
          <ul className="space-y-1">
            {presets.map((p) => (
              <li key={p.id} className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
                <button
                  type="button"
                  onClick={() => onLoad(p.request)}
                  className="min-w-0 flex-1 truncate text-left text-[13px] text-foreground hover:underline"
                  title="Load this preset into the form"
                >
                  {p.name}
                </button>
                <button
                  type="button"
                  onClick={() => del(p.id)}
                  className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                  aria-label={`Delete ${p.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

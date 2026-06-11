'use client';

import * as React from 'react';
import { Bookmark, Check, Plus, X } from 'lucide-react';
import type { RunRequest, StageSourceKind } from '@/lib/events';
import type { PresetRecord } from '@/lib/records';
import { fetchPresets, notifyPresetsChanged, removePreset, savePreset } from '@/lib/client/api';
import { Input } from '@/components/ui';

/**
 * Compact presets bar that lives at the top of the input form. Saved configs show as pill chips
 * (click to load, × to delete); "Save preset" expands an inline name field. PATs are never stored.
 */
export function PresetsToolbar({
  kind,
  request,
  onLoad,
}: {
  kind: StageSourceKind;
  request: RunRequest;
  onLoad: (req: RunRequest) => void;
}) {
  const [presets, setPresets] = React.useState<PresetRecord[]>([]);
  const [saving, setSaving] = React.useState(false);
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
    if (busy) return;
    setBusy(true);
    const preset = await savePreset(kind, name.trim() || `${kind} preset`, request);
    setBusy(false);
    if (preset) {
      setPresets((prev) => [preset, ...prev]);
      setName('');
      setSaving(false);
      notifyPresetsChanged();
    }
  }

  async function del(id: string) {
    const ok = await removePreset(id);
    if (ok) {
      setPresets((prev) => prev.filter((p) => p.id !== id));
      notifyPresetsChanged();
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Bookmark className="h-3.5 w-3.5" />
        Presets
      </span>

      {presets.length === 0 && !saving ? (
        <span className="text-xs text-muted-foreground/70">— save this config to reuse it</span>
      ) : null}

      {presets.map((p) => (
        <span
          key={p.id}
          className="group inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 py-1 pl-2.5 pr-1 text-xs transition-colors hover:border-foreground/25"
        >
          <button type="button" onClick={() => onLoad(p.request)} className="max-w-[160px] truncate font-medium text-foreground" title={`Load "${p.name}"`}>
            {p.name}
          </button>
          <button
            type="button"
            onClick={() => del(p.id)}
            aria-label={`Delete ${p.name}`}
            className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}

      <div className="ml-auto flex items-center gap-1.5">
        {saving ? (
          <>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void save();
                } else if (e.key === 'Escape') {
                  setSaving(false);
                  setName('');
                }
              }}
              placeholder="Name this config…"
              className="h-7 w-44 text-xs"
            />
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy}
              className="inline-flex h-7 items-center gap-1 rounded-md bg-foreground px-2.5 text-xs font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setSaving(false);
                setName('');
              }}
              aria-label="Cancel"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setSaving(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Save preset
          </button>
        )}
      </div>
    </div>
  );
}

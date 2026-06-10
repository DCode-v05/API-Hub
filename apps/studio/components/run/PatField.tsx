'use client';

import * as React from 'react';
import { KeyRound, Loader2, Plus, Trash2 } from 'lucide-react';
import type { PatDTO } from '@/lib/records';
import { fetchPats, removePat, savePat } from '@/lib/client/api';
import { cx } from '@/lib/ui';
import { Button, Input, Label } from '@/components/ui';

/**
 * GitHub PAT input + vault. The user either selects a saved token (referenced by id; the token
 * itself never returns to the browser) or types a new one — which can be saved under a name.
 */
export function PatField({
  patId,
  pat,
  onChange,
}: {
  patId?: string;
  pat: string;
  onChange: (v: { patId?: string; pat: string }) => void;
}) {
  const [pats, setPats] = React.useState<PatDTO[] | null>(null);
  const [name, setName] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const refresh = React.useCallback(async () => setPats(await fetchPats()), []);
  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  // If the selected PAT was deleted elsewhere, fall back to the "new token" entry.
  const known = patId && pats ? pats.some((p) => p.id === patId) : true;
  React.useEffect(() => {
    if (patId && pats && !pats.some((p) => p.id === patId)) onChange({ patId: undefined, pat });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pats]);

  const usingSaved = !!patId && known;

  async function save() {
    if (!pat.trim()) return;
    setSaving(true);
    const created = await savePat(name.trim() || 'token', pat.trim());
    setSaving(false);
    if (created) {
      setName('');
      await refresh();
      onChange({ patId: created.id, pat: '' }); // switch to the saved token; drop the raw value
    }
  }

  async function del(idToDelete: string) {
    const ok = await removePat(idToDelete);
    if (!ok) return;
    if (patId === idToDelete) onChange({ patId: undefined, pat: '' });
    await refresh();
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <Label>Personal access token</Label>
        <span className="text-xs text-muted-foreground">required</span>
      </div>

      {pats && pats.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {pats.map((p) => {
            const active = patId === p.id;
            return (
              <span
                key={p.id}
                className={cx(
                  'group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                  active ? 'border-foreground/30 bg-foreground text-background' : 'border-border bg-card text-muted-foreground hover:text-foreground',
                )}
              >
                <button type="button" onClick={() => onChange({ patId: p.id, pat: '' })} className="inline-flex items-center gap-1.5">
                  <KeyRound className="h-3 w-3" />
                  {p.name}
                  <span className={cx('font-mono', active ? 'text-background/60' : 'text-muted-foreground/70')}>··{p.last4}</span>
                </button>
                <button
                  type="button"
                  onClick={() => del(p.id)}
                  aria-label={`Delete token ${p.name}`}
                  className={cx('transition-colors hover:text-danger', active ? 'text-background/70' : 'text-muted-foreground')}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            );
          })}
          {usingSaved ? (
            <button
              type="button"
              onClick={() => onChange({ patId: undefined, pat: '' })}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <Plus className="h-3 w-3" /> New token
            </button>
          ) : null}
        </div>
      ) : null}

      {!usingSaved ? (
        <div className="space-y-2">
          <Input
            type="password"
            placeholder="ghp_…  (enter your token)"
            value={pat}
            onChange={(e) => onChange({ patId: undefined, pat: e.target.value })}
            className="font-mono"
            autoComplete="off"
          />
          {pat.trim() ? (
            <div className="flex gap-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Save as… (e.g. work, personal)" className="h-8 text-[13px]" />
              <Button type="button" size="sm" variant="secondary" onClick={save} disabled={saving} className="shrink-0">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Save token
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <p className="text-[11px] text-muted-foreground">
        {usingSaved ? 'Using a saved token (encrypted at rest). ' : 'Typed tokens are used for this run only — save one to reuse it. '}
        Need a token?{' '}
        <a
          href="https://github.com/settings/tokens/new?scopes=repo&description=Connector%20Network%20Studio"
          target="_blank"
          rel="noreferrer"
          className="text-foreground underline-offset-4 hover:underline"
        >
          Create with <code className="font-mono">repo</code> scope
        </a>
        .
      </p>
    </div>
  );
}

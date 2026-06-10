'use client';

import * as React from 'react';
import { LogOut, User } from 'lucide-react';
import type { UserDTO } from '@/lib/records';
import { logoutAction } from '@/lib/auth/actions';
import { cx } from '@/lib/ui';

export function UserMenu({ user }: { user: UserDTO }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const initial = (user.name || user.email).trim().charAt(0).toUpperCase() || '?';

  async function logout() {
    await logoutAction();
    window.location.href = '/login';
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        aria-haspopup="menu"
        aria-expanded={open}
        title={user.email}
      >
        {initial}
      </button>

      {open ? (
        <div
          role="menu"
          className={cx(
            'absolute right-0 top-10 z-50 w-60 origin-top-right rounded-lg border border-border bg-card p-1.5 shadow-lg',
            'animate-fade-in',
          )}
        >
          <div className="flex items-center gap-2.5 rounded-md px-2.5 py-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <User className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium">{user.name}</div>
              <div className="truncate text-xs text-muted-foreground">{user.email}</div>
            </div>
          </div>
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            role="menuitem"
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] text-foreground transition-colors hover:bg-muted"
          >
            <LogOut className="h-4 w-4 text-muted-foreground" />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

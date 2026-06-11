'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Moon, Sun, Workflow, X } from 'lucide-react';
import type { PresetRecord, UserDTO } from '@/lib/records';
import { cx } from '@/lib/ui';
import { PRESETS_CHANGED, fetchAllPresets } from '@/lib/client/api';
import { Button } from '@/components/ui';
import { INPUT_ITEMS, NAV, type NavItem } from './nav';
import { UserMenu } from './UserMenu';

function ThemeToggle() {
  const [dark, setDark] = React.useState(false);
  React.useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('cn-theme', next ? 'dark' : 'light');
  };
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme" title="Toggle theme">
      {dark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
    </Button>
  );
}

const GROUPS: { id: NavItem['group']; label?: string }[] = [
  { id: 'main' },
  { id: 'inputs', label: 'Inputs' },
  { id: 'tools', label: 'Tools' },
];

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/');
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="space-y-5">
      {GROUPS.map((group) => {
        const items = NAV.filter((n) => n.group === group.id);
        return (
          <div key={group.id} className="space-y-1">
            {group.label ? (
              <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</div>
            ) : null}
            {items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cx(
                    'group flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors',
                    active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                  )}
                >
                  <item.Icon className={cx('h-4 w-4 shrink-0', active ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground')} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

/** Saved presets, listed below the nav. Clicking one opens that input page and loads the preset. */
function SidebarPresets({ onNavigate }: { onNavigate?: () => void }) {
  const [presets, setPresets] = React.useState<PresetRecord[] | null>(null);

  React.useEffect(() => {
    let alive = true;
    const load = () => fetchAllPresets().then((p) => alive && setPresets(p));
    void load();
    const onChange = () => void load();
    window.addEventListener(PRESETS_CHANGED, onChange);
    return () => {
      alive = false;
      window.removeEventListener(PRESETS_CHANGED, onChange);
    };
  }, []);

  if (!presets || presets.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Saved presets</div>
      {presets.map((p) => {
        const Icon = INPUT_ITEMS.find((i) => i.href === `/${p.kind}`)?.Icon;
        return (
          <Link
            key={p.id}
            href={`/${p.kind}?preset=${p.id}`}
            onClick={onNavigate}
            title={`${p.name} · ${p.kind}`}
            className="group flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            {Icon ? <Icon className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" /> : null}
            <span className="truncate">{p.name}</span>
          </Link>
        );
      })}
    </div>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-foreground text-background">
        <Workflow className="h-4 w-4" />
      </div>
      <div className="flex flex-col leading-none">
        <span className="text-[13px] font-semibold tracking-tight">Connector Network</span>
        <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Studio</span>
      </div>
    </Link>
  );
}

export function AppShell({ user, children }: { user: UserDTO; children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const current = NAV.find((n) => isActive(pathname, n.href));

  // Close the mobile drawer on route change.
  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[208px_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-border bg-card/40 lg:flex">
        <div className="flex h-14 items-center border-b border-border px-4">
          <Brand />
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto p-3">
          <NavLinks pathname={pathname} />
          <SidebarPresets />
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-72 flex-col border-r border-border bg-card animate-fade-in">
            <div className="flex h-14 items-center justify-between border-b border-border px-5">
              <Brand />
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)} aria-label="Close menu">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto p-3">
              <NavLinks pathname={pathname} onNavigate={() => setMobileOpen(false)} />
              <SidebarPresets onNavigate={() => setMobileOpen(false)} />
            </div>
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-4 backdrop-blur-md sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            {current ? <current.Icon className="h-4 w-4 text-muted-foreground" /> : null}
            <span className="text-sm font-semibold tracking-tight">{current?.label ?? 'Studio'}</span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <UserMenu user={user} />
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

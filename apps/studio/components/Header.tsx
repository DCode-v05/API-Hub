'use client';

import * as React from 'react';
import { Github, Moon, Sun, Workflow } from 'lucide-react';
import { Button } from './ui';

function ThemeToggle() {
  const [dark, setDark] = React.useState(false);
  React.useEffect(() => {
    const stored = localStorage.getItem('cn-theme');
    const prefers = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = stored ? stored === 'dark' : prefers;
    setDark(isDark);
    document.documentElement.classList.toggle('dark', isDark);
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

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-background">
            <Workflow className="h-4 w-4" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold tracking-tight">Connector Network</span>
            <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Studio
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <a
            href="https://github.com/DCode-v05/Test"
            target="_blank"
            rel="noreferrer"
            className="hidden sm:inline-flex"
          >
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              <Github className="h-4 w-4" />
              Repo
            </Button>
          </a>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

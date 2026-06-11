'use client';

import * as React from 'react';
import type { RunRequest } from './events';
import type { CliFile } from './cli-client';
import { cnDisplay, toCliCommand } from './cli-command';

export type Subcommand = 'run' | 'acquire' | 'ingest' | 'build' | 'project';
export const SUBCOMMANDS: Subcommand[] = ['run', 'acquire', 'ingest', 'build', 'project'];
export const SURFACES = ['sdk-typescript', 'sdk-python', 'mcp', 'cli', 'docs'];

export interface InputCli {
  sub: Subcommand;
  setSub: (s: Subcommand) => void;
  only: string[];
  toggleOnly: (k: string) => void;
  ir: boolean;
  setIr: (v: boolean) => void;
  showOnly: boolean;
  showIr: boolean;
  argv: string[];
  display: string;
  note?: string;
  /** GitHub PAT context from the form, passed to the spawned cn (used over any .env). */
  auth: { pat?: string; patId?: string };
  queued: { args: string[]; token: number } | null;
  inserted: { text: string; token: number } | null;
  run: () => void;
  insert: () => void;
  artifacts: CliFile[] | null;
  artifactsTruncated: boolean;
  setArtifacts: (files: CliFile[] | null, truncated?: boolean) => void;
  /** Bumped by clear() — the terminal resets its scrollback when this changes. */
  clearToken: number;
  clear: () => void;
}

/**
 * CLI state for an input page, shared between the controls (left) and the terminal (right). Builds
 * the `cn` command from the page's current form `request`, the chosen subcommand, and a few options
 * (--only / --ir / -o), then drives the embedded terminal via run()/insert().
 */
export function useInputCli(request: RunRequest): InputCli {
  const [sub, setSub] = React.useState<Subcommand>('run');
  const [only, setOnly] = React.useState<string[]>([]);
  const [ir, setIr] = React.useState(false);
  const [queued, setQueued] = React.useState<{ args: string[]; token: number } | null>(null);
  const [inserted, setInserted] = React.useState<{ text: string; token: number } | null>(null);
  const [artifacts, setArtifactsState] = React.useState<CliFile[] | null>(null);
  const [artifactsTruncated, setArtifactsTruncated] = React.useState(false);
  const [clearToken, setClearToken] = React.useState(0);
  const tokenRef = React.useRef(0);

  const setArtifacts = React.useCallback((files: CliFile[] | null, truncated = false) => {
    setArtifactsState(files);
    setArtifactsTruncated(truncated);
  }, []);

  // Clear the terminal scrollback (via clearToken) and drop any captured output files.
  const clear = React.useCallback(() => {
    setClearToken((t) => t + 1);
    setArtifactsState(null);
    setArtifactsTruncated(false);
  }, []);

  const showOnly = sub === 'run' || sub === 'project';
  const showIr = sub === 'run';

  const base = toCliCommand(request, sub);
  const argv = [...base.argv];
  if (showOnly && only.length > 0) argv.push('--only', only.join(','));
  if (showIr && ir) argv.push('--ir');

  const toggleOnly = (k: string) => setOnly((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));

  const run = () => {
    tokenRef.current += 1;
    setQueued({ args: argv, token: tokenRef.current });
  };
  const insert = () => {
    tokenRef.current += 1;
    setInserted({ text: argv.join(' '), token: tokenRef.current });
  };

  return {
    sub,
    setSub,
    only,
    toggleOnly,
    ir,
    setIr,
    showOnly,
    showIr,
    argv,
    display: cnDisplay(argv),
    note: base.note,
    auth: { pat: request.pat, patId: request.patId },
    queued,
    inserted,
    run,
    insert,
    artifacts,
    artifactsTruncated,
    setArtifacts,
    clearToken,
    clear,
  };
}

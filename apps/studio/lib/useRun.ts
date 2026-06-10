'use client';

import * as React from 'react';
import { runStudio } from './run-client';
import { INITIAL_RUN, reduce, type RunState } from './state';
import type { RunEvent, RunRequest } from './events';

type Action = RunEvent | { t: 'reset' };

function runReducer(state: RunState, action: Action): RunState {
  if (action.t === 'reset') return INITIAL_RUN;
  return reduce(state, action);
}

export interface UseRun {
  state: RunState;
  running: boolean;
  run: (req: RunRequest) => Promise<void>;
  cancel: () => void;
  reset: () => void;
}

/**
 * Drives one pipeline run: POSTs the request, streams SSE events into the run reducer, and exposes
 * a synchronous in-flight guard so a double-click can't launch two runs. `cancel()` aborts the
 * fetch (the server stops the in-process pipeline at the next stage boundary).
 */
export function useRun(): UseRun {
  const [state, dispatch] = React.useReducer(runReducer, INITIAL_RUN);
  const [running, setRunning] = React.useState(false);
  const inFlight = React.useRef(false);
  const acRef = React.useRef<AbortController | null>(null);

  const run = React.useCallback(async (req: RunRequest) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRunning(true);
    const ac = new AbortController();
    acRef.current = ac;
    dispatch({ t: 'start', source: { kind: req.kind, describe: 'starting…', label: '' } });
    try {
      await runStudio(req, (e) => dispatch(e), ac.signal);
    } catch (err) {
      if (!ac.signal.aborted) {
        dispatch({ t: 'error', stage: 'input', message: err instanceof Error ? err.message : String(err) });
        dispatch({ t: 'done', ok: false, ms: 0 });
      }
    } finally {
      inFlight.current = false;
      setRunning(false);
      acRef.current = null;
    }
  }, []);

  const cancel = React.useCallback(() => acRef.current?.abort(), []);
  const reset = React.useCallback(() => {
    acRef.current?.abort();
    dispatch({ t: 'reset' });
  }, []);

  return { state, running, run, cancel, reset };
}

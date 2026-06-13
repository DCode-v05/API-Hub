import type { RunEvent, RunRequest } from './events';
import type { ProjectSyncEvent } from './records';

/** Parse a server SSE body, calling onEvent for each `data:` frame (accepts LF and CRLF). */
async function pumpSse<T>(body: ReadableStream<Uint8Array>, onEvent: (e: T) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const boundary = /\r?\n\r?\n/;
  let buffer = '';

  const emitBlock = (block: string): void => {
    const dataLine = block
      .split('\n')
      .map((l) => l.replace(/\r$/, ''))
      .find((l) => l.startsWith('data:'));
    if (!dataLine) return;
    try {
      onEvent(JSON.parse(dataLine.slice(5).trim()) as T);
    } catch {
      /* ignore malformed frames */
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
    let m: RegExpExecArray | null;
    while ((m = boundary.exec(buffer))) {
      emitBlock(buffer.slice(0, m.index));
      buffer = buffer.slice(m.index + m[0].length);
    }
    if (done) {
      // Flush any trailing frame the server didn't terminate with a blank line.
      if (buffer.trim()) emitBlock(buffer);
      break;
    }
  }
}

/** POST the input to /api/run and parse the streamed SSE events, calling onEvent for each. */
export async function runStudio(req: RunRequest, onEvent: (e: RunEvent) => void, signal?: AbortSignal): Promise<void> {
  const res = await fetch('/api/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`Studio API error (HTTP ${res.status})`);
  await pumpSse<RunEvent>(res.body, onEvent);
}

/**
 * Trigger a manual project sync and stream its events. Emits the same pipeline funnel events as a
 * run, plus a final {t:'version'} frame carrying the outcome (unchanged / new version / error).
 */
export async function syncProject(
  projectId: string,
  onEvent: (e: ProjectSyncEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`/api/projects/${projectId}/sync`, { method: 'POST', signal });
  if (res.status === 409) {
    const msg = await res
      .json()
      .then((j) => (j as { error?: string }).error)
      .catch(() => null);
    throw new Error(msg || 'A sync is already running for this project.');
  }
  if (!res.ok || !res.body) throw new Error(`Sync failed (HTTP ${res.status})`);
  await pumpSse<ProjectSyncEvent>(res.body, onEvent);
}

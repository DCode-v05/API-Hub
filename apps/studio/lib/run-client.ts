import type { RunEvent, RunRequest } from './events';

/** POST the input to /api/run and parse the streamed SSE events, calling onEvent for each. */
export async function runStudio(
  req: RunRequest,
  onEvent: (e: RunEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch('/api/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`Studio API error (HTTP ${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const boundary = /\r?\n\r?\n/; // accept both LF and CRLF frame separators
  let buffer = '';

  const emitBlock = (block: string): void => {
    const dataLine = block
      .split('\n')
      .map((l) => l.replace(/\r$/, ''))
      .find((l) => l.startsWith('data:'));
    if (!dataLine) return;
    try {
      onEvent(JSON.parse(dataLine.slice(5).trim()) as RunEvent);
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

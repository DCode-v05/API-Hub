export interface CliFile {
  path: string;
  content: string;
}

export type CliEvent =
  | { t: 'start'; argv: string[] }
  | { t: 'out'; data: string }
  | { t: 'err'; data: string }
  | { t: 'artifacts'; files: CliFile[]; truncated?: boolean }
  | { t: 'exit'; code: number };

/** Split a command line into argv, honoring single/double quotes. No shell expansion. */
export function tokenize(input: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  let has = false;
  for (const c of input) {
    if (quote) {
      if (c === quote) quote = null;
      else cur += c;
      has = true;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      has = true;
      continue;
    }
    if (/\s/.test(c)) {
      if (has) {
        out.push(cur);
        cur = '';
        has = false;
      }
      continue;
    }
    cur += c;
    has = true;
  }
  if (has) out.push(cur);
  return out;
}

/** POST argv to /api/cli and stream the child's output events to onEvent. `auth` carries the form's
 * GitHub PAT (typed token or saved id) so the spawned cn uses it instead of the repo .env. */
export async function runCliStream(
  args: string[],
  onEvent: (e: CliEvent) => void,
  signal?: AbortSignal,
  auth?: { pat?: string; patId?: string },
): Promise<void> {
  let res: Response;
  try {
    res = await fetch('/api/cli', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ args, pat: auth?.pat, patId: auth?.patId }),
      signal,
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return;
    onEvent({ t: 'err', data: `cn: ${e instanceof Error ? e.message : String(e)}\n` });
    onEvent({ t: 'exit', code: 1 });
    return;
  }
  if (!res.ok || !res.body) {
    onEvent({ t: 'err', data: `cn: CLI API error (HTTP ${res.status})\n` });
    onEvent({ t: 'exit', code: 1 });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const boundary = /\r?\n\r?\n/;
  let buffer = '';
  const emit = (block: string): void => {
    const line = block
      .split('\n')
      .map((l) => l.replace(/\r$/, ''))
      .find((l) => l.startsWith('data:'));
    if (!line) return;
    try {
      onEvent(JSON.parse(line.slice(5).trim()) as CliEvent);
    } catch {
      /* ignore malformed frame */
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
    let m: RegExpExecArray | null;
    while ((m = boundary.exec(buffer))) {
      emit(buffer.slice(0, m.index));
      buffer = buffer.slice(m.index + m[0].length);
    }
    if (done) {
      if (buffer.trim()) emit(buffer);
      break;
    }
  }
}

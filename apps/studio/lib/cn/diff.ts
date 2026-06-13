import type { Ir, IrOperation } from '@cn/contracts';
import type { DiffSummary } from '../records';

/**
 * Compare two IRs operation-by-operation (keyed by the durable IrOperation.id) to produce a
 * human-readable change summary. Advisory only — surfaced in the UI, never a publish gate.
 */

/**
 * Stable projection of the parts of an operation that, if changed, change the generated surfaces.
 * Keys are sorted recursively so the comparison is order-independent — the previous IR arrives from
 * Postgres jsonb (which reorders object keys) while the next IR is freshly built (insertion order),
 * and a plain JSON.stringify would otherwise flag every untouched operation as "changed".
 */
function opSignature(op: IrOperation): string {
  return stableStringify({ method: op.method, path: op.path, auth: op.auth, input: op.input, output: op.output });
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

function requiredInputs(op: IrOperation): Set<string> {
  const names = new Set<string>();
  for (const f of op.input ?? []) if (f.required) names.add(f.name);
  return names;
}

export function diffIr(prev: Ir | undefined, next: Ir, prevFileCount = 0, nextFileCount = 0): DiffSummary {
  const fileDelta = nextFileCount - prevFileCount;

  if (!prev) {
    const n = next.operations.length;
    return {
      opsAdded: next.operations.map((o) => o.id),
      opsRemoved: [],
      opsChanged: [],
      fileDelta,
      opDelta: n,
      severity: 'initial',
      note: `Initial version — ${n} operation${n === 1 ? '' : 's'}.`,
    };
  }

  const prevOps = new Map(prev.operations.map((o) => [o.id, o]));
  const nextOps = new Map(next.operations.map((o) => [o.id, o]));
  const opsAdded: string[] = [];
  const opsRemoved: string[] = [];
  const opsChanged: string[] = [];
  let breaking = false;

  for (const [oid, op] of nextOps) {
    const before = prevOps.get(oid);
    if (!before) {
      opsAdded.push(oid);
      continue;
    }
    if (opSignature(before) !== opSignature(op)) {
      opsChanged.push(oid);
      if (before.method !== op.method || before.path !== op.path) breaking = true;
      const beforeReq = requiredInputs(before);
      const afterNames = new Set((op.input ?? []).map((f) => f.name));
      for (const name of requiredInputs(op)) if (!beforeReq.has(name)) breaking = true; // newly required
      for (const name of beforeReq) if (!afterNames.has(name)) breaking = true; // dropped a required param
    }
  }
  for (const oid of prevOps.keys()) {
    if (!nextOps.has(oid)) {
      opsRemoved.push(oid);
      breaking = true;
    }
  }

  const total = opsAdded.length + opsRemoved.length + opsChanged.length;
  const severity: DiffSummary['severity'] = total === 0 ? 'none' : breaking ? 'breaking' : 'minor';

  return {
    opsAdded,
    opsRemoved,
    opsChanged,
    fileDelta,
    opDelta: next.operations.length - prev.operations.length,
    severity,
    note: noteFor(opsAdded.length, opsRemoved.length, opsChanged.length, severity),
  };
}

function noteFor(added: number, removed: number, changed: number, severity: DiffSummary['severity']): string {
  if (severity === 'none') return 'No surface changes.';
  const parts: string[] = [];
  if (added) parts.push(`+${added} operation${added === 1 ? '' : 's'}`);
  if (removed) parts.push(`−${removed} removed`);
  if (changed) parts.push(`${changed} changed`);
  return parts.join(' · ');
}

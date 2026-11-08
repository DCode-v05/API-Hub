import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Projection } from '@cn/contracts';

export const LOCK_VERSION = 'cn-lock/1';

export interface LockEntry {
  irHash: string;
  surfaces: Record<string, string>;
}

export interface LockFile {
  lockVersion: string;
  generator: string;
  entries: Record<string, LockEntry>;
}

export function sha256(content: string): string {
  return 'sha256:' + createHash('sha256').update(content, 'utf8').digest('hex');
}

export function projectionSig(projection: Projection): Record<string, string> {
  const out: Record<string, string> = {};
  for (const surface of projection.surfaces) {
    for (const file of surface.files) {
      out[`${surface.dir}/${file.path}`] = sha256(file.content);
    }
  }
  return sortRecord(out);
}

export function sigEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (a[k] !== b[k]) return false;
  return true;
}

export function compareEntry(expected: LockEntry, actual: LockEntry): string[] {
  const diffs: string[] = [];
  if (expected.irHash !== actual.irHash) {
    diffs.push(`IR hash: ${shortHash(expected.irHash)} → ${shortHash(actual.irHash)}`);
  }
  const allFiles = new Set([...Object.keys(expected.surfaces), ...Object.keys(actual.surfaces)]);
  for (const file of [...allFiles].sort()) {
    const e = expected.surfaces[file];
    const a = actual.surfaces[file];
    if (e === undefined) diffs.push(`added file: ${file}`);
    else if (a === undefined) diffs.push(`removed file: ${file}`);
    else if (e !== a) diffs.push(`changed: ${file} (${shortHash(e)} → ${shortHash(a)})`);
  }
  return diffs;
}

export function readLock(path: string): LockFile | null {
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<LockFile>;
    if (!raw || typeof raw !== 'object' || typeof raw.entries !== 'object' || raw.entries === null) return null;
    return {
      lockVersion: typeof raw.lockVersion === 'string' ? raw.lockVersion : LOCK_VERSION,
      generator: typeof raw.generator === 'string' ? raw.generator : 'unknown',
      entries: raw.entries as Record<string, LockEntry>,
    };
  } catch {
    return null;
  }
}

export function writeLock(path: string, lock: LockFile): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(sortKeys(lock), null, 2) + '\n', 'utf8');
}

export function shortHash(h: string): string {
  return h.replace('sha256:', '').slice(0, 12);
}

function sortRecord(rec: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(rec).sort()) out[k] = rec[k]!;
  return out;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const input = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(input).sort()) out[k] = sortKeys(input[k]);
    return out;
  }
  return value;
}

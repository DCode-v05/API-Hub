import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Projection } from '@cn/contracts';
import {
  compareEntry, projectionSig, readLock, sigEqual, sha256, writeLock, LOCK_VERSION, type LockFile,
} from './lock';

const projection = (content: string): Projection => ({
  surfaces: [{ kind: 'mcp', dir: 'mcp', files: [{ path: 'tools.json', content }] }],
  diagnostics: [],
});

describe('lock', () => {
  it('hashes are stable and prefixed', () => {
    expect(sha256('x')).toBe(sha256('x'));
    expect(sha256('x')).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(sha256('x')).not.toBe(sha256('y'));
  });

  it('projectionSig keys by "<dir>/<path>" and is key-sorted', () => {
    const proj: Projection = {
      surfaces: [{ kind: 'mcp', dir: 'mcp', files: [{ path: 'z.txt', content: 'a' }, { path: 'a.txt', content: 'b' }] }],
      diagnostics: [],
    };
    const sig = projectionSig(proj);
    expect(Object.keys(sig)).toEqual(['mcp/a.txt', 'mcp/z.txt']);
    expect(sig['mcp/a.txt']).toBe(sha256('b'));
  });

  it('sigEqual is true only for identical maps', () => {
    expect(sigEqual(projectionSig(projection('a')), projectionSig(projection('a')))).toBe(true);
    expect(sigEqual(projectionSig(projection('a')), projectionSig(projection('b')))).toBe(false);
  });

  it('compareEntry returns no diffs for identical entries', () => {
    const e = { irHash: 'sha256:aa', surfaces: projectionSig(projection('a')) };
    expect(compareEntry(e, { ...e })).toEqual([]);
  });

  it('compareEntry reports ir-hash, changed, added and removed files', () => {
    const base = { irHash: 'sha256:aa', surfaces: { 'mcp/tools.json': sha256('a'), 'mcp/old.ts': sha256('o') } };
    const next = { irHash: 'sha256:bb', surfaces: { 'mcp/tools.json': sha256('a2'), 'mcp/new.ts': sha256('n') } };
    const diffs = compareEntry(base, next);
    expect(diffs.some((d) => d.startsWith('IR hash:'))).toBe(true);
    expect(diffs.some((d) => d.startsWith('changed: mcp/tools.json'))).toBe(true);
    expect(diffs.some((d) => d === 'added file: mcp/new.ts')).toBe(true);
    expect(diffs.some((d) => d === 'removed file: mcp/old.ts')).toBe(true);
  });

  it('writeLock → readLock round-trips and sorts keys deterministically', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cn-lock-test-'));
    const path = join(dir, 'cn.lock');
    const lock: LockFile = {
      lockVersion: LOCK_VERSION, generator: 'cn-ir/1 + projection',
      entries: { b: { irHash: 'sha256:bb', surfaces: { 'mcp/z': 'sha256:1' } }, a: { irHash: 'sha256:aa', surfaces: {} } },
    };
    writeLock(path, lock);
    const text = readFileSync(path, 'utf8');
    expect(text.indexOf('"a"')).toBeLessThan(text.indexOf('"b"')); // entries sorted
    expect(text.endsWith('\n')).toBe(true);
    const back = readLock(path);
    expect(back?.entries['b']?.irHash).toBe('sha256:bb');
    expect(back?.lockVersion).toBe(LOCK_VERSION);
  });

  it('readLock returns null for a missing file', () => {
    expect(readLock(join(tmpdir(), 'does-not-exist-xyz.lock'))).toBeNull();
  });
});

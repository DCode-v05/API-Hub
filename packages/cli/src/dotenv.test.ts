import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadEnv } from './dotenv';

describe('loadEnv', () => {
  it('loads KEY=VALUE lines without overriding the real environment', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cn-env-'));
    const file = join(dir, '.env');
    writeFileSync(
      file,
      ['# a comment', 'export CN_TEST_PAT=ghp_abc123', 'CN_TEST_QUOTED="spaced value"', 'CN_TEST_PRESET=fromfile', ''].join('\n'),
    );
    process.env['CN_TEST_PRESET'] = 'fromenv';
    try {
      loadEnv(file);
      expect(process.env['CN_TEST_PAT']).toBe('ghp_abc123'); // `export ` prefix stripped
      expect(process.env['CN_TEST_QUOTED']).toBe('spaced value'); // quotes stripped
      expect(process.env['CN_TEST_PRESET']).toBe('fromenv'); // real env wins
    } finally {
      delete process.env['CN_TEST_PAT'];
      delete process.env['CN_TEST_QUOTED'];
      delete process.env['CN_TEST_PRESET'];
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { runCli } from './cn';

const here = fileURLToPath(new URL('.', import.meta.url));
const fixtures = join(here, '..', '..', '..', 'fixtures');
const lumen = join(fixtures, 'lumen', 'openapi', 'lumen.json');

describe('cn run (all-in-one)', () => {
  it('writes artifact, validated, ir, and surfaces from a single input', async () => {
    const out = mkdtempSync(join(tmpdir(), 'cn-run-'));
    const code = await runCli(['run', '--openapi', lumen, '-o', out, '--quiet']);
    expect(code).toBe(0);
    expect(existsSync(join(out, 'artifact.json'))).toBe(true);
    expect(existsSync(join(out, 'validated.json'))).toBe(true);
    expect(existsSync(join(out, 'ir.json'))).toBe(true);
    expect(existsSync(join(out, 'surfaces', 'sdk', 'typescript', 'src', 'client.ts'))).toBe(true);
    expect(existsSync(join(out, 'surfaces', 'sdk', 'python'))).toBe(true);
    expect(existsSync(join(out, 'surfaces', 'mcp', 'server.mjs'))).toBe(true);
    expect(existsSync(join(out, 'surfaces', 'cli', 'cli.mjs'))).toBe(true);
    expect(existsSync(join(out, 'surfaces', 'docs', 'README.md'))).toBe(true);
    rmSync(out, { recursive: true, force: true });
  });

  it('fails loud (exit 1, no IR/surfaces) on an invalid spec', async () => {
    const out = mkdtempSync(join(tmpdir(), 'cn-run-bad-'));
    const code = await runCli(['run', '--openapi', join(fixtures, 'nope.json'), '-o', out, '--quiet']);
    expect(code).toBe(1);
    expect(existsSync(join(out, 'artifact.json'))).toBe(true); // wrote what it had
    expect(existsSync(join(out, 'validated.json'))).toBe(true);
    expect(existsSync(join(out, 'ir.json'))).toBe(false); // but no IR from an invalid spec
    expect(existsSync(join(out, 'surfaces'))).toBe(false);
    rmSync(out, { recursive: true, force: true });
  });

  it('runs MULTIPLE inputs, each into out/<label>/', async () => {
    const out = mkdtempSync(join(tmpdir(), 'cn-run-multi-'));
    const mcp = join(fixtures, 'mcp-sample', 'tools.json');
    const code = await runCli(['run', '--openapi', lumen, '--mcp', mcp, '-o', out, '--quiet']);
    expect(code).toBe(0);
    expect(existsSync(join(out, 'openapi-lumen', 'ir.json'))).toBe(true);
    expect(existsSync(join(out, 'openapi-lumen', 'surfaces'))).toBe(true);
    expect(existsSync(join(out, 'mcp-tools', 'ir.json'))).toBe(true);
    rmSync(out, { recursive: true, force: true });
  });

  it('with no flags, runs every input in cn.config.json', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cn-cfg-'));
    const mcp = join(fixtures, 'mcp-sample', 'tools.json');
    writeFileSync(
      join(dir, 'cn.config.json'),
      JSON.stringify({ out: 'gen', inputs: [{ openapi: lumen }, { mcp }] }),
    );
    const cwd = process.cwd();
    try {
      process.chdir(dir);
      const code = await runCli(['run', '--quiet']);
      expect(code).toBe(0);
      expect(existsSync(join(dir, 'gen', 'openapi-lumen', 'ir.json'))).toBe(true);
      expect(existsSync(join(dir, 'gen', 'mcp-tools', 'ir.json'))).toBe(true);
    } finally {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--ir also collects each input IR into ir/<label>.json (and keeps normal output)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cn-ir-'));
    const mcp = join(fixtures, 'mcp-sample', 'tools.json');
    const cwd = process.cwd();
    try {
      process.chdir(dir);
      const code = await runCli(['run', '--openapi', lumen, '--mcp', mcp, '--ir', '-o', 'gen', '--quiet']);
      expect(code).toBe(0);
      // collected IR copies live under the out dir: <out>/ir/<label>.json
      expect(existsSync(join(dir, 'gen', 'ir', 'openapi-lumen.json'))).toBe(true);
      expect(existsSync(join(dir, 'gen', 'ir', 'mcp-tools.json'))).toBe(true);
      // normal per-input output still written
      expect(existsSync(join(dir, 'gen', 'openapi-lumen', 'ir.json'))).toBe(true);
      expect(existsSync(join(dir, 'gen', 'openapi-lumen', 'surfaces'))).toBe(true);
    } finally {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--only restricts which surfaces run emits', async () => {
    const out = mkdtempSync(join(tmpdir(), 'cn-run-only-'));
    const code = await runCli(['run', '--openapi', lumen, '-o', out, '--only', 'mcp,docs', '--quiet']);
    expect(code).toBe(0);
    expect(existsSync(join(out, 'surfaces', 'mcp'))).toBe(true);
    expect(existsSync(join(out, 'surfaces', 'docs'))).toBe(true);
    expect(existsSync(join(out, 'surfaces', 'sdk'))).toBe(false);
    rmSync(out, { recursive: true, force: true });
  });
});

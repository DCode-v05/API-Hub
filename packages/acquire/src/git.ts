import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { redactSecrets } from './errors';

export interface RepoCheckout {
  dir: string;
  sha: string;
  cleanup: () => Promise<void>;
}

export interface CloneOptions {
  repo: string;
  pat: string;
  ref?: string;
}

export interface GitClient {
  clone(opts: CloneOptions): Promise<RepoCheckout>;
}

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function run(cmd: string, args: string[]): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', (e) => reject(e));
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

async function safeRm(dir: string): Promise<void> {
  try {
    await rm(dir, { recursive: true, force: true });
  } catch {
  }
}

export function createGitClient(): GitClient {
  return {
    async clone(opts) {
      const dir = await mkdtemp(join(tmpdir(), 'cn-git-'));
      const url = `https://x-access-token:${opts.pat}@github.com/${opts.repo}.git`;

      const shallow = ['clone', '--quiet', '--depth', '1'];
      if (opts.ref) shallow.push('--branch', opts.ref);
      shallow.push(url, dir);
      let res = await run('git', shallow);

      if (res.code !== 0 && opts.ref) {
        await safeRm(dir);
        const full = await run('git', ['clone', '--quiet', url, dir]);
        if (full.code === 0) {
          const co = await run('git', ['-C', dir, 'checkout', '--quiet', opts.ref]);
          res = co.code === 0 ? full : co;
        } else {
          res = full;
        }
      }

      if (res.code !== 0) {
        await safeRm(dir);
        throw new Error(`git clone/checkout failed: ${redactSecrets(res.stderr || res.stdout)}`);
      }

      const head = await run('git', ['-C', dir, 'rev-parse', 'HEAD']);
      const sha = head.code === 0 ? head.stdout.trim() : 'unknown';
      return { dir, sha, cleanup: () => safeRm(dir) };
    },
  };
}

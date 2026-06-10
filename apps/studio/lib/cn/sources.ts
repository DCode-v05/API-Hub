import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { GithubSource, McpSource, OpenApiSource, SdkSource, SourceRef } from '@cn/contracts';
import type { RunRequest } from '../events';
import { resolveUserPath } from '../server/paths';

export interface BuiltSource {
  source: SourceRef;
  cleanup?: () => Promise<void>;
}

/** Turn the browser's RunRequest into a SourceRef (writing pasted/uploaded specs to a temp file). */
export async function buildSourceFromRequest(req: RunRequest): Promise<BuiltSource | { error: string }> {
  if (req.sample) {
    const root = repoRoot();
    switch (req.sample) {
      case 'github': {
        const pat = envPat();
        if (!pat) return { error: 'No GitHub PAT found — set CN_GITHUB_PAT in .env to run the GitHub sample.' };
        return { source: { kind: 'github', repo: 'DCode-v05/Test', pat } };
      }
      case 'openapi': {
        const p = join(root, 'samples', 'openapi', 'tasks-api.yaml');
        return existsSync(p) ? { source: { kind: 'openapi', location: p } } : { error: sampleMissing(p) };
      }
      case 'sdk-ts': {
        const p = join(root, 'samples', 'sdk-typescript');
        return existsSync(p) ? { source: { kind: 'sdk', path: p } } : { error: sampleMissing(p) };
      }
      case 'sdk-py': {
        const p = join(root, 'samples', 'sdk-python');
        return existsSync(p) ? { source: { kind: 'sdk', path: p } } : { error: sampleMissing(p) };
      }
      case 'mcp': {
        const p = join(root, 'samples', 'mcp', 'tasks-tools.json');
        return existsSync(p) ? { source: { kind: 'mcp', target: p } } : { error: sampleMissing(p) };
      }
    }
  }

  switch (req.kind) {
    case 'github': {
      const repo = (req.repo ?? '').trim();
      if (!repo || !repo.includes('/')) return { error: 'Enter a GitHub repo as "owner/repo".' };
      // No silent .env fallback — the studio always requires an explicit token (typed or a saved PAT
      // resolved by the API route before this point).
      const pat = (req.pat ?? '').trim();
      if (!pat) return { error: 'A GitHub PAT is required — enter a token or select a saved one.' };
      const source: GithubSource = { kind: 'github', repo, pat };
      if (req.ref?.trim()) source.ref = req.ref.trim();
      if (req.spec?.trim()) source.spec = req.spec.trim();
      return { source };
    }
    case 'openapi': {
      if (req.openapiUrl?.trim()) {
        const s: OpenApiSource = { kind: 'openapi', location: req.openapiUrl.trim() };
        return { source: s };
      }
      if (req.openapiPath?.trim()) {
        const p = resolveUserPath(req.openapiPath.trim());
        if (!existsSync(p)) return { error: `File not found: ${req.openapiPath}` };
        return { source: { kind: 'openapi', location: p } };
      }
      if (req.openapiContent?.trim()) {
        const { path, cleanup } = await writeTemp(req.openapiContent, guessExt(req.openapiContent));
        return { source: { kind: 'openapi', location: path }, cleanup };
      }
      return { error: 'Provide an OpenAPI URL, a file path, or paste a spec.' };
    }
    case 'sdk': {
      const p = (req.sdkPath ?? '').trim();
      if (!p) return { error: 'Enter the local path to the SDK directory.' };
      const abs = resolveUserPath(p);
      if (!existsSync(abs)) return { error: `Path not found: ${p}` };
      const source: SdkSource = { kind: 'sdk', path: abs };
      if (req.lang === 'typescript' || req.lang === 'python') source.language = req.lang;
      return { source };
    }
    case 'mcp': {
      if (req.mcpCommand?.trim()) {
        const s: McpSource = { kind: 'mcp', target: req.mcpCommand.trim(), command: true };
        return { source: s };
      }
      if (req.mcpUrl?.trim()) return { source: { kind: 'mcp', target: req.mcpUrl.trim() } };
      if (req.mcpPath?.trim()) {
        const p = resolveUserPath(req.mcpPath.trim());
        if (!existsSync(p)) return { error: `File not found: ${req.mcpPath}` };
        return { source: { kind: 'mcp', target: p } };
      }
      if (req.mcpContent?.trim()) {
        const { path, cleanup } = await writeTemp(req.mcpContent, '.json');
        return { source: { kind: 'mcp', target: path }, cleanup };
      }
      return { error: 'Provide an MCP manifest (URL / file / paste) or a stdio command.' };
    }
    default:
      return { error: 'Unknown input type.' };
  }
}

/** A short directory-style label for an input, mirroring the CLI's labels. */
export function labelFor(source: SourceRef): string {
  const part = (() => {
    switch (source.kind) {
      case 'github':
        return source.repo.split('/').pop() ?? source.repo;
      case 'openapi':
        return baseNoExt(source.location);
      case 'sdk':
        return baseNoExt(source.path);
      case 'mcp':
        return baseNoExt(source.target);
    }
  })();
  const slug = part.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'input';
  return `${source.kind}-${slug.startsWith(source.kind + '-') ? slug.slice(source.kind.length + 1) : slug}`;
}

function baseNoExt(p: string): string {
  const base = p.split(/[\\/]/).pop() ?? p;
  return base.replace(/\.[^.]+$/, '');
}

async function writeTemp(content: string, ext: string): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), 'cn-studio-'));
  const path = join(dir, `input${ext}`);
  await writeFile(path, content, 'utf8');
  return {
    path,
    cleanup: async () => {
      try {
        await rm(dir, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    },
  };
}

function guessExt(content: string): string {
  const t = content.trimStart();
  return t.startsWith('{') || t.startsWith('[') ? '.json' : '.yaml';
}

function sampleMissing(p: string): string {
  return `Bundled sample not found at ${p} — start the studio from the repo root so its samples/ folder resolves.`;
}

/** Walk up from cwd to the monorepo root (the dir holding cn.config.json / samples). */
function repoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'cn.config.json')) || existsSync(join(dir, 'samples'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

/** GitHub PAT fallback: env vars, then a .env walking up from cwd (so the repo .env works). */
function envPat(): string | undefined {
  const fromEnv = process.env['CN_GITHUB_PAT'] || process.env['GITHUB_TOKEN'] || process.env['GH_TOKEN'];
  if (fromEnv) return fromEnv;
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const p = join(dir, '.env');
    try {
      if (existsSync(p)) {
        const m = readFileSync(p, 'utf8').match(/^\s*CN_GITHUB_PAT\s*=\s*(.+?)\s*$/m);
        if (m && m[1]) return m[1].replace(/^["']|["']$/g, '');
      }
    } catch {
      /* ignore */
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

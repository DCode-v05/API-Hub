import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Single source of truth: load the ONE repo-root .env (and .env.local) into process.env so the
// Studio shares the same file as the `cn` CLI. Next only auto-loads env from this app dir, so we
// reach two levels up. `.env.local` wins over `.env`; a real OS env var wins over both (we never
// overwrite an already-set key). Runs on every Next worker that evaluates this config.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
for (const file of ['.env.local', '.env']) {
  const path = join(repoRoot, file);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || m[0].trimStart().startsWith('#')) continue;
    const key = m[1];
    if (process.env[key] !== undefined) continue;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    process.env[key] = val;
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow building into an isolated dir (e.g. for a verification build while `next dev` holds .next).
  distDir: process.env.STUDIO_DIST_DIR || '.next',
  // The @cn/* workspace packages ship TypeScript source (exports → src/index.ts), so Next must
  // transpile them.
  transpilePackages: ['@cn/contracts', '@cn/acquire', '@cn/ingest', '@cn/ir-core', '@cn/projection'],
  // Heavy/native server-only deps the pipeline pulls in — keep them external (don't bundle).
  // `pg` uses dynamic requires + optional native bindings; it must stay external too.
  serverExternalPackages: ['typescript', '@apidevtools/swagger-parser', 'js-yaml', 'pg'],
  webpack: (config, { isServer }) => {
    // transpilePackages bundles the @cn/* sources and would otherwise pull their heavy deps
    // (the TypeScript compiler, swagger-parser) into the bundle. Force them external on the
    // server so they're required from node_modules at runtime instead.
    if (isServer && Array.isArray(config.externals)) {
      config.externals = ['typescript', '@apidevtools/swagger-parser', 'js-yaml', ...config.externals];
    }
    return config;
  },
};

export default nextConfig;

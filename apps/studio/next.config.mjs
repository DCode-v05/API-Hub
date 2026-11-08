import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const nextConfig = {
  distDir: process.env.STUDIO_DIST_DIR || '.next',
  transpilePackages: ['@cn/contracts', '@cn/acquire', '@cn/ingest', '@cn/ir-core', '@cn/projection'],
  serverExternalPackages: ['typescript', '@apidevtools/swagger-parser', 'js-yaml', 'pg'],
  webpack: (config, { isServer }) => {
    if (isServer && Array.isArray(config.externals)) {
      config.externals = ['typescript', '@apidevtools/swagger-parser', 'js-yaml', ...config.externals];
    }
    return config;
  },
};

export default nextConfig;

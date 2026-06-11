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

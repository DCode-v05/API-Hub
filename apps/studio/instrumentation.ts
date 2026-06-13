/**
 * Next.js runs register() once per server process on boot. We (a) reconcile orphaned hosted MCP
 * servers and (b) start the project auto-sync watcher. The work MUST live inside an
 * `if (process.env.NEXT_RUNTIME === 'nodejs')` block: Next's bundler strips that block from the edge
 * compile, so the pg / child_process / @cn graph never reaches the edge runtime. We also skip the
 * production-build phase (no DB there). STUDIO_WATCH_DISABLED=1 turns the watcher off.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PHASE !== 'phase-production-build') {
    const { reconcileHosts } = await import('./lib/server/hosts');
    void reconcileHosts(); // fire-and-forget — never block boot
    if (process.env.STUDIO_WATCH_DISABLED !== '1') {
      const { startWatcher } = await import('./lib/server/watcher');
      startWatcher();
    }
  }
}

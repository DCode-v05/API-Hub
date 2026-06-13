/**
 * Next.js runs register() once per server process on boot. We start the project auto-sync watcher
 * here. The work MUST live inside an `if (process.env.NEXT_RUNTIME === 'nodejs')` block: Next's
 * bundler strips that block from the edge compile, so the watcher's pg / child_process / @cn graph
 * never reaches the edge runtime (where `fs` etc. don't resolve). A dynamic import keeps it lazy.
 * STUDIO_WATCH_DISABLED=1 turns the watcher off (CI builds, manual-only setups).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (process.env.STUDIO_WATCH_DISABLED === '1') return;
    const { startWatcher } = await import('./lib/server/watcher');
    startWatcher();
  }
}

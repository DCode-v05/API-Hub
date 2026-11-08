export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PHASE !== 'phase-production-build') {
    const { reconcileHosts } = await import('./lib/server/hosts');
    void reconcileHosts();
    if (process.env.STUDIO_WATCH_DISABLED !== '1') {
      const { startWatcher } = await import('./lib/server/watcher');
      startWatcher();
    }
  }
}

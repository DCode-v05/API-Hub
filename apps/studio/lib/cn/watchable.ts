import type { RunRequest } from '../events';

/**
 * A project can only be created from a source the pipeline can re-fetch on its own — a GitHub repo
 * (via a saved PAT), a URL, or a local file path. Pasted/typed-inline specs and stdio MCP commands
 * have no durable source to watch, so they're rejected here. This is the single source of truth used
 * by BOTH the create-project API (authoritative) and the "Save as Project" UI (button + hint).
 */

export type Watchability = { ok: true } | { ok: false; reason: string };

export function isWatchable(req: RunRequest): Watchability {
  switch (req.kind) {
    case 'github': {
      if (!req.repo?.trim() || !req.repo.includes('/')) return { ok: false, reason: 'Enter a GitHub repo as "owner/repo".' };
      // Projects re-acquire headlessly, so we need a *saved* PAT — typed-once tokens are never stored.
      if (!req.patId) {
        return { ok: false, reason: 'Select a saved PAT — projects re-fetch on their own, so a stored token is required (typed tokens aren’t saved).' };
      }
      return { ok: true };
    }
    case 'openapi':
      if (req.openapiUrl?.trim() || req.openapiPath?.trim()) return { ok: true };
      return { ok: false, reason: 'Pasted specs can’t be watched — point at a URL or a local file path.' };
    case 'sdk':
      if (req.sdkPath?.trim()) return { ok: true };
      return { ok: false, reason: 'An SDK project needs a local directory path.' };
    case 'mcp':
      if (req.mcpUrl?.trim() || req.mcpPath?.trim()) return { ok: true };
      if (req.mcpCommand?.trim()) return { ok: false, reason: 'A stdio command can’t be watched — use a manifest URL or file path.' };
      return { ok: false, reason: 'Pasted manifests can’t be watched — use a URL or a file path.' };
    default:
      return { ok: false, reason: 'Unknown input type.' };
  }
}

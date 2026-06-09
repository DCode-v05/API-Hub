export interface ParsedGithubUrl {
  owner: string;
  repo: string;
  /** Branch / tag / commit, when the URL carries one (…/tree/<ref> or …/blob/<ref>/…). */
  ref?: string;
  /** Path to a spec file within the repo, when the URL points at one (…/blob/<ref>/<path>). */
  spec?: string;
}

/**
 * Parse a GitHub repo location into its parts. Accepts the URL shapes GitHub actually produces:
 *   https://github.com/owner/repo[.git]
 *   https://github.com/owner/repo/tree/<ref>[/<dir>]          → owner, repo, ref
 *   https://github.com/owner/repo/blob/<ref>/<path/to/spec>   → owner, repo, ref, spec
 *   git@github.com:owner/repo.git                             → owner, repo
 *   github.com/owner/repo  ·  owner/repo                      (host/protocol optional)
 *
 * Returns null for anything that isn't a GitHub repo location (other hosts, junk).
 * Note: branch names containing "/" can't be told apart from the file path in tree/blob URLs,
 * so the ref is taken as the single segment after tree/blob (the common case).
 */
export function parseGithubUrl(input: string): ParsedGithubUrl | null {
  let s = (input ?? '').trim();
  if (!s) return null;

  // SSH form: git@github.com:owner/repo(.git)
  const ssh = s.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i);
  if (ssh) return { owner: ssh[1], repo: stripGit(ssh[2]) };

  s = s.replace(/^git\+/i, '').replace(/^https?:\/\//i, '');

  const host = s.match(/^(?:www\.)?github\.com\/(.+)$/i);
  let path: string;
  if (host) {
    path = host[1];
  } else {
    // No github.com host — accept a bare "owner/repo[/…]" but reject other hosts/protocols.
    if (s.includes('://')) return null;
    const first = s.split('/')[0];
    if (first.includes('.')) return null; // a domain like gitlab.com (owners never contain dots)
    if (!/^[^/]+\/[^/]+/.test(s)) return null;
    path = s;
  }

  path = path.split('#')[0].split('?')[0].replace(/\/+$/, '');
  const segs = path.split('/').filter(Boolean);
  if (segs.length < 2) return null;

  const owner = segs[0];
  const repo = stripGit(segs[1]);
  if (!owner || !repo) return null;

  const out: ParsedGithubUrl = { owner, repo };
  const kind = segs[2];
  if ((kind === 'tree' || kind === 'blob') && segs[3]) {
    out.ref = safeDecode(segs[3]);
    const rest = segs.slice(4).join('/');
    if (kind === 'blob' && rest) {
      out.spec = safeDecode(rest);
    } else if (kind === 'tree' && rest && /\.(ya?ml|json)$/i.test(rest)) {
      // A tree URL pointing directly at a spec file (rare) — keep it as the spec.
      out.spec = safeDecode(rest);
    }
  }
  return out;
}

function stripGit(s: string): string {
  return s.replace(/\.git$/i, '');
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export interface ParsedGithubUrl {
  owner: string;
  repo: string;
  ref?: string;
  spec?: string;
}

export function parseGithubUrl(input: string): ParsedGithubUrl | null {
  let s = (input ?? '').trim();
  if (!s) return null;

  const ssh = s.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i);
  if (ssh) return { owner: ssh[1], repo: stripGit(ssh[2]) };

  s = s.replace(/^git\+/i, '').replace(/^https?:\/\//i, '');

  const host = s.match(/^(?:www\.)?github\.com\/(.+)$/i);
  let path: string;
  if (host) {
    path = host[1];
  } else {
    if (s.includes('://')) return null;
    const first = s.split('/')[0];
    if (first.includes('.')) return null;
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

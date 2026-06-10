// Heuristic for "this file is probably an OpenAPI/Swagger spec".
const SPEC_RE = /(^|\/)(openapi|swagger|api)[^/]*\.(ya?ml|json)$|\.(openapi|swagger)\.(ya?ml|json)$/i;

export interface RepoInspection {
  ok: boolean;
  error?: string;
  defaultBranch?: string;
  isPrivate?: boolean;
  branches?: string[];
  specs?: string[];
}

function gh(path: string, pat: string): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'cn-studio',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
}

/** Validate access to a repo and discover its branches + candidate spec files. */
export async function inspectRepo(repo: string, pat: string, ref?: string): Promise<RepoInspection> {
  const [owner, name] = repo.trim().split('/');
  if (!owner || !name) return { ok: false, error: 'Enter the repo as "owner/repo".' };

  let repoJson: { default_branch?: string; private?: boolean };
  try {
    const res = await gh(`/repos/${owner}/${name}`, pat);
    if (res.status === 401) return { ok: false, error: 'Token rejected (401) — check that the PAT is valid and not expired.' };
    if (res.status === 403) return { ok: false, error: 'Forbidden (403) — the token may lack repo scope, or you hit a rate limit.' };
    if (res.status === 404) return { ok: false, error: 'Repository not found or the token has no access (404).' };
    if (!res.ok) return { ok: false, error: `GitHub API error (HTTP ${res.status}).` };
    repoJson = (await res.json()) as typeof repoJson;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error reaching GitHub.' };
  }

  const defaultBranch = repoJson.default_branch ?? 'main';
  const branchRef = ref?.trim() || defaultBranch;

  let branches: string[] = [];
  try {
    const res = await gh(`/repos/${owner}/${name}/branches?per_page=100`, pat);
    if (res.ok) {
      const arr = (await res.json()) as { name?: string }[];
      branches = Array.isArray(arr) ? arr.map((b) => b.name).filter((n): n is string => !!n) : [];
    }
  } catch {
    /* non-fatal */
  }

  let specs: string[] = [];
  try {
    const res = await gh(`/repos/${owner}/${name}/git/trees/${encodeURIComponent(branchRef)}?recursive=1`, pat);
    if (res.ok) {
      const tree = (await res.json()) as { tree?: { path?: string; type?: string }[] };
      const items = Array.isArray(tree.tree) ? tree.tree : [];
      specs = items
        .filter((i) => i.type === 'blob' && typeof i.path === 'string' && SPEC_RE.test(i.path))
        .map((i) => i.path as string)
        .slice(0, 50);
    }
  } catch {
    /* non-fatal */
  }

  return { ok: true, defaultBranch, isPrivate: !!repoJson.private, branches, specs };
}

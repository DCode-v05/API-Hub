/** Client for the Sample API. */
export class ProjectsClient {
  constructor(private readonly token: string) {}

  /** Create a new design project in a team. Returns the project id. */
  create(name: string, teamId: string, template?: string): Promise<Project> {
    return request('POST', '/projects', { name, teamId, template });
  }

  /** List projects belonging to a team. */
  list(teamId: string): Promise<Project[]> {
    return request('GET', '/projects', { teamId });
  }

  private buildUrl(path: string): string {
    return `https://api.example${path}`;
  }
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
}

async function request<T>(method: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method, body: JSON.stringify(body) });
  return (await res.json()) as T;
}

export class ProjectsClient {
  constructor(private readonly token: string) {}

  create(name: string, teamId: string, template?: string): Promise<Project> {
    return request('POST', '/projects', { name, teamId, template });
  }

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

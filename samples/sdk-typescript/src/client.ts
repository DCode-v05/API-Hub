export class ProjectsClient {
  constructor(private readonly token: string) {}
  list(status?: string, limit?: number, cursor?: string): Promise<ProjectPage> {
    return request('GET', '/projects', { status, limit, cursor });
  }
  create(name: string, status?: string): Promise<Project> {
    return request('POST', '/projects', { name, status });
  }
  get(projectId: string): Promise<Project> {
    return request('GET', `/projects/${projectId}`, {});
  }
  update(projectId: string, name?: string, status?: string): Promise<Project> {
    return request('PATCH', `/projects/${projectId}`, { name, status });
  }
  remove(projectId: string): Promise<void> {
    return request('DELETE', `/projects/${projectId}`, {});
  }
}

export class TasksClient {
  constructor(private readonly token: string) {}
  list(projectId?: string, status?: string, assigneeId?: string): Promise<TaskPage> {
    return request('GET', '/tasks', { projectId, status, assigneeId });
  }
  create(projectId: string, title: string, assigneeId?: string): Promise<Task> {
    return request('POST', '/tasks', { projectId, title, assigneeId });
  }
  get(taskId: string): Promise<Task> {
    return request('GET', `/tasks/${taskId}`, {});
  }
  update(taskId: string, status?: string, assigneeId?: string): Promise<Task> {
    return request('PATCH', `/tasks/${taskId}`, { status, assigneeId });
  }
  remove(taskId: string): Promise<void> {
    return request('DELETE', `/tasks/${taskId}`, {});
  }
}

export class CommentsClient {
  constructor(private readonly token: string) {}
  list(taskId: string, limit?: number): Promise<CommentPage> {
    return request('GET', '/comments', { taskId, limit });
  }
  create(taskId: string, body: string): Promise<Comment> {
    return request('POST', '/comments', { taskId, body });
  }
  get(commentId: string): Promise<Comment> {
    return request('GET', `/comments/${commentId}`, {});
  }
  remove(commentId: string): Promise<void> {
    return request('DELETE', `/comments/${commentId}`, {});
  }
}

export class UsersClient {
  constructor(private readonly token: string) {}
  list(limit?: number, cursor?: string): Promise<UserPage> {
    return request('GET', '/users', { limit, cursor });
  }
  get(userId: string): Promise<User> {
    return request('GET', `/users/${userId}`, {});
  }
}

export class TagsClient {
  constructor(private readonly token: string) {}
  list(): Promise<TagPage> {
    return request('GET', '/tags', {});
  }
  create(name: string, color?: string): Promise<Tag> {
    return request('POST', '/tags', { name, color });
  }
  remove(tagId: string): Promise<void> {
    return request('DELETE', `/tags/${tagId}`, {});
  }
}

export interface Project { id: string; name: string; status: string; createdAt: string }
export interface ProjectPage { items: Project[]; nextCursor?: string }
export interface Task { id: string; projectId: string; title: string; status: string; createdAt: string }
export interface TaskPage { items: Task[]; nextCursor?: string }
export interface Comment { id: string; taskId: string; authorId: string; body: string; createdAt: string }
export interface CommentPage { items: Comment[]; nextCursor?: string }
export interface User { id: string; name: string; email: string }
export interface UserPage { items: User[]; nextCursor?: string }
export interface Tag { id: string; name: string; color?: string }
export interface TagPage { items: Tag[]; nextCursor?: string }

async function request<T>(method: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`https://api.tasks.example/v1${path}`, { method, body: JSON.stringify(body) });
  return (await res.json()) as T;
}

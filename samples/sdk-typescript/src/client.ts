// Sample input #3a: an existing TypeScript SDK (reverse-derived, "inferred" trust).
// Five resource clients with ~22 methods total — `cn acquire --sdk` introspects every public method.

export class ProjectsClient {
  constructor(private readonly token: string) {}
  /** List projects, optionally filtered by status. */
  list(status?: string, limit?: number, cursor?: string): Promise<ProjectPage> {
    return request('GET', '/projects', { status, limit, cursor });
  }
  /** Create a project. */
  create(name: string, status?: string): Promise<Project> {
    return request('POST', '/projects', { name, status });
  }
  /** Fetch one project by id. */
  get(projectId: string): Promise<Project> {
    return request('GET', `/projects/${projectId}`, {});
  }
  /** Update a project. */
  update(projectId: string, name?: string, status?: string): Promise<Project> {
    return request('PATCH', `/projects/${projectId}`, { name, status });
  }
  /** Delete a project. */
  remove(projectId: string): Promise<void> {
    return request('DELETE', `/projects/${projectId}`, {});
  }
}

export class TasksClient {
  constructor(private readonly token: string) {}
  /** List tasks, filtered by project, status, or assignee. */
  list(projectId?: string, status?: string, assigneeId?: string): Promise<TaskPage> {
    return request('GET', '/tasks', { projectId, status, assigneeId });
  }
  /** Create a task in a project. */
  create(projectId: string, title: string, assigneeId?: string): Promise<Task> {
    return request('POST', '/tasks', { projectId, title, assigneeId });
  }
  /** Fetch one task by id. */
  get(taskId: string): Promise<Task> {
    return request('GET', `/tasks/${taskId}`, {});
  }
  /** Update a task. */
  update(taskId: string, status?: string, assigneeId?: string): Promise<Task> {
    return request('PATCH', `/tasks/${taskId}`, { status, assigneeId });
  }
  /** Delete a task. */
  remove(taskId: string): Promise<void> {
    return request('DELETE', `/tasks/${taskId}`, {});
  }
}

export class CommentsClient {
  constructor(private readonly token: string) {}
  /** List comments for a task. */
  list(taskId: string, limit?: number): Promise<CommentPage> {
    return request('GET', '/comments', { taskId, limit });
  }
  /** Add a comment to a task. */
  create(taskId: string, body: string): Promise<Comment> {
    return request('POST', '/comments', { taskId, body });
  }
  /** Fetch one comment by id. */
  get(commentId: string): Promise<Comment> {
    return request('GET', `/comments/${commentId}`, {});
  }
  /** Delete a comment. */
  remove(commentId: string): Promise<void> {
    return request('DELETE', `/comments/${commentId}`, {});
  }
}

export class UsersClient {
  constructor(private readonly token: string) {}
  /** List users. */
  list(limit?: number, cursor?: string): Promise<UserPage> {
    return request('GET', '/users', { limit, cursor });
  }
  /** Fetch one user by id. */
  get(userId: string): Promise<User> {
    return request('GET', `/users/${userId}`, {});
  }
}

export class TagsClient {
  constructor(private readonly token: string) {}
  /** List tags. */
  list(): Promise<TagPage> {
    return request('GET', '/tags', {});
  }
  /** Create a tag. */
  create(name: string, color?: string): Promise<Tag> {
    return request('POST', '/tags', { name, color });
  }
  /** Delete a tag. */
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

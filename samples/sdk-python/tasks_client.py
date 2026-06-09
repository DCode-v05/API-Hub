# Sample input #3b: an existing Python SDK (reverse-derived, "inferred" trust).
# `cn acquire --sdk` introspects every public def. Methods are uniquely named so each maps to its
# own operation (the Python introspector keys on the function name).


class ProjectsClient:
    def __init__(self, token: str):
        self._token = token

    def list_projects(self, status: str = None, limit: int = None, cursor: str = None) -> dict:
        """List projects, optionally filtered by status."""
        return self._request("GET", "/projects", {"status": status, "limit": limit, "cursor": cursor})

    def create_project(self, name: str, status: str = None) -> dict:
        """Create a project."""
        return self._request("POST", "/projects", {"name": name, "status": status})

    def get_project(self, project_id: str) -> dict:
        """Fetch one project by id."""
        return self._request("GET", f"/projects/{project_id}", {})

    def update_project(self, project_id: str, name: str = None, status: str = None) -> dict:
        """Update a project."""
        return self._request("PATCH", f"/projects/{project_id}", {"name": name, "status": status})

    def delete_project(self, project_id: str) -> None:
        """Delete a project."""
        return self._request("DELETE", f"/projects/{project_id}", {})

    def _request(self, method, path, body):
        raise NotImplementedError


class TasksClient:
    def __init__(self, token: str):
        self._token = token

    def list_tasks(self, project_id: str = None, status: str = None, assignee_id: str = None) -> dict:
        """List tasks, filtered by project, status, or assignee."""
        return self._request("GET", "/tasks", {"project_id": project_id, "status": status, "assignee_id": assignee_id})

    def create_task(self, project_id: str, title: str, assignee_id: str = None) -> dict:
        """Create a task in a project."""
        return self._request("POST", "/tasks", {"project_id": project_id, "title": title, "assignee_id": assignee_id})

    def get_task(self, task_id: str) -> dict:
        """Fetch one task by id."""
        return self._request("GET", f"/tasks/{task_id}", {})

    def update_task(self, task_id: str, status: str = None, assignee_id: str = None) -> dict:
        """Update a task."""
        return self._request("PATCH", f"/tasks/{task_id}", {"status": status, "assignee_id": assignee_id})

    def delete_task(self, task_id: str) -> None:
        """Delete a task."""
        return self._request("DELETE", f"/tasks/{task_id}", {})

    def _request(self, method, path, body):
        raise NotImplementedError


class CommentsClient:
    def __init__(self, token: str):
        self._token = token

    def list_comments(self, task_id: str, limit: int = None) -> dict:
        """List comments for a task."""
        return self._request("GET", "/comments", {"task_id": task_id, "limit": limit})

    def create_comment(self, task_id: str, body: str) -> dict:
        """Add a comment to a task."""
        return self._request("POST", "/comments", {"task_id": task_id, "body": body})

    def get_comment(self, comment_id: str) -> dict:
        """Fetch one comment by id."""
        return self._request("GET", f"/comments/{comment_id}", {})

    def delete_comment(self, comment_id: str) -> None:
        """Delete a comment."""
        return self._request("DELETE", f"/comments/{comment_id}", {})

    def _request(self, method, path, body):
        raise NotImplementedError


class DirectoryClient:
    def __init__(self, token: str):
        self._token = token

    def list_users(self, limit: int = None, cursor: str = None) -> dict:
        """List users."""
        return self._request("GET", "/users", {"limit": limit, "cursor": cursor})

    def get_user(self, user_id: str) -> dict:
        """Fetch one user by id."""
        return self._request("GET", f"/users/{user_id}", {})

    def list_tags(self) -> dict:
        """List tags."""
        return self._request("GET", "/tags", {})

    def create_tag(self, name: str, color: str = None) -> dict:
        """Create a tag."""
        return self._request("POST", "/tags", {"name": name, "color": color})

    def delete_tag(self, tag_id: str) -> None:
        """Delete a tag."""
        return self._request("DELETE", f"/tags/{tag_id}", {})

    def _request(self, method, path, body):
        raise NotImplementedError

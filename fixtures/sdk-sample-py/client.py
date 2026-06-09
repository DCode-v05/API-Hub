class ProjectsClient:
    def __init__(self, token: str):
        self._token = token

    def create(self, name: str, team_id: str, template: str = None) -> "Project":
        """Create a new design project in a team. Returns the project id."""
        return self._request("POST", "/projects", {"name": name, "team_id": team_id, "template": template})

    def list(self, team_id: str) -> list:
        """List projects belonging to a team."""
        return self._request("GET", "/projects", {"team_id": team_id})

    def _request(self, method, path, body):
        raise NotImplementedError

# Sample input #1: a GitHub repo + PAT

Unlike the other three inputs, GitHub needs a **live repo** and a **token**, so it can't ship as a
static file. The shape is simple: the repo just needs to contain an OpenAPI spec — exactly like
[`../openapi/tasks-api.yaml`](../openapi/tasks-api.yaml).

## Set it up

1. Put an OpenAPI spec in a repo (public or private). For example, commit `tasks-api.yaml` to
   `your-org/tasks-api` at the path `openapi/tasks-api.yaml`.
2. Create a Personal Access Token with **read access to the repo's contents**
   (GitHub → Settings → Developer settings → Personal access tokens).
3. Provide the token one of three ways (checked in this order, real env wins):
   - `--pat <token>` on the command line,
   - an env var: `CN_GITHUB_PAT`, `GITHUB_TOKEN`, or `GH_TOKEN`,
   - a **`.env` file** in the repo root (gitignored) — `cn` loads it automatically:
     ```
     CN_GITHUB_PAT=ghp_xxx
     ```
     (See [`.env.example`](../../.env.example). Never commit `.env`.)

## Run it

```bash
# with a .env file present you don't pass --pat at all:
cn run --github your-org/tasks-api

# Auto-detect the spec in the repo:
cn build --github your-org/tasks-api

# …or pin a ref and point at the exact spec path:
cn build --github your-org/tasks-api --ref main --spec openapi/tasks-api.yaml

# All the way to surfaces:
cn project --github your-org/tasks-api --spec openapi/tasks-api.yaml -o surfaces
```

## What happens

The `github` adapter clones the repo with the PAT, **pins the exact commit SHA**, finds the spec
(auto-detected by conventional name, or `--spec`), bundles its `$ref`s, and emits an
**origin-blind** canonical artifact — the token and repo URL never enter the artifact, only the
commit SHA in `provenance.sha` for audit. From there it's identical to the OpenAPI path.

> Want to try without your own repo? Any public repo containing an OpenAPI file works, e.g.
> `cn build --github <org>/<repo> --pat $GITHUB_TOKEN --spec path/to/openapi.yaml`.

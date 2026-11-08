# API Hub

Takes an API source (an OpenAPI file, a GitHub repo, an existing SDK, or an MCP server) and generates a TypeScript SDK, a Python SDK, a CLI, an MCP server and reference docs from it. All five come from one normalized, content-hashed intermediate representation (IR), so they stay consistent with each other.

Anyone consuming an API ends up writing the same client, CLI, agent tooling and docs by hand, and they drift when the spec changes. Here every output is a pure function of the IR, so the same source always gives the same output and only a change in the source can change a surface.

I built it as an AI Engineering intern at September AI (September Platforms). The repo has the connector engine, a `cn` command line, and a Next.js web app called Studio on top of them.

## How it works

A source goes through a fixed pipeline, and each stage removes one kind of variation:

```
SourceRef -> acquire -> CanonicalArtifact -> ingest -> ValidatedArtifact -> build -> IR -> project -> surfaces -> test
```

- **Acquire** (`packages/acquire`): one adapter per input type. The GitHub adapter clones with a personal access token and pins the commit SHA, the OpenAPI adapter loads a file or URL and bundles external `$ref`s, the SDK adapter uses an embedded spec if there is one and otherwise introspects the TypeScript or Python client signatures, and the MCP adapter reads a server's advertised tools. The result no longer carries repo paths or URLs.
- **Ingest** (`packages/ingest`): normalizes to OpenAPI 3.1, assembles a single self-contained document, validates it, and drafts repair proposals. Validation errors stop the run. Repair proposals are suggestions only and are never applied automatically.
- **Build** (`packages/ir-core`): produces the IR with stable operation IDs derived from `operationId` (or method and path) rather than file position, and a sha256 hash over canonical content that leaves out timestamps and provenance.
- **Project** (`packages/projection`): one generator each for the TypeScript SDK, Python SDK, MCP server, CLI and docs. The MCP server it emits has no dependencies and exposes `POST /mcp` and `GET /health`.
- **Test**: generated surfaces are checked back against the IR, and a run is only `ok` when no test fails.

Studio (`apps/studio`) wraps the same pipeline in a web UI with a streaming run view. It stores projects, versions, IR snapshots and tokens in PostgreSQL (plain `pg`, no ORM), records an IR diff each time a source is re-synced, can host a generated MCP server or CLI as a local process, and can publish the SDKs to npm and PyPI. Upstream tokens are AES-GCM encrypted at rest, and sessions use a hand-written HS256 JWT.

## Tech stack

- TypeScript on Node.js 20+, npm workspaces
- Engine: `@apidevtools/swagger-parser`, `js-yaml`
- Studio: Next.js 15, React 19, Tailwind CSS, PostgreSQL 16
- Tooling: vitest, tsx, tsc, Docker Compose (database only)

## Setup

```bash
git clone https://github.com/DCode-v05/API-Hub.git
cd API-Hub
npm install
cp .env.example .env
```

`.env` is read by both the CLI and Studio:

- `CN_GITHUB_PAT`: token for `--github` inputs
- `DATABASE_URL`: Studio database, defaults to the Compose one on port 5433
- `STUDIO_NPM_SCOPE`, `STUDIO_NPM_TOKEN`, `STUDIO_PYPI_PREFIX`, `STUDIO_PYPI_TOKEN`: only needed to publish SDKs from Studio

Studio needs PostgreSQL. The schema is created on first request:

```bash
docker compose up -d
```

## Running

CLI:

```bash
node packages/cli/bin/cn.mjs run --openapi ./samples/openapi/tasks-api.yaml
node packages/cli/bin/cn.mjs run --sdk ./fixtures/sdk-sample
node packages/cli/bin/cn.mjs run --mcp ./fixtures/mcp-sample/tools.json
```

`run` goes through every stage and writes into `./out`. The stages can also be run one at a time with `cn acquire`, `cn ingest`, `cn build` and `cn project`, and `cn <command> --help` lists the flags. Call the launcher directly: `npm run cn -- ...` makes npm swallow flags such as `--openapi`. A bare `cn run` with no flags takes its inputs from `cn.config.json`.

Studio:

```bash
npm run studio    # http://localhost:4000
```

Create an account, pick an input type, name the project and save. Each re-sync adds a version with an IR diff, and the project page has a Distribute panel for hosting, downloading the CLI and publishing the SDKs.

Checks:

```bash
npm run typecheck
npm test
```

## Project structure

```
packages/
  contracts/    shared types (SourceRef, CanonicalArtifact, IR, ...)
  acquire/      the four input adapters, OpenAPI bundling, commit pinning
  ingest/       adapt, assemble, validate, repair
  ir-core/      operation IDs, IR build, canonicalize and hash
  projection/   sdk-typescript, sdk-python, mcp, cli, docs generators
  cli/          the cn command
apps/studio/    Next.js app: pages and API routes, components, server and pipeline code, DB scripts
samples/        example inputs for each source type
fixtures/       test fixtures
docs/           QA write-up
scripts/        qa.mts
cn.config.json  default inputs for a bare `cn run`
docker-compose.yml
```

`out/` and `surfaces/` hold generated output and are gitignored.

## Contact

Denistan B: [portfolio](https://www.denistan.me), [LinkedIn](https://www.linkedin.com/in/denistanb), [GitHub](https://github.com/DCode-v05)

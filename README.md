# API Hub

**Point it at any API source and get back a TypeScript SDK, a Python SDK, a CLI, an MCP server, and docs — all generated from one content-hashed intermediate representation, so they never drift apart.**

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white) ![Node.js](https://img.shields.io/badge/Node.js%20%E2%89%A520-339933?style=flat&logo=nodedotjs&logoColor=white) ![Next.js](https://img.shields.io/badge/Next.js%2015-000000?style=flat&logo=nextdotjs&logoColor=white) ![React](https://img.shields.io/badge/React%2019-61DAFB?style=flat&logo=react&logoColor=black) ![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-06B6D4?style=flat&logo=tailwindcss&logoColor=white) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL%2016-4169E1?style=flat&logo=postgresql&logoColor=white) ![OpenAPI](https://img.shields.io/badge/OpenAPI%203.1-6BA539?style=flat&logo=openapiinitiative&logoColor=white) ![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=flat&logo=vitest&logoColor=white)

## Overview

Every team that consumes an API ends up hand-writing the same plumbing over and over: a client library, a CLI, agent tooling, reference docs. Then the spec changes and all of those artifacts quietly fall out of sync.

API Hub flips that around. You give it a source — an OpenAPI document, a GitHub repository, an existing SDK, or a running MCP server — and it pulls that source through a fixed pipeline down to a single normalized, content-hashed **intermediate representation (IR)**. Every output surface is then *projected* from that IR. Because the surfaces are pure functions of the IR, the same source always produces the same output, and the only thing that can change a surface is a change in the source.

Around the engine sits a **Studio** — a Next.js web app that gives the whole thing version control for inputs, IR-level diffs between versions, one-click hosting of generated MCP servers and CLIs, and one-click publishing of the SDKs to npm and PyPI.

I built this during my time as an AI Engineering intern at **September AI (September Platforms)**, as one of the agentic-UI prototypes in the company's internal platform work. This repository is the standalone, self-contained version of the connector pipeline and its Studio.

## Key Features

- **Four input adapters, one contract.** Acquire an API from a GitHub repo (cloned with a PAT, pinned to a commit SHA), an OpenAPI file or URL, an existing SDK directory, or a live MCP server.
- **Spec-less sources, recovered.** No OpenAPI doc? The SDK adapter reverse-derives operations by introspecting TypeScript and Python client signatures; the MCP adapter reads a server's advertised tools and maps each `inputSchema` to an operation.
- **Five generated surfaces from every source.** A `tsc`-clean TypeScript SDK, a `py_compile`-clean Python SDK, a runnable CLI, a zero-dependency Streamable-HTTP MCP server, and reference docs.
- **Deterministic, content-hashed IR.** Both the canonical artifact and the IR are hashed with sha256 over canonical (key-sorted) content, excluding timestamps and provenance — same source in, same hash out.
- **Stable operation IDs.** Identifiers are derived from `operationId` (or method + path), not file position, so reordering or editing the spec never renames an operation. Collisions are de-duplicated and reported.
- **Bad specs fail loud.** Validation blocks on real errors (undeclared path params, duplicate operation IDs, unresolved `$ref`s); `cn build` refuses to emit IR from an invalid spec.
- **Repair proposals that never mutate.** The ingest stage drafts deterministic fix suggestions for a human to accept — it never silently rewrites your spec.
- **Studio version control.** Each re-sync of a source records a new version with an IR diff (operations added / removed / changed, with severity). An optional watcher re-checks GitHub/URL sources and snapshots a new version whenever the content hash moves.
- **One-click distribution.** Host a generated MCP server (`POST /mcp`) or CLI (as an HTTP command service at `/run`) as a managed local process with start / stop / status / live logs, download the CLI package, or publish the SDKs.
- **Auth and secrets handled.** Email/password accounts with hand-rolled JWT (HS256) sessions; upstream API tokens are AES-GCM encrypted at rest and never sent to the browser.
- **Round-trip conversion tests.** After projection, generated surfaces are tested back against the IR so the pipeline catches its own regressions.

## How It Works

A source "climbs once" through the pipeline. Each stage strips out one axis of mess, and once you reach the IR, every surface fans out from it.

```
SourceRef --acquire--> CanonicalArtifact --ingest--> ValidatedArtifact --build--> IR --project--> surfaces --test--> ok
 (4 inputs)            (origin-blind, pinned)        (adapt/assemble/             (hashed)   SDK/MCP/CLI/docs   (round-trip)
                                                      validate/repair)
```

### Acquire — removes *location*

Each input type has its own adapter (`packages/acquire/src/adapters`). The GitHub adapter clones with a PAT, pins the commit SHA, finds the spec, and bundles its `$ref`s; the OpenAPI adapter loads a file or URL and bundles external refs into one self-contained document; the SDK adapter uses an embedded spec if present, otherwise introspects client signatures; the MCP adapter reads advertised tools over a manifest or stdio. The result is an **origin-blind canonical artifact** — no repo paths or URLs survive into the document, and a `contentHash` plus the pinned revision are attached as provenance.

### Ingest — removes *format*, *structure*, and *quality*

Ingestion is three steps in one package (`packages/ingest`):
- **Adapt** normalizes any version down to one OpenAPI 3.1 target shape (3.0 to 3.1 normalization, best-effort Swagger 2.0).
- **Assemble** merges everything into a single self-contained document, namespacing multi-spec inputs and noting circular references.
- **Validate + Repair** runs a blocking lint ("is it correct?") and a separate advisory pass ("is it clear?") that drafts repair proposals. Validation errors stop the pipeline; repair proposals are never auto-applied.

### Build — the IR

`packages/ir-core` walks the validated document and produces the normalized IR. Because every input was already flattened to one OpenAPI 3.1 shape, this builder is uniform regardless of origin — the same operation produces the same IR node whether it came from a repo, a spec, an SDK, or an MCP server. Operations get stable, identity-based IDs and a deterministic sort, and the hashed `core` deliberately excludes provenance so that *what the API is* drives the hash, not *where it came from*.

### Project — the surfaces

`packages/projection` holds one generator per surface: `sdk-typescript`, `sdk-python`, `mcp`, `cli`, and `docs`. They all read the same operations, parameters, verbs, and paths off the IR — same content, different clothes. The MCP generator emits a zero-dependency server exposing `POST /mcp` and `GET /health` that an agent can bind to directly.

### Test — round-trip

After projection, conversion tests round-trip the generated surfaces back against the IR to confirm nothing was lost in translation. The pipeline reports passed/failed counts and only marks the run `ok` when zero tests fail.

### The Studio

The engine is wrapped in a Next.js 15 / React 19 app (`apps/studio`) with a status-driven UI and a streaming run view (Server-Sent Events per stage). The pipeline lives in exactly one place (`lib/cn/pipeline.ts`) and is called by both the live streaming run and the headless watcher — the watcher can run in `acquireOnly` mode to fingerprint a source and skip codegen when nothing changed. Projects, versions, IR snapshots, PATs, and encrypted secrets are persisted to PostgreSQL via `pg` (no ORM). Distribution always re-projects from the pinned IR with the *current* generator rather than trusting a stored snapshot, so an old version still picks up newer generator features.

## Results / Highlights

- **5 output surfaces from 4 distinct input types**, all reduced through a single IR — roughly 290 KB of TypeScript across 6 engine packages plus the Studio (~670 KB TypeScript total in the repo).
- **Determinism is enforced, not aspirational:** sha256-over-canonical-content hashing at both the artifact and IR layers means a byte-identical source always yields a byte-identical IR.
- **Self-checking pipeline:** every run ends with round-trip conversion tests; unit tests (vitest) cover acquire, ingest, ir-core, projection, and the CLI lock/dotenv logic.
- **Reverse engineering for spec-less APIs:** TS and Python SDK introspection and MCP tool discovery recover an OpenAPI contract where none was published.

## Tech Stack

- **Language:** TypeScript (Node.js >= 20)
- **Monorepo:** npm workspaces — 6 engine packages (`contracts`, `acquire`, `ingest`, `ir-core`, `projection`, `cli`) + the Studio app
- **Engine libraries:** `@apidevtools/swagger-parser`, `js-yaml` (dependency-light otherwise)
- **Studio:** Next.js 15 (App Router), React 19, Tailwind CSS, `lucide-react`, `jszip`
- **Data:** PostgreSQL 16 via `pg` (no ORM); custom store/diff layer
- **Security:** hand-rolled JWT (HS256) sessions, AES-GCM secret encryption at rest
- **Tooling:** vitest, tsx, tsc
- **Publishing:** npm (TypeScript SDK); Python `build` + `twine` (Python SDK)
- **Infra:** Docker Compose (PostgreSQL 16 on port 5433)

## Getting Started

### Prerequisites
- Node.js 20 or newer
- Docker (for the Studio's PostgreSQL) — optional if you only use the CLI
- A GitHub PAT if you want to acquire from private repos

### Installation
```bash
git clone https://github.com/DCode-v05/API-Hub.git
cd API-Hub
npm install
```

### Configure environment
A single `.env` at the repo root is read by both the CLI and the Studio.
```bash
cp .env.example .env
```
```ini
CN_GITHUB_PAT=ghp_your_token_here                                            # for --github inputs
DATABASE_URL=postgres://postgres:postgres@localhost:5433/connector_network   # Studio DB
# Optional — only needed to publish SDKs from the Studio:
STUDIO_NPM_SCOPE=@your-scope
STUDIO_NPM_TOKEN=npm_xxx
STUDIO_PYPI_PREFIX=cn-
STUDIO_PYPI_TOKEN=pypi-xxx
```

### Start PostgreSQL (Studio only)
```bash
docker compose up -d     # PostgreSQL 16 on port 5433; schema bootstraps itself on first request
```

### Running
```bash
# CLI — full pipeline (acquire → ingest → build → project → test) into ./out
node packages/cli/bin/cn.mjs run --openapi ./samples/openapi/tasks-api.yaml

# Studio — Next.js dev server on http://localhost:4000
npm run studio
```

## Usage

### CLI (`cn`)

Call the bin launcher directly: `node packages/cli/bin/cn.mjs <command> …`. On macOS/Linux a shell shim helps — `cn() { node packages/cli/bin/cn.mjs "$@"; }` — or `npm link` once for a global `cn`.

```bash
# Run the whole pipeline (repeat input flags to process several at once)
cn run --openapi ./samples/openapi/tasks-api.yaml
cn run --sdk ./fixtures/sdk-sample
cn run --mcp ./fixtures/mcp-sample/tools.json

# …or drive the stages one at a time
cn acquire --openapi ./samples/openapi/tasks-api.yaml          # → canonical artifact
cn ingest  --openapi ./samples/openapi/tasks-api.yaml          # → validated artifact + repair proposals
cn build   --openapi ./samples/openapi/tasks-api.yaml -o out/  # → content-hashed IR (fails loud)
cn project --openapi ./samples/openapi/tasks-api.yaml          # → surfaces/ (SDK · MCP · CLI · docs)

cn <command> --help            # full flag list
```
> Don't use `npm run cn -- …` — npm intercepts the `--openapi` / `-o` flags. Call the bin launcher directly.

A bare `cn run` with no flags reads the input list from `cn.config.json`.

### Studio (web app)
1. Open `http://localhost:4000` and create an account.
2. Pick an input (OpenAPI / GitHub / SDK / MCP), give it a **Project Name**, and save — this creates version 1.
3. Each re-sync (manual or via the auto-sync watcher) records a new version with an IR diff.
4. Open a project → **Distribute** to host the MCP server / CLI, download the CLI package, or publish the SDKs to npm / PyPI.

### Develop
```bash
npm run typecheck    # tsc --noEmit across all packages
npm test             # vitest
```

## Project Structure

```
API-Hub/
│
├── packages/                 # The connector engine (npm workspaces)
│   ├── contracts/            # Shared types: SourceRef, CanonicalArtifact, ValidatedArtifact, IR…
│   ├── acquire/              # 4 input adapters + OpenAPI bundling + content-hash pinning
│   ├── ingest/               # adapt · assemble · validate · repair
│   ├── ir-core/              # stable operation IDs · build IR · canonicalize + hash
│   ├── projection/           # generators: sdk-typescript · sdk-python · mcp · cli · docs
│   └── cli/                  # the `cn` command (run | acquire | ingest | build | project)
│
├── apps/
│   └── studio/               # Next.js 15 web app (the Studio)
│       ├── app/              # App Router pages + API routes (projects, runs, host, publish…)
│       ├── components/       # React UI (inputs, projects, distribute, history, cli, run)
│       ├── lib/              # server (db · store · hosts · publish · jwt) + client + pipeline glue
│       └── scripts/          # DB init / import / migration scripts
│
├── samples/                  # Example inputs (openapi · github · mcp · sdk-*)
├── fixtures/                 # Test fixtures (lumen · adversarial · *-sample)
├── docs/                     # QA / design docs
├── docker-compose.yml        # PostgreSQL 16 for the Studio (port 5433)
├── cn.config.json            # Default input list for a bare `cn run`
├── .env.example              # Single env template (CLI + Studio)
├── package.json              # npm workspaces root + scripts
└── README.md
```
> `out/` and `surfaces/` hold generated CLI output and are regenerable (gitignored).

---

## Contact

<table>
  <tr><td><b>Portfolio:</b> <a href="https://www.denistan.me">Denistan</a></td><td><b>LinkedIn:</b> <a href="https://www.linkedin.com/in/denistanb">denistanb</a></td></tr>
  <tr><td><b>GitHub:</b> <a href="https://github.com/DCode-v05">DCode-v05</a></td><td><b>LeetCode:</b> <a href="https://leetcode.com/u/Denistan_B">Denistan_B</a></td></tr>
  <tr><td colspan="2" align="center"><b>Email:</b> <a href="mailto:denistanb05@gmail.com">denistanb05@gmail.com</a></td></tr>
</table>

Made with ❤️ by **Denistan B**

# API Hub

## Project Description
API Hub (powered by the **Connector Network** pipeline) turns any API source — an OpenAPI document, a GitHub repository, an existing SDK, or a running MCP server — into production-ready client surfaces: a **TypeScript SDK**, a **Python SDK**, a **CLI**, an **MCP server**, and **reference docs**. A source "climbs once" through a deterministic pipeline to a content-hashed Intermediate Representation (IR), which then fans out into every surface, so they never drift apart. A built-in **Next.js Studio** adds version control for inputs, one-click hosting, and one-click publishing to npm and PyPI.

---

## Project Details

### Problem Statement
Every API consumer re-implements the same plumbing by hand — clients, CLIs, agent tools, documentation — and those artifacts drift out of sync with the spec over time. API Hub makes the spec the single source of truth: ingest it **once**, and generate every surface **deterministically** from a content-hashed IR. The same source always produces the same output, and a change in the source is the only thing that can change a surface. APIs without a spec are supported too, by reverse-deriving the contract from an existing SDK or MCP server.

### The Pipeline
A source narrows one axis of "mess" per stage, then every surface is projected from the resulting IR:

```
SourceRef ─acquire→ CanonicalArtifact ─ingest→ ValidatedArtifact ─build→ IR ─project→ surfaces ─test→ ✓
 (4 inputs)        (origin-blind, pinned)     (adapt·assemble·          (hashed)   SDK·MCP·CLI·docs   (round-trip)
                                               validate·repair)
```

| Stage | Removes | What it does |
|---|---|---|
| **Acquire** | location | fetch from anywhere, pin the revision, bundle refs → an origin-blind canonical artifact |
| **Adapt** | format | any version → one OpenAPI 3.1 target shape (3.0 ↔ 3.1 normalize; best-effort Swagger 2.0) |
| **Assemble** | structure | one self-contained document; merge multi-spec under a namespace; note circular refs |
| **Validate + Repair** | quality | blocking lint ("is it correct?") + advisory, never-applied repair proposals ("is it clear?") |
| **Build (IR)** | — | normalized, content-hashed IR with stable, identity-based operation IDs |
| **Project** | — | render the IR into surfaces (SDK · MCP · CLI · docs) — same params/verb/path, different clothes |
| **Test** | — | conversion tests that round-trip the generated surfaces back against the IR |

### Inputs (acquisition)

| Input | How it's acquired | Trust |
|---|---|---|
| **GitHub repo + PAT** | clone with the PAT → pin commit SHA → find spec → bundle `$ref`s | `declared` |
| **OpenAPI document** (file/URL) | load → bundle external `$ref`s into one self-contained doc | `declared` |
| **Existing SDK** (dir) | embedded spec if present, else reverse-derive TS/Python signatures | `inferred` |
| **Existing MCP server** (manifest/stdio) | read advertised tools → map each `inputSchema` to an operation | `inferred` |

### Generated Surfaces
- **TypeScript SDK** — a `tsc`-clean package; reads base URL + token from `CN_BASE_URL` / `CN_TOKEN`.
- **Python SDK** — a `py_compile`-clean package with the same client shape.
- **CLI** — a runnable command (`<api> <resource> <verb> …`) over the same operations.
- **MCP server** — a zero-dependency Streamable-HTTP server (`POST /mcp` + `GET /health`) an agent can bind to.
- **Docs** — reference + examples generated from the IR.

### The Studio (web app)
A Next.js application that wraps the engine in a friendly, status-driven UI:

- **Projects & version control** — name a source; every change becomes a new version with an IR diff (added/removed/changed operations, severity). An optional **auto-sync watcher** re-checks GitHub/URL sources and records a new version whenever the content hash changes.
- **One-click hosting** — run a generated **MCP server** (at `/mcp`) or a generated **CLI** (as an HTTP command service at `/run`) as a managed local process, with start / stop / status / live logs. Hosts bind to `127.0.0.1`.
- **SDK publishing** — publish the TypeScript SDK to **npm** and the Python SDK to **PyPI** under a platform-owned org, with auto-incrementing versions and live build/publish logs.
- **Auth & secrets** — email/password accounts with hand-rolled **JWT (HS256)** sessions; upstream API tokens are **AES-GCM encrypted at rest** and never sent to the browser.

### Guarantees
- **Origin-blind & deterministic.** No repo paths/URLs survive into the document; both the artifact `contentHash` and the IR `hash` are sha256 over canonical (key-sorted) content, excluding timestamps/provenance — same source ⇒ same hash.
- **Stable operation IDs.** Derived from `operationId` (or method + path), not file position, so reorders/edits don't change them. Collisions are de-duplicated and reported.
- **Bad specs fail loud.** Validation errors (undeclared path params, duplicate operationIds, unresolved refs) block; `cn build` refuses to emit IR from an invalid spec.
- **Repair never mutates.** Proposals are drafted (deterministic heuristics) for a human to freeze — never auto-applied.
- **Surfaces are pure functions of the IR.** Distribution always re-projects from the pinned IR with the current generator.

---

## Tech Stack
- **Language:** TypeScript (Node.js ≥ 20)
- **Monorepo:** npm workspaces
- **Engine:** `@apidevtools/swagger-parser`, `js-yaml` (dependency-light otherwise)
- **Studio:** Next.js 15 (App Router), React 19, Tailwind CSS, PostgreSQL (`pg`, no ORM)
- **Tooling:** vitest, tsx, tsc
- **Publishing toolchain:** npm (TypeScript SDK); Python `build` + `twine` (Python SDK)

---

## Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/DCode-v05/API-Hub.git
cd API-Hub
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment
A single `.env` at the repo root is read by both the CLI and the Studio. Copy the template and fill it in:
```bash
cp .env.example .env
```
```ini
CN_GITHUB_PAT=ghp_your_token_here                                  # for --github inputs
DATABASE_URL=postgres://postgres:postgres@localhost:5433/connector_network   # Studio DB
# Optional — only needed to publish SDKs from the Studio:
STUDIO_NPM_SCOPE=@your-scope
STUDIO_NPM_TOKEN=npm_xxx
STUDIO_PYPI_PREFIX=cn-
STUDIO_PYPI_TOKEN=pypi-xxx
```

### 4. Start PostgreSQL (required for the Studio)
```bash
docker compose up -d        # PostgreSQL 16 on port 5433; schema bootstraps itself on first request
```

### 5a. Run the CLI
```bash
# acquire → ingest → build → project → test; writes artifact/validated/ir + surfaces into ./out
node packages/cli/bin/cn.mjs run --openapi ./samples/openapi/tasks-api.yaml
```

### 5b. Run the Studio
```bash
npm run studio              # next dev on http://localhost:4000
```

---

## Usage

### CLI (`cn`)
Invoke through the bin launcher: `node packages/cli/bin/cn.mjs <command> …`. On macOS/Linux a shell shim is handy: `cn() { node packages/cli/bin/cn.mjs "$@"; }`. (`npm link` once gives you a global `cn`.)

```bash
# Run the whole pipeline for an input (repeat input flags to do several at once)
cn run --openapi ./samples/openapi/tasks-api.yaml
cn run --sdk ./fixtures/sdk-sample
cn run --mcp ./fixtures/mcp-sample/tools.json

# …or drive the stages one at a time
cn acquire --openapi ./samples/openapi/tasks-api.yaml     # → canonical artifact
cn ingest  --openapi ./samples/openapi/tasks-api.yaml     # → validated artifact + repair proposals
cn build   --openapi ./samples/openapi/tasks-api.yaml -o out/   # → content-hashed IR (fails loud)
cn project --openapi ./samples/openapi/tasks-api.yaml     # → surfaces/ (SDK · MCP · CLI · docs)

cn <command> --help        # full flag list
```
> Don't use `npm run cn -- …` — npm intercepts the `--openapi`/`-o` flags. Call the bin launcher directly.

### Studio (web app)
1. Open `http://localhost:4000` and create an account.
2. Choose an input (OpenAPI / GitHub / SDK / MCP), give it a **Project Name**, and save — this creates version 1.
3. Each re-sync (manual or via the auto-sync watcher) records a new version with an IR diff.
4. Open a project → **Distribute** to **host** the MCP server / CLI, **download** the CLI package, or **publish** the SDKs to npm / PyPI.

### Develop
```bash
npm run typecheck          # tsc --noEmit across all packages
npm test                   # vitest
```

---

## Project Structure
```
API-Hub/
│
├── packages/                  # The Connector Network engine (npm workspaces)
│   ├── contracts/             # Shared types: SourceRef, CanonicalArtifact, ValidatedArtifact, IR…
│   ├── acquire/               # 4 input adapters + OpenAPI bundling + content-hash pinning
│   ├── ingest/                # adapt · assemble · validate · repair
│   ├── ir-core/               # stable operation IDs · build IR · canonicalize + hash
│   ├── projection/            # generators: sdk-typescript · sdk-python · mcp · cli · docs
│   └── cli/                   # the `cn` command (run | acquire | ingest | build | project)
│
├── apps/
│   └── studio/                # Next.js 15 web app (the Studio)
│       ├── app/               # App Router pages + API routes
│       ├── components/        # React UI (inputs, projects, distribute, history, cli)
│       ├── lib/               # server (db · store · hosts · publish · jwt) + client + pipeline glue
│       └── scripts/           # DB init / import / migration scripts
│
├── samples/                   # Example inputs (openapi · github · mcp · sdk-*)
├── fixtures/                  # Test fixtures (lumen · adversarial · *-sample)
├── docs/                      # QA / design docs
├── docker-compose.yml         # PostgreSQL 16 for the Studio (port 5433)
├── .env.example               # Single env template (CLI + Studio)
├── package.json               # npm workspaces root + scripts
└── README.md                  # Project documentation
```
> `out/` and `surfaces/` hold generated CLI output and are regenerable (gitignored).

---

## Contributing

Contributions are welcome! To contribute:
1. Fork the repository
2. Create a new branch:
   ```bash
   git checkout -b feature/your-feature
   ```
3. Commit your changes:
   ```bash
   git commit -m "Add your feature"
   ```
4. Push to your branch:
   ```bash
   git push origin feature/your-feature
   ```
5. Open a pull request describing your changes.

---

## Contact
- **GitHub:** [DCode-v05](https://github.com/DCode-v05)
- **Email:** denistanb05@gmail.com

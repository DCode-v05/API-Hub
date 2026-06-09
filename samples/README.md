# Samples — how to use Connector Network for every input type

All four inputs climb the **same pipeline** and produce the **same kinds of output**. Only the
front door differs:

```
            ┌ --github <owner/repo> --pat …      (declared)
 a source ──┼ --openapi <file|url>               (declared)
            ├ --sdk <dir>                         (inferred — reverse-derived)
            └ --mcp <manifest|server>             (inferred — reverse-derived)
                         │
        acquire → ingest → build → project
                         │
   CanonicalArtifact → ValidatedArtifact → IR → surfaces/{sdk,mcp,cli,docs}
```

Commands, each taking the **same input flags**:

| Command | Produces |
|---|---|
| `cn run` | **everything** — runs the whole pipeline itself and writes every artifact + surfaces → `./out` |
| `cn acquire` | one origin-blind, pinned **canonical artifact** (JSON) |
| `cn ingest` | a **validated artifact** + repair proposals (fails loud on a broken spec) |
| `cn build` | the normalized, content-hashed **IR** |
| `cn project` | runnable **surfaces** (TS SDK, Python SDK, MCP server, CLI, docs) under `./surfaces` |

> **Just want it done?** Use `cn run <input>` — you supply only the input; it acquires, ingests,
> builds, and projects on its own, writing `out/{artifact,validated,ir}.json` and `out/surfaces/`.
> The four granular commands stay available when you want a single stage.

### Run every input at once

`cn run`'s input flags are **repeatable**, so one command processes them all (a single input writes
flat to `out/`; multiple inputs each go to `out/<label>/`):

```bash
node packages/cli/bin/cn.mjs run \
  --github DCode-v05/Test \
  --openapi samples/openapi/tasks-api.yaml \
  --sdk samples/sdk-typescript \
  --sdk samples/sdk-python \
  --mcp samples/mcp/tasks-tools.json \
  -o out/all
```

Or list your inputs once in **`cn.config.json`** (repo root) and just run **`cn run`** with no flags:

```jsonc
// cn.config.json — paths relative to this file; GitHub PAT comes from .env, never stored here
{ "out": "out/all",
  "inputs": [
    { "github": "DCode-v05/Test" },
    { "openapi": "samples/openapi/tasks-api.yaml" },
    { "sdk": "samples/sdk-typescript" },
    { "sdk": "samples/sdk-python" },
    { "mcp": "samples/mcp/tasks-tools.json" } ] }
```

```bash
cn run        # no flags → runs every input in cn.config.json → out/all/<label>/
cn run --ir   # same, and also collects each input's IR into out/ir/<label>.json
```

There's also a wrapper for the local samples: **`samples/run-all.cmd`** (Windows) · **`samples/run-all.sh`** (bash).

## Setup

```bash
npm install
# convenience shim used in the examples below (run from the repo root):
cn() { node packages/cli/bin/cn.mjs "$@"; }
```

Secrets (e.g. a GitHub PAT) can live in a gitignored **`.env`** in the repo root — `cn` loads it at
startup, so you don't pass `--pat` each time. Copy [`.env.example`](../.env.example) to `.env`:

```
CN_GITHUB_PAT=ghp_xxx
```

> On Windows PowerShell, call `node packages/cli/bin/cn.mjs <command> …` directly.
> Don't use `npm run cn -- …` — npm intercepts the `--flags`.

---

## 1. GitHub repo + PAT  *(declared)*

Needs a live repo + token, so see [`github/README.md`](./github/README.md). Shape:

```bash
export GITHUB_TOKEN=ghp_xxx
cn run     --github your-org/tasks-api --spec openapi/tasks-api.yaml   # everything → ./out
cn build   --github your-org/tasks-api --ref main --spec openapi/tasks-api.yaml
cn project --github your-org/tasks-api --spec openapi/tasks-api.yaml
```

Clones → pins the commit SHA → finds + bundles the spec → origin-blind artifact (token/URL never
stored; only `provenance.sha`).

## 2. OpenAPI spec doc  *(declared)*  — [`openapi/tasks-api.yaml`](./openapi/tasks-api.yaml)

A file path or an `http(s)://` URL; YAML or JSON.

```bash
cn run     --openapi ./samples/openapi/tasks-api.yaml          # everything → ./out
cn acquire --openapi ./samples/openapi/tasks-api.yaml          # canonical artifact → stdout
cn build   --openapi ./samples/openapi/tasks-api.yaml -o out/  # IR → out/ir.json
cn project --openapi ./samples/openapi/tasks-api.yaml          # surfaces/ tree
```

Gives the cleanest surfaces: `tasks.list / tasks.create / tasks.get`, `auth: bearer`, typed models.

## 3. Existing SDK  *(inferred)*  — [`sdk-typescript/`](./sdk-typescript/) · [`sdk-python/`](./sdk-python/)

Point at the SDK directory; language is auto-detected (`--lang typescript|python` to force).

```bash
cn run   --sdk ./samples/sdk-typescript           # everything → ./out
cn build --sdk ./samples/sdk-typescript           # TS signatures → inferred IR
cn build --sdk ./samples/sdk-python               # Python signatures → inferred IR
```

The contract is reverse-derived from method signatures, so it carries `trust: inferred`. If the SDK
directory ships its own OpenAPI file, that's used directly instead.

## 4. Existing MCP server  *(inferred)*  — [`mcp/tasks-tools.json`](./mcp/tasks-tools.json)

A tools manifest (file/URL), or a live stdio server launched with `--command`.

```bash
# from a tools manifest:
cn run   --mcp ./samples/mcp/tasks-tools.json     # everything → ./out
cn build --mcp ./samples/mcp/tasks-tools.json

# from a live stdio MCP server (the tools/list handshake is performed for you):
cn acquire --mcp "node ./surfaces/mcp/server.mjs" --command
```

Each tool's `inputSchema` becomes an operation, `trust: inferred`. The second form closes the loop:
a server you generated with `cn project` is itself a valid MCP input.

---

## Output, side by side

```bash
cn project --openapi ./samples/openapi/tasks-api.yaml -o surfaces
```

```
surfaces/
  sdk/typescript/   tasks-sdk        → client.tasks.create({ title })        (tsc-clean)
  sdk/python/       tasks-sdk        → client.tasks.create(title=…)          (py_compile-clean)
  mcp/              tasks-mcp        → server.mjs (stdio) + tools.json
  cli/              tasks-cli        → tasks tasks create --title "…"
  docs/             reference        → README.md + tasks.md (curl/SDK/CLI examples)
```

Generated SDKs/CLI/MCP read the base URL + token from `CN_BASE_URL` / `CN_TOKEN` at runtime.
Everything is deterministic: the same input always yields the same artifact hash and byte-identical
surfaces.

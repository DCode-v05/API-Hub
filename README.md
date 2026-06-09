# Connector Network — Pipeline (CLI)

The one-way climb from the design doc, implemented as a CLI: **a source climbs once to a
content-hashed IR, which fans out into every surface.** Acquire → ingest → build → project are
implemented; everything after (config, the escape-hatch merge, host/register, the Part II DX layer)
is not yet.

```
SourceRef ─acquire→ CanonicalArtifact ─ingest→ ValidatedArtifact ─build→ IR ─project→ surfaces
 (4 inputs)        (origin-blind, pinned)     (adapt·assemble·          (hashed)   SDK·MCP·CLI·docs
                                               validate·repair)
```

The funnel narrows one axis of "mess" per stage, then the IR is projected-from later:

| Stage | Removes | What it does |
|---|---|---|
| **Acquire** | location | fetch from anywhere, pin the revision, bundle refs → origin-blind canonical artifact |
| **Adapt** | format | any version → one OpenAPI 3.1 target shape (3.0↔3.1 normalize; best-effort Swagger 2.0) |
| **Assemble** | structure | one self-contained doc; merge multi-spec under one namespace; note circular refs |
| **Validate + Repair** | quality | blocking lint ("is it correct?") + advisory, never-applied repair proposals ("is it clear?") |
| **IR build** | — | normalized, content-hashed IR with stable, identity-based operation IDs |
| **Project** | — | render the IR into four surfaces (SDK·MCP·CLI·docs); same params/verb/path, different clothes |

## Inputs (acquisition)

| Input | How it's acquired | Trust |
|---|---|---|
| **GitHub repo + PAT** | clone with the PAT → pin commit SHA → find spec → bundle `$ref`s | `declared` |
| **OpenAPI document** (file/URL) | load → bundle external `$ref`s into one self-contained doc | `declared` |
| **Existing SDK** (dir) | embedded spec if present, else reverse-derive TS/Python signatures | `inferred` |
| **Existing MCP** (manifest/stdio) | read advertised tools → map each `inputSchema` to an operation | `inferred` |

## Guarantees

- **Origin-blind** canonical artifact: no repo paths/URLs survive into the document; origin is kept
  in provenance for audit only. Reverse-derived schemas are scanned for external `$ref`s too.
- **Deterministic pins.** Both the artifact `contentHash` and the IR `hash` are sha256 over the
  canonical (key-sorted) content, **excluding** timestamps/provenance — same source ⇒ same hash.
- **Stable, identity-based operation IDs.** Derived from `operationId` (or method+path), not file
  position, so reorders/edits don't change them. Collisions are de-duplicated and reported.
- **Bad specs fail loud.** Validation errors (undeclared path params, duplicate operationIds,
  unresolved refs) block; `cn build` refuses to emit IR from an invalid spec.
- **Repair never mutates.** Proposals are drafted (deterministic heuristics today; an LLM drafter
  can slot into the same `{target, op, value, reason}` shape) for a human to freeze — never applied.
- **Lower trust for reverse-derived inputs** (SDK/MCP), carried through to every IR operation.

## Layout

```
packages/
  contracts/   shared types: SourceRef, CanonicalArtifact, ValidatedArtifact, RepairProposal, Ir…
  acquire/     4 adapters + service, OpenAPI bundling, content-hash pin, introspection
  ingest/      adapt · assemble · validate · repair · service
  ir-core/     identity (stable op IDs) · build (validated→IR) · canonicalize + hash
  projection/  naming · plan · generators: sdk-typescript · sdk-python · mcp · cli · docs
  cli/         the `cn` command (run | acquire | ingest | build | project)
fixtures/      lumen (multi-file OpenAPI), params-sample, sdk-sample(-py), mcp-sample, adversarial
```

## Usage

Invoke through the bin launcher (`node packages/cli/bin/cn.mjs …`) or `npx tsx
packages/cli/src/index.ts …`. Both forward flags verbatim.

> Don't use `npm run cn -- …`: npm intercepts the `--openapi`/`-o` flags. Use the bin launcher.
> (`npm link` once gives you a global `cn`.)

```bash
npm install
cn() { node packages/cli/bin/cn.mjs "$@"; }   # convenience shim
# secrets (e.g. a GitHub PAT) load from a gitignored .env — see .env.example:
#   CN_GITHUB_PAT=ghp_xxx     (so --github needs no --pat)

# ── Just give it an input: run the WHOLE pipeline by itself ──
# acquire → ingest → build → project; writes artifact.json, validated.json, ir.json, surfaces/ → ./out
cn run                                                # no flags → every input in cn.config.json
cn run --openapi ./fixtures/lumen/openapi/lumen.json
cn run --sdk ./fixtures/sdk-sample
cn run --mcp ./fixtures/mcp-sample/tools.json
# input flags are repeatable — run several at once, each into ./out/<label>/:
cn run --openapi a.yaml --sdk ./b --mcp c.json
# --ir does everything above AND collects each input's IR into out/ir/<label>.json:
cn run --ir

# ── …or drive the stages one at a time ──

# Acquire → canonical artifact
cn acquire --openapi ./fixtures/lumen/openapi/lumen.json

# Acquire + Adapt/Assemble/Validate/Repair → validated artifact (+ repair proposals)
cn ingest  --openapi ./fixtures/lumen/openapi/lumen.json

# Full chain → content-hashed IR (fails loud if the spec is invalid)
cn build   --openapi ./fixtures/lumen/openapi/lumen.json -o out/

# Render the IR into runnable surfaces under ./surfaces (or -o <dir>, --only sdk-typescript,mcp)
cn project --openapi ./fixtures/lumen/openapi/lumen.json
#   surfaces/sdk/typescript  (tsc-clean package)   surfaces/mcp   (runnable stdio server + tools.json)
#   surfaces/sdk/python      (py_compile-clean)     surfaces/cli   (runnable `lumen projects create …`)
#   surfaces/docs            (reference + examples)

# Every command works for every input:
cn project --github acme/api --pat "$GITHUB_TOKEN" --ref main --spec openapi/api.yaml
cn project --sdk ./fixtures/sdk-sample
cn project --mcp ./fixtures/mcp-sample/tools.json
```

The generated MCP server round-trips: `cn acquire --mcp "node surfaces/mcp/server.mjs" --command`
re-derives its tools. Generated SDKs/CLI read base URL + token from `CN_BASE_URL` / `CN_TOKEN`.

Run `cn <command> --help` for the full flag list. On Windows PowerShell call
`node packages/cli/bin/cn.mjs <command> …` directly.

## Develop

```bash
npm run typecheck   # tsc --noEmit across all packages
npm test            # vitest
```

## Boundaries

- OpenAPI bundling/parsing uses `@apidevtools/swagger-parser`; everything else is dependency-light.
- Swagger 2.0 is upgraded best-effort with diagnostics flagging uncertain conversions (a full
  converter is out of scope).
- Repair is deterministic/offline by design; an LLM drafter is a drop-in upgrade at the same seam.
- Projection derives config defaults from the IR (no config stage yet); generators are
  identifier/keyword/collision-safe and string-injection-hardened (see the `adversarial` fixture).
- Still **not** implemented (later stages of the doc): config draft/freeze, the escape-hatch
  override merge, host/register + the runtime call path, and the Part II DX layer (Spec Transforms,
  Preview Builds, Auto-Sync).
```

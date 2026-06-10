import { AlertTriangle } from 'lucide-react';
import { CopyButton } from '@/components/run/CopyButton';

function Cmd({ children }: { children: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
      <code className="min-w-0 overflow-x-auto whitespace-pre font-mono text-[13px] text-foreground">{children}</code>
      <CopyButton text={children} />
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 space-y-3">
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function Row({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-border py-2.5 last:border-0 sm:grid-cols-[180px_1fr] sm:gap-4">
      <code className="font-mono text-[13px] text-foreground">{name}</code>
      <span className="text-[13px] text-muted-foreground">{children}</span>
    </div>
  );
}

const TOC = [
  ['overview', 'Overview'],
  ['invoke', 'Invoking cn'],
  ['commands', 'Commands'],
  ['inputs', 'Inputs'],
  ['options', 'Options'],
  ['config', 'cn.config.json & .env'],
  ['examples', 'Examples'],
  ['guarantees', 'Guarantees'],
] as const;

export function CliDocs() {
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_180px]">
      <div className="min-w-0 space-y-10">
        <Section id="overview" title="Overview">
          <p className="text-sm leading-relaxed text-muted-foreground">
            <code className="font-mono text-foreground">cn</code> is the Connector Network CLI. A source climbs once to a
            content-hashed IR, which fans out into every surface:
          </p>
          <pre className="overflow-x-auto rounded-md border border-border bg-muted/30 px-3 py-3 font-mono text-[12px] leading-relaxed text-muted-foreground">
{`SourceRef ─acquire→ CanonicalArtifact ─ingest→ ValidatedArtifact ─build→ IR ─project→ surfaces
 (4 inputs)        (origin-blind, pinned)   (adapt·assemble·          (hashed)   SDK·MCP·CLI·docs
                                             validate·repair)`}
          </pre>
        </Section>

        <Section id="invoke" title="Invoking cn">
          <p className="text-sm text-muted-foreground">Run the bin launcher directly (it forwards flags verbatim):</p>
          <Cmd>node packages/cli/bin/cn.mjs &lt;command&gt; [options]</Cmd>
          <p className="text-sm text-muted-foreground">Or link it once for a global command:</p>
          <Cmd>npm link</Cmd>
          <div className="flex items-start gap-2 rounded-md border border-warning/25 bg-warning/5 px-3 py-2.5 text-[13px] text-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <span>
              Don’t use <code className="font-mono">npm run cn -- …</code> — npm v11 intercepts the{' '}
              <code className="font-mono">--flags</code>. Use the bin launcher above. In this Studio, the{' '}
              <span className="font-medium">Terminal</span> tab already runs it correctly.
            </span>
          </div>
        </Section>

        <Section id="commands" title="Commands">
          <div className="rounded-lg border border-border px-4 py-1">
            <Row name="cn run">Everything at once: acquire → ingest → build → project. Takes one or many inputs (flags are repeatable) → ./out.</Row>
            <Row name="cn acquire">Fetch + pin a source into one origin-blind canonical artifact.</Row>
            <Row name="cn ingest">Acquire, then adapt → assemble → validate + repair → a validated artifact (+ repair proposals).</Row>
            <Row name="cn build">Acquire + ingest, then build the normalized, content-hashed IR (fails loud if invalid).</Row>
            <Row name="cn project">Build the IR, then render it into surfaces (SDK · MCP · CLI · docs) under ./surfaces.</Row>
            <Row name="cn help · cn version">Print usage / the version.</Row>
          </div>
        </Section>

        <Section id="inputs" title="Inputs">
          <p className="text-sm text-muted-foreground">Every command takes the same inputs. For <code className="font-mono">cn run</code> they’re repeatable.</p>
          <div className="rounded-lg border border-border px-4 py-1">
            <Row name="--github <owner/repo>">A GitHub repo (needs a PAT). Pin with <code className="font-mono">--ref</code>; locate the spec with <code className="font-mono">--spec</code>.</Row>
            <Row name="--openapi <path|url>">An OpenAPI document — a local file or an http(s) URL.</Row>
            <Row name="--sdk <path>">An existing SDK directory (reverse-derived; lower trust).</Row>
            <Row name="--mcp <path|url>">An MCP server: a tools manifest, or a stdio command with <code className="font-mono">--command</code>.</Row>
          </div>
        </Section>

        <Section id="options" title="Options">
          <div className="rounded-lg border border-border px-4 py-1">
            <Row name="--pat <token>">GitHub PAT; or env <code className="font-mono">CN_GITHUB_PAT</code> / <code className="font-mono">GITHUB_TOKEN</code> / <code className="font-mono">GH_TOKEN</code>.</Row>
            <Row name="--ref <branch|tag|sha>">Revision to pin (default: repo default branch).</Row>
            <Row name="--spec <path>">Path to the spec within the repo (auto-detected otherwise).</Row>
            <Row name="--lang <typescript|python>">Force SDK language (otherwise detected).</Row>
            <Row name="--command">Treat the <code className="font-mono">--mcp</code> value as a stdio server command.</Row>
            <Row name="--only <kinds>">Comma list of surfaces: sdk-typescript, sdk-python, mcp, cli, docs.</Row>
            <Row name="--ir">(run) Also store each input’s IR in <code className="font-mono">&lt;out&gt;/ir/&lt;label&gt;.json</code>.</Row>
            <Row name="-o, --out <dir>">Output directory (run/project) or file (acquire/ingest/build).</Row>
            <Row name="--quiet">Suppress progress + summary on stderr.</Row>
          </div>
        </Section>

        <Section id="config" title="cn.config.json & .env">
          <p className="text-sm text-muted-foreground">
            Run <code className="font-mono">cn run</code> with no input flags to use every input listed in a{' '}
            <code className="font-mono">cn.config.json</code> at the repo root:
          </p>
          <pre className="overflow-x-auto rounded-md border border-border bg-muted/30 px-3 py-3 font-mono text-[12px] leading-relaxed text-muted-foreground">
{`{
  "out": "out",
  "inputs": [
    { "openapi": "samples/openapi/tasks-api.yaml" },
    { "github": "DCode-v05/Test", "ref": "main" },
    { "sdk": "samples/sdk-typescript" },
    { "mcp": "samples/mcp/tasks-tools.json" }
  ]
}`}
          </pre>
          <p className="text-sm text-muted-foreground">
            Secrets load from a gitignored <code className="font-mono">.env</code> in the working directory — so{' '}
            <code className="font-mono">--github</code> needs no <code className="font-mono">--pat</code>:
          </p>
          <Cmd>CN_GITHUB_PAT=ghp_xxxxxxxxxxxx</Cmd>
        </Section>

        <Section id="examples" title="Examples">
          <div className="space-y-2">
            <Cmd>cn run --openapi samples/openapi/tasks-api.yaml</Cmd>
            <Cmd>cn run --openapi a.yaml --sdk ./b --mcp c.json</Cmd>
            <Cmd>cn run --ir</Cmd>
            <Cmd>cn project --github DCode-v05/Test --ref main --only sdk-typescript,mcp</Cmd>
            <Cmd>cn build --mcp samples/mcp/tasks-tools.json -o out/</Cmd>
            <Cmd>cn acquire --mcp "node surfaces/mcp/server.mjs" --command</Cmd>
          </div>
        </Section>

        <Section id="guarantees" title="Guarantees">
          <ul className="space-y-2 text-[13px] text-muted-foreground">
            <li><span className="font-medium text-foreground">Origin-blind:</span> no repo paths/URLs survive into the document; origin is kept for audit only.</li>
            <li><span className="font-medium text-foreground">Deterministic pins:</span> artifact and IR hashes are sha256 over canonical content, excluding timestamps — same source ⇒ same hash.</li>
            <li><span className="font-medium text-foreground">Stable operation IDs:</span> derived from identity (operationId or method+path), not file position.</li>
            <li><span className="font-medium text-foreground">Bad specs fail loud:</span> validation errors block <code className="font-mono">build</code>/<code className="font-mono">project</code>.</li>
            <li><span className="font-medium text-foreground">Repair never mutates:</span> proposals are drafted for a human to freeze — never applied.</li>
          </ul>
        </Section>
      </div>

      <nav className="hidden lg:block">
        <div className="sticky top-20 space-y-1">
          <div className="pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">On this page</div>
          {TOC.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="block rounded-md px-2 py-1 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              {label}
            </a>
          ))}
        </div>
      </nav>
    </div>
  );
}

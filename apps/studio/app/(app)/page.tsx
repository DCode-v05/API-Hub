import Link from 'next/link';
import { ArrowRight, Binary, DownloadCloud, Share2, Sparkles, Wand2 } from 'lucide-react';
import { INPUT_ITEMS, TOOL_ITEMS } from '@/components/app/nav';
import { requireUser } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

const STAGES = [
  { name: 'Acquire', sub: 'fetch · pin · bundle', Icon: DownloadCloud },
  { name: 'Ingest', sub: 'adapt · validate · repair', Icon: Wand2 },
  { name: 'Build IR', sub: 'content-hashed', Icon: Binary },
  { name: 'Project', sub: 'SDK · MCP · CLI · docs', Icon: Share2 },
];

export default async function HomePage() {
  const user = await requireUser();
  const firstName = user.name.split(' ')[0] || 'there';

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      {/* Hero */}
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="bg-grid border-b border-border px-7 py-10 sm:px-10 sm:py-12">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-2.5 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            Welcome back, {firstName}
          </div>
          <h1 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Turn any API source into an SDK, an MCP server, a CLI, and docs.
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
            Point the Studio at a GitHub repo, an OpenAPI spec, an existing SDK, or an MCP server. Watch it climb to one
            content-hashed IR and fan out into every surface — live.
          </p>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <Link
              href="/openapi"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
            >
              Start with OpenAPI
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/cli"
              className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Open the CLI
            </Link>
          </div>
        </div>

        {/* Stage strip */}
        <div className="flex flex-wrap items-center gap-y-3 px-7 py-5 sm:px-10">
          {STAGES.map((s, i) => (
            <div key={s.name} className="flex items-center">
              <div className="flex items-center gap-2.5 rounded-md border border-border bg-muted/30 px-3 py-2">
                <s.Icon className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="text-[13px] font-semibold leading-none">{s.name}</div>
                  <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{s.sub}</div>
                </div>
              </div>
              {i < STAGES.length - 1 ? <ArrowRight className="mx-2 h-4 w-4 shrink-0 text-muted-foreground" /> : null}
            </div>
          ))}
        </div>
      </section>

      {/* Input types */}
      <section className="mt-10">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold tracking-tight">Choose an input</h2>
          <span className="text-xs text-muted-foreground">
            <span className="text-success">●</span> declared · <span className="text-warning">●</span> inferred
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {INPUT_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group relative flex flex-col gap-3 rounded-xl border border-border bg-card p-5 transition-all hover:border-foreground/20 hover:shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted/40 text-foreground">
                  <item.Icon className="h-5 w-5" />
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    item.trust === 'declared'
                      ? 'border border-success/25 bg-success/10 text-success'
                      : 'border border-warning/25 bg-warning/10 text-warning'
                  }`}
                >
                  {item.trust}
                </span>
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-[15px] font-semibold">
                  {item.label}
                  <ArrowRight className="h-4 w-4 -translate-x-1 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{item.blurb}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Tools */}
      <section className="mt-8 mb-4">
        <h2 className="mb-3 text-sm font-semibold tracking-tight">Tools</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {TOOL_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group flex items-start gap-4 rounded-xl border border-border bg-card p-5 transition-all hover:border-foreground/20 hover:shadow-sm"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40 text-foreground">
                <item.Icon className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-[15px] font-semibold">
                  {item.label}
                  <ArrowRight className="h-4 w-4 -translate-x-1 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{item.blurb}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

import { Suspense } from 'react';
import type { Metadata } from 'next';
import { CliWorkspace } from '@/components/cli/CliWorkspace';

export const metadata: Metadata = { title: 'CLI' };

export default function CliPage() {
  // CliWorkspace reads ?cmd= via useSearchParams, which must be inside a Suspense boundary.
  return (
    <Suspense fallback={<div className="px-8 py-8 text-sm text-muted-foreground">Loading…</div>}>
      <CliWorkspace />
    </Suspense>
  );
}

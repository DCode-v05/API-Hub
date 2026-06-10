import { Suspense } from 'react';
import type { Metadata } from 'next';
import { HistoryWorkspace } from '@/components/history/HistoryWorkspace';

export const metadata: Metadata = { title: 'History' };

export default function HistoryPage() {
  return (
    <Suspense fallback={<div className="px-8 py-8 text-sm text-muted-foreground">Loading…</div>}>
      <HistoryWorkspace />
    </Suspense>
  );
}

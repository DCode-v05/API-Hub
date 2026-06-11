import { Suspense } from 'react';
import type { Metadata } from 'next';
import { OpenApiWorkspace } from '@/components/input/OpenApiWorkspace';

export const metadata: Metadata = { title: 'OpenAPI' };

export default function OpenApiPage() {
  return (
    <Suspense fallback={null}>
      <OpenApiWorkspace />
    </Suspense>
  );
}

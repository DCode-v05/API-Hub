import { Suspense } from 'react';
import type { Metadata } from 'next';
import { SdkWorkspace } from '@/components/input/SdkWorkspace';

export const metadata: Metadata = { title: 'SDK' };

export default function SdkPage() {
  return (
    <Suspense fallback={null}>
      <SdkWorkspace />
    </Suspense>
  );
}

import { Suspense } from 'react';
import type { Metadata } from 'next';
import { GithubWorkspace } from '@/components/input/GithubWorkspace';

export const metadata: Metadata = { title: 'GitHub' };

export default function GithubPage() {
  return (
    <Suspense fallback={null}>
      <GithubWorkspace />
    </Suspense>
  );
}

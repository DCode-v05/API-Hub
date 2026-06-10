import type { Metadata } from 'next';
import { GithubWorkspace } from '@/components/input/GithubWorkspace';

export const metadata: Metadata = { title: 'GitHub' };

export default function GithubPage() {
  return <GithubWorkspace />;
}

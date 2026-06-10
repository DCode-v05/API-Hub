import type { Metadata } from 'next';
import { SdkWorkspace } from '@/components/input/SdkWorkspace';

export const metadata: Metadata = { title: 'SDK' };

export default function SdkPage() {
  return <SdkWorkspace />;
}

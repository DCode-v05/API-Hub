import type { Metadata } from 'next';
import { OpenApiWorkspace } from '@/components/input/OpenApiWorkspace';

export const metadata: Metadata = { title: 'OpenAPI' };

export default function OpenApiPage() {
  return <OpenApiWorkspace />;
}

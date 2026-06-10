import type { Metadata } from 'next';
import { McpWorkspace } from '@/components/input/McpWorkspace';

export const metadata: Metadata = { title: 'MCP' };

export default function McpPage() {
  return <McpWorkspace />;
}

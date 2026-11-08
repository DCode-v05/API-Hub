import type { SourceRef } from '@cn/contracts';
import type { RunEvent } from '../events';
import { executePipeline } from './pipeline';

export async function runPipeline(source: SourceRef, emit: (e: RunEvent) => void, signal?: AbortSignal): Promise<void> {
  await executePipeline(source, { emit, signal, stagger: true });
}

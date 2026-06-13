import type { SourceRef } from '@cn/contracts';
import type { RunEvent } from '../events';
import { executePipeline } from './pipeline';

/**
 * Run the full pipeline in-process, emitting an event per stage so the browser can render it live.
 * Thin wrapper over the shared `executePipeline` orchestrator (lib/cn/pipeline.ts); the cosmetic
 * inter-stage stagger that makes the flow legible lives here, in the streaming path only.
 */
export async function runPipeline(source: SourceRef, emit: (e: RunEvent) => void, signal?: AbortSignal): Promise<void> {
  await executePipeline(source, { emit, signal, stagger: true });
}

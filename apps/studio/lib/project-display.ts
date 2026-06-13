import { type ComponentType } from 'react';
import { FileJson, Github, Package, Plug } from 'lucide-react';
import type { RunRequest, StageSourceKind } from './events';
import type { DiffSummary, ProjectStatus } from './records';

/** Shared presentation helpers for the Projects UI (dashboard, detail, sidebar). */

type Icon = ComponentType<{ className?: string }>;

export const KIND_ICON: Record<StageSourceKind, Icon> = {
  github: Github,
  openapi: FileJson,
  sdk: Package,
  mcp: Plug,
};

export const KIND_LABEL: Record<StageSourceKind, string> = {
  github: 'GitHub',
  openapi: 'OpenAPI',
  sdk: 'SDK',
  mcp: 'MCP',
};

/** A short, human source descriptor for a saved project's input. */
export function describeRequest(req: RunRequest): string {
  switch (req.kind) {
    case 'github':
      return req.ref ? `${req.repo ?? ''} @ ${req.ref}` : req.repo ?? '';
    case 'openapi':
      return req.openapiUrl || req.openapiPath || 'inline spec';
    case 'sdk':
      return req.sdkPath ?? '';
    case 'mcp':
      return req.mcpUrl || req.mcpPath || req.mcpCommand || 'inline manifest';
    default:
      return '';
  }
}

/** Compact watch-interval label, e.g. "15m", "1h", "1d". */
export function formatInterval(sec: number): string {
  if (sec % 86400 === 0) return `${sec / 86400}d`;
  if (sec % 3600 === 0) return `${sec / 3600}h`;
  return `${Math.max(1, Math.round(sec / 60))}m`;
}

export type Tone = 'muted' | 'success' | 'danger' | 'warning' | 'accent';

export function statusMeta(status: ProjectStatus): { label: string; tone: Tone } {
  switch (status) {
    case 'changed':
      return { label: 'Updated', tone: 'success' };
    case 'unchanged':
      return { label: 'Up to date', tone: 'muted' };
    case 'ok':
      return { label: 'Synced', tone: 'success' };
    case 'error':
      return { label: 'Error', tone: 'danger' };
    default:
      return { label: 'Not synced yet', tone: 'muted' };
  }
}

export function severityTone(severity: DiffSummary['severity']): Tone {
  switch (severity) {
    case 'breaking':
      return 'danger';
    case 'minor':
      return 'accent';
    case 'initial':
      return 'success';
    default:
      return 'muted';
  }
}

export function severityLabel(severity: DiffSummary['severity']): string {
  switch (severity) {
    case 'breaking':
      return 'Breaking';
    case 'minor':
      return 'Minor';
    case 'initial':
      return 'Initial';
    default:
      return 'No change';
  }
}

export const WATCH_INTERVALS: { value: number; label: string }[] = [
  { value: 300, label: 'Every 5 minutes' },
  { value: 900, label: 'Every 15 minutes' },
  { value: 1800, label: 'Every 30 minutes' },
  { value: 3600, label: 'Every hour' },
  { value: 21600, label: 'Every 6 hours' },
  { value: 86400, label: 'Every day' },
];

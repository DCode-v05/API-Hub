import type { RunEvent, RunRequest, StageSourceKind } from './events';

export interface UserDTO {
  id: string;
  email: string;
  name: string;
}

export interface PatDTO {
  id: string;
  name: string;
  last4: string;
  createdAt: string;
}

export interface PresetRecord {
  id: string;
  userId: string;
  kind: StageSourceKind;
  name: string;
  request: RunRequest;
  createdAt: string;
}

export type ProjectStatus = 'pending' | 'ok' | 'unchanged' | 'changed' | 'error';
export type ProjectTrigger = 'initial' | 'manual' | 'watch';

export interface ProjectRecord {
  id: string;
  userId: string;
  name: string;
  kind: StageSourceKind;
  request: RunRequest;
  patId: string | null;
  watchEnabled: boolean;
  watchIntervalSec: number;
  latestVersion: number;
  latestIrHash: string;
  latestContentHash: string;
  latestSha: string | null;
  lastCheckedAt: string | null;
  lastStatus: ProjectStatus;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DiffSummary {
  opsAdded: string[];
  opsRemoved: string[];
  opsChanged: string[];
  fileDelta: number;
  opDelta: number;
  severity: 'initial' | 'none' | 'minor' | 'breaking';
  note: string;
}

export interface ProjectVersionMeta {
  id: string;
  projectId: string;
  version: number;
  irHash: string;
  contentHash: string;
  sha: string | null;
  ok: boolean;
  valid: boolean;
  opCount: number;
  fileCount: number;
  errorCount: number;
  warningCount: number;
  trigger: ProjectTrigger;
  summary: DiffSummary;
  createdAt: string;
}

export type CheckOutcome =
  | { status: 'unchanged'; contentHash: string }
  | { status: 'changed'; version: ProjectVersionMeta }
  | { status: 'error'; message: string };

export type ProjectSyncEvent = RunEvent | { t: 'version'; outcome: CheckOutcome };

export interface RunMeta {
  id: string;
  userId: string;
  kind: StageSourceKind;
  label: string;
  describe: string;
  ok: boolean;
  valid: boolean;
  totalMs: number;
  opCount: number;
  irHash: string;
  fileCount: number;
  errorCount: number;
  warningCount: number;
  proposalCount: number;
  testsPassed?: number;
  testsFailed?: number;
  createdAt: string;
}

export type DeploymentStatus = 'starting' | 'running' | 'stopped' | 'failed';

export interface DeploymentRecord {
  id: string;
  projectId: string;
  userId: string;
  version: number;
  surfaceKind: 'mcp' | 'cli';
  status: DeploymentStatus;
  port: number | null;
  pid: number | null;
  baseUrl: string | null;
  error: string | null;
  endpoint: string | null;
  startedAt: string | null;
  stoppedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HostConfig {
  baseUrl: string;
  hasToken: boolean;
}

export type PublishRegistry = 'npm' | 'pypi';
export type PublishStatus = 'pending' | 'published' | 'failed';

export interface PublishRecord {
  id: string;
  projectId: string;
  userId: string;
  version: number;
  surfaceKind: 'sdk-typescript' | 'sdk-python';
  registry: PublishRegistry;
  packageName: string;
  publishedVersion: string;
  status: PublishStatus;
  url: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RegistryStatus {
  npm: { configured: boolean; scope: string };
  pypi: { configured: boolean; prefix: string; tooling: boolean };
}

export type PublishEvent =
  | { t: 'log'; line: string }
  | { t: 'step'; name: string }
  | { t: 'published'; publishedVersion: string; url: string; packageName: string }
  | { t: 'error'; message: string };

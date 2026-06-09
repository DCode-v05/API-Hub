export { project, type ProjectOptions } from './service';
export { planProjection, type ProjectionPlan, type PlanOptions } from './plan';
export { generateTypeScriptSdk } from './sdk-typescript';
export { generatePythonSdk } from './sdk-python';
export { generateMcpServer } from './mcp';
export { generateCli } from './cli';
export { generateDocs } from './docs';

export type { Surface, SurfaceKind, GeneratedFile, Projection, Ir } from '@cn/contracts';

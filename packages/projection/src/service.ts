import type { Diagnostic, Ir, Projection, Surface, SurfaceKind } from '@cn/contracts';
import { note } from '@cn/contracts';
import { planProjection, type PlanOptions } from './plan';
import { generateTypeScriptSdk } from './sdk-typescript';
import { generatePythonSdk } from './sdk-python';
import { generateMcpServer } from './mcp';
import { generateCli } from './cli';
import { generateDocs } from './docs';

export interface ProjectOptions extends PlanOptions {
  /** Restrict which surfaces to emit (default: all). */
  only?: SurfaceKind[];
}

/**
 * Project one IR into the four surfaces (SDK split by language). Every surface derives from the
 * same IR, so they cannot drift — a spec change updates the IR once and all surfaces re-render.
 */
export function project(ir: Ir, options: ProjectOptions = {}): Projection {
  const plan = planProjection(ir, options);
  const diagnostics: Diagnostic[] = [];

  const all: Surface[] = [
    { kind: 'sdk-typescript', dir: 'sdk/typescript', files: generateTypeScriptSdk(plan) },
    { kind: 'sdk-python', dir: 'sdk/python', files: generatePythonSdk(plan) },
    { kind: 'mcp', dir: 'mcp', files: generateMcpServer(plan) },
    { kind: 'cli', dir: 'cli', files: generateCli(plan) },
    { kind: 'docs', dir: 'docs', files: generateDocs(plan) },
  ];

  const surfaces = options.only ? all.filter((s) => options.only!.includes(s.kind)) : all;

  if (plan.server === '') {
    diagnostics.push(
      note('proj.no_server', 'no server URL in the IR; generated surfaces default baseUrl is empty (set it at runtime)'),
    );
  }
  if (plan.ir.operations.length === 0) {
    diagnostics.push(note('proj.no_operations', 'IR has no operations; surfaces will be empty shells'));
  }

  return { surfaces, diagnostics };
}

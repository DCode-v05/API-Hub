import type { Ir, IrFieldLocation, IrOperation } from '@cn/contracts';
import { kebab, methodNamesFor, pascal, pascalIdent, snake, toolName, words } from './naming';
import { schemaFields, type ModelField } from './typemap';
import { paramsTypeName } from './gen-util';
import { safeLeading, uniquify } from './idents';

export interface PlannedParam {
  name: string;
  in: IrFieldLocation;
  type: string;
  ref?: string;
  required: boolean;
  description?: string;
}

export interface PlannedOp {
  id: string;
  httpMethod: string;
  path: string;
  /** SDK/CLI verb, e.g. "create". */
  methodName: string;
  /** Deduplicated TS params interface name, e.g. "CreateProjectParams". */
  paramsType: string;
  /** MCP tool name, e.g. "create_project". */
  tool: string;
  summary?: string;
  description?: string;
  auth: string;
  params: PlannedParam[];
  pathParams: PlannedParam[];
  queryParams: PlannedParam[];
  headerParams: PlannedParam[];
  bodyParams: PlannedParam[];
  /** Success (2xx) return model name, if any. */
  returnRef?: string;
  successStatus?: string;
}

export interface PlannedResource {
  /** Raw IR resource name. */
  name: string;
  /** SDK accessor, e.g. client.<prop>. */
  prop: string;
  /** PascalCase class base, e.g. Projects → ProjectsResource. */
  className: string;
  /** CLI command word, e.g. "projects". */
  command: string;
  ops: PlannedOp[];
}

export interface PlannedModel {
  name: string;
  className: string;
  fields: ModelField[];
}

export interface ProjectionPlan {
  ir: Ir;
  title: string;
  apiVersion: string;
  server: string;
  /** kebab API slug, e.g. "lumen-api". */
  slug: string;
  /** SDK/CLI package base name. */
  packageName: string;
  /** Python distribution + importable module names. */
  pyDist: string;
  pyModule: string;
  /** CLI binary name, e.g. "lumen". */
  binName: string;
  /** Default auth scheme across operations. */
  auth: string;
  resources: PlannedResource[];
  models: PlannedModel[];
  /** Raw schema name → deduplicated generated class/interface name (for $ref resolution). */
  modelClassByName: Map<string, string>;
}

export interface PlanOptions {
  packageName?: string;
  binName?: string;
}

export function planProjection(ir: Ir, options: PlanOptions = {}): ProjectionPlan {
  const slug = kebab(ir.title) || 'api';
  const binName = safeLeading(options.binName ?? kebab(words(ir.title)[0] ?? 'api'), 'api-');
  const packageName = options.packageName ?? `${slug}-sdk`;
  const pyDist = `${slug}-sdk`;
  const pyModule = safeLeading(snake(`${ir.title} sdk`) || 'api_sdk', 'api_');

  const byResource = new Map<string, IrOperation[]>();
  for (const op of ir.operations) {
    const list = byResource.get(op.resource) ?? [];
    list.push(op);
    byResource.set(op.resource, list);
  }

  const resources: PlannedResource[] = [];
  for (const [name, ops] of [...byResource.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const methodNames = methodNamesFor(name, ops);
    const planned = ops
      .map((op) => planOp(op, methodNames.get(op.id) ?? 'call'))
      .sort((a, b) => a.methodName.localeCompare(b.methodName));
    resources.push({
      name,
      prop: camelProp(name),
      className: `${pascal(name)}Resource`,
      command: kebab(name),
      ops: planned,
    });
  }

  const models: PlannedModel[] = Object.entries(ir.schemas)
    .map(([name, schema]) => ({ name, className: pascal(name), fields: schemaFields(schema) }))
    .sort((a, b) => a.className.localeCompare(b.className));

  const auth = ir.operations.find((o) => o.auth && o.auth !== 'none')?.auth ?? 'none';

  // Deduplicate generated names so distinct schemas/resources that PascalCase-collide don't
  // produce duplicate definitions (TS2300 / silent Python shadowing) or duplicate file paths.
  const usedResource = new Set<string>();
  for (const res of resources) {
    const baseClass = `${pascalIdent(res.name)}Resource`;
    const finalClass = uniquify(baseClass, usedResource);
    const suffix = finalClass.slice(baseClass.length);
    res.className = finalClass;
    res.prop = camelProp(res.name) + suffix;
    res.command = kebab(res.name) + (suffix ? `-${suffix}` : '');
  }

  const usedTypes = new Set<string>();
  const modelClassByName = new Map<string, string>();
  for (const model of models) {
    model.className = uniquify(pascalIdent(model.name), usedTypes);
    modelClassByName.set(model.name, model.className);
  }
  for (const res of resources) {
    for (const op of res.ops) {
      if (op.params.length > 0) op.paramsType = uniquify(op.paramsType, usedTypes);
    }
  }

  return {
    ir,
    title: ir.title,
    apiVersion: ir.apiVersion,
    server: ir.servers[0] ?? '',
    slug,
    packageName,
    pyDist,
    pyModule,
    binName,
    auth,
    resources,
    models,
    modelClassByName,
  };
}

function planOp(op: IrOperation, methodName: string): PlannedOp {
  const params: PlannedParam[] = op.input.map((f) => {
    const p: PlannedParam = { name: f.name, in: f.in, type: f.type, required: f.required };
    if (f.ref) p.ref = f.ref;
    if (f.description) p.description = f.description;
    return p;
  });
  const success = op.output.find((o) => o.status.startsWith('2')) ?? op.output[0];
  const result: PlannedOp = {
    id: op.id,
    httpMethod: op.method.toUpperCase(),
    path: op.path,
    methodName,
    paramsType: paramsTypeName(op.id),
    tool: toolName(op),
    auth: op.auth,
    params,
    pathParams: params.filter((p) => p.in === 'path'),
    queryParams: params.filter((p) => p.in === 'query'),
    headerParams: params.filter((p) => p.in === 'header'),
    bodyParams: params.filter((p) => p.in === 'body'),
  };
  if (op.summary) result.summary = op.summary;
  if (op.description) result.description = op.description;
  if (success?.ref) result.returnRef = success.ref;
  if (success?.status) result.successStatus = success.status;
  return result;
}

function camelProp(name: string): string {
  const w = words(name);
  return w.map((x, i) => (i === 0 ? x : x.charAt(0).toUpperCase() + x.slice(1))).join('') || 'resource';
}

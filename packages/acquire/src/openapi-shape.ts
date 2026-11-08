import type { Diagnostic, OpenApiDocument } from '@cn/contracts';
import { note, warn } from '@cn/contracts';
import { collectExternalRefs } from './refs';

export function emptyOpenApiDoc(title = 'untitled', version = '0.0.0'): OpenApiDocument {
  return { openapi: '3.1.0', info: { title, version }, paths: {} };
}

export interface DerivedOperation {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  method?: string;
  path?: string;
}

export function buildOpenApiFromOperations(args: {
  title: string;
  version: string;
  source: 'sdk' | 'mcp';
  ops: DerivedOperation[];
}): { document: OpenApiDocument; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const paths: Record<string, unknown> = {};
  const componentSchemas: Record<string, unknown> = {};

  for (const op of args.ops) {
    const method = (op.method ?? 'post').toLowerCase();
    const routePath = op.path ?? `/${op.name}`;
    const operation: Record<string, unknown> = {
      operationId: op.name,
      'x-cn-derived': true,
    };
    if (op.description) operation['summary'] = op.description;
    if (op.inputSchema) {
      operation['requestBody'] = {
        required: true,
        content: { 'application/json': { schema: liftDefs(op.inputSchema, componentSchemas) } },
      };
    }
    operation['responses'] = {
      '200': {
        description: 'derived response',
        ...(op.outputSchema
          ? { content: { 'application/json': { schema: liftDefs(op.outputSchema, componentSchemas) } } }
          : {}),
      },
    };

    const bucket = (paths[routePath] as Record<string, unknown> | undefined) ?? {};
    if (bucket[method]) {
      diagnostics.push(
        note(
          'acq.shape.path_collision',
          `two operations map to ${method.toUpperCase()} ${routePath}; the later one wins`,
        ),
      );
    }
    bucket[method] = operation;
    paths[routePath] = bucket;
  }

  const document: OpenApiDocument = {
    openapi: '3.1.0',
    info: {
      title: args.title,
      version: args.version,
      'x-cn-note': `reverse-derived from ${args.source}; paths and verbs are synthesized`,
    },
    paths,
    'x-cn-source': args.source,
    'x-cn-trust': 'inferred',
  };
  if (Object.keys(componentSchemas).length > 0) {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(componentSchemas).sort()) sorted[k] = componentSchemas[k];
    document.components = { schemas: sorted };
  }

  for (const ref of collectExternalRefs(document)) {
    diagnostics.push(
      warn(
        'acq.shape.external_ref_remains',
        `reverse-derived schema carries an external $ref (artifact is not self-contained): ${ref}`,
      ),
    );
  }

  return { document, diagnostics };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function liftDefs(schema: Record<string, unknown>, into: Record<string, unknown>): Record<string, unknown> {
  return rewrite(schema, into) as Record<string, unknown>;
}

function rewrite(node: unknown, into: Record<string, unknown>): unknown {
  if (Array.isArray(node)) return node.map((n) => rewrite(n, into));
  if (isObject(node)) {
    const defs = node['$defs'];
    if (isObject(defs)) {
      for (const [name, def] of Object.entries(defs)) {
        if (!(name in into)) into[name] = rewrite(def, into);
      }
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === '$defs') continue;
      if (k === '$ref' && typeof v === 'string' && v.startsWith('#/$defs/')) {
        out[k] = '#/components/schemas/' + v.slice('#/$defs/'.length);
      } else {
        out[k] = rewrite(v, into);
      }
    }
    return out;
  }
  return node;
}

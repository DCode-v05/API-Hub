import type { Diagnostic, OpenApiDocument } from '@cn/contracts';
import { note, warn } from '@cn/contracts';
import { collectExternalRefs } from './refs';

export function emptyOpenApiDoc(title = 'untitled', version = '0.0.0'): OpenApiDocument {
  return { openapi: '3.1.0', info: { title, version }, paths: {} };
}

/** A single operation reverse-derived from an SDK method or an MCP tool. */
export interface DerivedOperation {
  /** Logical name (sdk method / mcp tool). Becomes the operationId. */
  name: string;
  description?: string;
  /** JSON Schema for the input (mcp inputSchema, or an object of sdk params). */
  inputSchema?: Record<string, unknown>;
  /** JSON Schema for the output, when known. */
  outputSchema?: Record<string, unknown>;
  /** Best-effort HTTP verb; defaults to POST since SDK/MCP rarely declare one. */
  method?: string;
  /** Best-effort path; defaults to "/<name>". */
  path?: string;
}

/**
 * Build an OpenAPI-3.1-shaped document from reverse-derived operations. SDK methods and MCP
 * tools rarely declare REST verbs/paths, so we synthesize stable ones (POST /<name>) and mark
 * the whole document inferred — the doc's "lower trust signal" for reverse-derived inputs.
 */
export function buildOpenApiFromOperations(args: {
  title: string;
  version: string;
  source: 'sdk' | 'mcp';
  ops: DerivedOperation[];
}): { document: OpenApiDocument; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const paths: Record<string, unknown> = {};

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
        content: { 'application/json': { schema: op.inputSchema } },
      };
    }
    operation['responses'] = {
      '200': {
        description: 'derived response',
        ...(op.outputSchema
          ? { content: { 'application/json': { schema: op.outputSchema } } }
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

  // Reverse-derived schemas (mcp inputSchema / sdk types) are copied verbatim and never went
  // through the OpenAPI bundler, so enforce origin-blindness here too: a tool/param schema that
  // carries an external $ref would make the artifact non-self-contained.
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

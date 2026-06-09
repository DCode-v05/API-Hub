import type { Diagnostic, OpenApiDocument } from '@cn/contracts';
import { error, note, warn } from '@cn/contracts';
import { collectExternalRefs, isHttpMethod, isObject, walkNodes } from './util';

const MAX_GRAPH_DEPTH = 2000;

export interface AssembleResult {
  document: OpenApiDocument;
  diagnostics: Diagnostic[];
}

/**
 * Assemble removes the STRUCTURE axis: produce one self-contained document. External refs were
 * bundled at acquisition, so here we (a) merge multiple specs under one namespace with collision
 * detection, (b) re-assert self-containment, and (c) note circular schema refs (kept as internal
 * refs — naturally finite, no infinite expansion).
 */
export function assemble(documents: OpenApiDocument[]): AssembleResult {
  const diagnostics: Diagnostic[] = [];
  if (documents.length === 0) {
    diagnostics.push(error('ing.assemble.no_input', 'no documents to assemble'));
    return {
      document: { openapi: '3.1.0', info: { title: 'untitled', version: '0.0.0' }, paths: {} },
      diagnostics,
    };
  }

  const document =
    documents.length === 1
      ? (structuredClone(documents[0]!) as OpenApiDocument)
      : mergeDocuments(documents, diagnostics);

  for (const ref of collectExternalRefs(document)) {
    diagnostics.push(
      warn('ing.assemble.external_ref', `document is not self-contained; external $ref remains: ${ref}`),
    );
  }
  noteCircularRefs(document, diagnostics);
  return { document, diagnostics };
}

function schemasOf(doc: Record<string, unknown>): Record<string, unknown> {
  const components = isObject(doc['components']) ? doc['components'] : {};
  return isObject(components['schemas']) ? (components['schemas'] as Record<string, unknown>) : {};
}

function mergeDocuments(documents: OpenApiDocument[], diagnostics: Diagnostic[]): OpenApiDocument {
  const base = structuredClone(documents[0]!) as Record<string, unknown>;
  if (!isObject(base['paths'])) base['paths'] = {};
  if (!isObject(base['components'])) base['components'] = {};
  const baseComponents = base['components'] as Record<string, unknown>;
  if (!isObject(baseComponents['schemas'])) baseComponents['schemas'] = {};
  const basePaths = base['paths'] as Record<string, unknown>;
  const baseSchemas = baseComponents['schemas'] as Record<string, unknown>;

  for (let i = 1; i < documents.length; i++) {
    const doc = structuredClone(documents[i]!) as Record<string, unknown>;
    const ns = slug(titleOf(doc) ?? `source${i}`);
    const schemas = schemasOf(doc);

    // Detect colliding (and genuinely different) schema names, rename them, rewrite refs in `doc`.
    const renames: Record<string, string> = {};
    for (const name of Object.keys(schemas)) {
      if (name in baseSchemas && !sameJson(baseSchemas[name], schemas[name])) {
        renames[name] = `${ns}_${name}`;
        diagnostics.push(
          note('ing.assemble.schema_renamed', `schema "${name}" collides; merged as "${ns}_${name}"`),
        );
      }
    }
    for (const [from, to] of Object.entries(renames)) {
      rewriteSchemaRef(doc, from, to);
    }
    const rewrittenSchemas = schemasOf(doc);
    for (const name of Object.keys(rewrittenSchemas)) {
      const finalName = renames[name] ?? name;
      if (!(finalName in baseSchemas)) baseSchemas[finalName] = rewrittenSchemas[name];
    }

    const paths = isObject(doc['paths']) ? doc['paths'] : {};
    for (const [path, item] of Object.entries(paths)) {
      const existing = basePaths[path];
      if (isObject(existing) && isObject(item)) {
        for (const [key, value] of Object.entries(item)) {
          if (!(key in existing)) {
            existing[key] = value;
          } else if (isHttpMethod(key)) {
            // Only a real operation (HTTP method) sharing a path is a true collision; path-level
            // keys like `parameters`/`summary` legally coexist — keep the base's and move on.
            diagnostics.push(
              error('ing.assemble.path_collision', `duplicate ${key.toUpperCase()} ${path} across merged specs`),
            );
          }
        }
      } else {
        basePaths[path] = item;
      }
    }
  }
  return base as OpenApiDocument;
}

function rewriteSchemaRef(node: unknown, from: string, to: string): void {
  const fromRef = `#/components/schemas/${from}`;
  const toRef = `#/components/schemas/${to}`;
  const visit = (n: unknown): void => {
    if (Array.isArray(n)) {
      for (const x of n) visit(x);
      return;
    }
    if (!isObject(n)) return;
    if (n['$ref'] === fromRef) n['$ref'] = toRef;
    for (const v of Object.values(n)) visit(v);
  };
  visit(node);
}

/** Note circular references among component schemas (they're kept as internal refs). */
function noteCircularRefs(document: OpenApiDocument, diagnostics: Diagnostic[]): void {
  const schemas = schemasOf(document as Record<string, unknown>);
  const edges = new Map<string, Set<string>>();
  for (const [name, schema] of Object.entries(schemas)) {
    const targets = new Set<string>();
    collectSchemaRefs(schema, targets);
    edges.set(name, targets);
  }
  const cyclic = new Set<string>();
  const state = new Map<string, number>(); // 0=visiting, 1=done
  let truncated = false;
  const dfs = (node: string, stack: string[]): void => {
    if (state.get(node) === 1) return;
    if (state.get(node) === 0) {
      for (const n of stack.slice(stack.indexOf(node))) cyclic.add(n);
      return;
    }
    if (stack.length >= MAX_GRAPH_DEPTH) {
      truncated = true;
      return;
    }
    state.set(node, 0);
    stack.push(node);
    for (const next of edges.get(node) ?? []) {
      if (edges.has(next)) dfs(next, stack);
    }
    stack.pop();
    state.set(node, 1);
  };
  for (const name of edges.keys()) dfs(name, []);
  if (truncated) {
    diagnostics.push(
      note('ing.assemble.graph_too_deep', `schema reference graph exceeds ${MAX_GRAPH_DEPTH} levels; cycle analysis truncated`),
    );
  }
  if (cyclic.size > 0) {
    diagnostics.push(
      note('ing.assemble.circular_refs', `circular schema refs kept as internal refs: ${[...cyclic].sort().join(', ')}`),
    );
  }
}

function collectSchemaRefs(node: unknown, out: Set<string>): void {
  walkNodes(node, (obj) => {
    const ref = obj['$ref'];
    if (typeof ref === 'string' && ref.startsWith('#/components/schemas/')) {
      out.add(ref.slice('#/components/schemas/'.length));
    }
  });
}

function titleOf(doc: Record<string, unknown>): string | undefined {
  const info = doc['info'];
  if (isObject(info) && typeof info['title'] === 'string') return info['title'];
  return undefined;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'source';
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

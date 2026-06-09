import type { Diagnostic, Ir, IrField, IrFieldLocation, IrOperation, IrOutput, ValidatedArtifact } from '@cn/contracts';
import { warn } from '@cn/contracts';
import { HTTP_METHODS, isObject, refName, resolvePointer, schemaType } from '@cn/ingest';
import { deriveOperationId, deriveResource } from './identity';
import { irHash } from './hash';

export const IR_VERSION = 'cn-ir/1';

/**
 * Build the normalized, content-hashed IR from a validated artifact. Because every input type was
 * normalized to one OpenAPI-3.1 shape upstream, this builder is uniform regardless of origin —
 * the same operation produces the same IR node whether it came from OpenAPI, GitHub, an SDK, or MCP.
 */
export function buildIr(validated: ValidatedArtifact): Ir {
  const doc = validated.document as unknown as Record<string, unknown>;
  const paths = isObject(doc['paths']) ? doc['paths'] : {};

  const operations: IrOperation[] = [];
  for (const [path, item] of Object.entries(paths)) {
    if (!isObject(item)) continue;
    const pathParams = Array.isArray(item['parameters']) ? item['parameters'] : [];
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!isObject(op)) continue;
      operations.push(buildOperation(doc, path, method, op, pathParams, validated));
    }
  }
  // Deterministic order, then disambiguate any synthesized-id collisions (distinct paths can
  // slugify to the same id). Two operations must never share an id, or diffs/overrides bound to it
  // become ambiguous.
  operations.sort(
    (a, b) => a.id.localeCompare(b.id) || a.method.localeCompare(b.method) || a.path.localeCompare(b.path),
  );
  const idDiagnostics = dedupeOperationIds(operations);

  const info = isObject(doc['info']) ? doc['info'] : {};
  // The hashed `core` carries provenance-free operations — provenance identifies the source, not
  // the IR content, so it must not affect the hash.
  const core = {
    irVersion: IR_VERSION,
    title: typeof info['title'] === 'string' ? info['title'] : 'untitled',
    apiVersion: typeof info['version'] === 'string' ? info['version'] : '0.0.0',
    servers: serverUrls(doc),
    operations,
    schemas: componentSchemas(doc),
  };
  const hash = irHash(core);

  const p = validated.provenance;
  const opProvenance = { ...(p.sha !== undefined ? { sha: p.sha } : {}), artifactHash: p.contentHash };

  return {
    ...core,
    operations: operations.map((op) => ({ ...op, provenance: opProvenance })),
    hash,
    provenance: {
      sourceKind: p.sourceKind,
      origin: p.origin,
      ...(p.sha !== undefined ? { sha: p.sha } : {}),
      artifactHash: p.contentHash,
      pinnedAt: p.pinnedAt,
      acquirer: p.acquirer,
    },
    diagnostics: [...validated.diagnostics, ...idDiagnostics],
  };
}

/** Ensure operation ids are unique; deterministically suffix collisions and report them. */
function dedupeOperationIds(operations: IrOperation[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const used = new Set<string>();
  for (const op of operations) {
    if (!used.has(op.id)) {
      used.add(op.id);
      continue;
    }
    const base = op.id;
    let n = 2;
    while (used.has(`${base}_${n}`)) n += 1;
    const next = `${base}_${n}`;
    diagnostics.push(
      warn('ir.duplicate_operation_id', `synthesized id collision: "${base}" → "${next}" (${op.method} ${op.path})`),
    );
    op.id = next;
    used.add(next);
  }
  return diagnostics;
}

function buildOperation(
  doc: Record<string, unknown>,
  path: string,
  method: string,
  op: Record<string, unknown>,
  pathParams: unknown[],
  validated: ValidatedArtifact,
): IrOperation {
  const result: IrOperation = {
    id: deriveOperationId(path, method, op),
    resource: deriveResource(path, op),
    method: method.toUpperCase(),
    path,
    input: buildInput(doc, op, pathParams),
    output: buildOutput(doc, op),
    auth: deriveAuth(doc, op),
    trust: validated.provenance.trust,
    sourceType: validated.type,
  };
  if (typeof op['summary'] === 'string') result.summary = op['summary'];
  if (typeof op['description'] === 'string') result.description = op['description'];
  return result;
}

function buildInput(doc: Record<string, unknown>, op: Record<string, unknown>, pathParams: unknown[]): IrField[] {
  const fields: IrField[] = [];
  const opParams = Array.isArray(op['parameters']) ? op['parameters'] : [];

  for (const raw of [...pathParams, ...opParams]) {
    const param = derefIfRef(doc, raw);
    if (!isObject(param) || typeof param['name'] !== 'string') continue;
    const location = param['in'];
    const field: IrField = {
      name: param['name'],
      type: schemaType(param['schema']),
      required: param['required'] === true || location === 'path',
      in: normalizeLocation(location),
    };
    if (typeof param['description'] === 'string') field.description = param['description'];
    const ref = isObject(param['schema']) ? param['schema']['$ref'] : undefined;
    if (typeof ref === 'string') field.ref = refName(ref);
    fields.push(field);
  }

  const bodySchema = resolveBodySchema(doc, op);
  if (isObject(bodySchema)) {
    const required = Array.isArray(bodySchema['required']) ? (bodySchema['required'] as unknown[]) : [];
    const requiredNames = new Set(required.filter((x): x is string => typeof x === 'string'));
    const properties = isObject(bodySchema['properties']) ? bodySchema['properties'] : {};
    for (const [name, schema] of Object.entries(properties)) {
      const field: IrField = {
        name,
        type: schemaType(schema),
        required: requiredNames.has(name),
        in: 'body',
      };
      const ref = isObject(schema) ? schema['$ref'] : undefined;
      if (typeof ref === 'string') field.ref = refName(ref);
      if (isObject(schema) && typeof schema['description'] === 'string') field.description = schema['description'];
      fields.push(field);
    }
  }
  return fields;
}

function buildOutput(doc: Record<string, unknown>, op: Record<string, unknown>): IrOutput[] {
  const responses = isObject(op['responses']) ? op['responses'] : {};
  const outputs: IrOutput[] = [];
  for (const status of Object.keys(responses).sort(byStatusPreference)) {
    const response = derefIfRef(doc, responses[status]);
    if (!isObject(response)) continue;
    const schema = responseSchema(response);
    const out: IrOutput = { status, type: schema !== undefined ? schemaType(schema) : 'none' };
    const ref = isObject(schema) ? schema['$ref'] : undefined;
    if (typeof ref === 'string') out.ref = refName(ref);
    if (typeof response['description'] === 'string') out.description = response['description'];
    outputs.push(out);
  }
  return outputs;
}

function deriveAuth(doc: Record<string, unknown>, op: Record<string, unknown>): string {
  const security = Array.isArray(op['security'])
    ? op['security']
    : Array.isArray(doc['security'])
      ? doc['security']
      : [];
  if (security.length === 0) return 'none';
  const first = security[0];
  if (!isObject(first)) return 'none';
  const schemeName = Object.keys(first)[0];
  if (schemeName === undefined) return 'none';

  const schemes = componentSecuritySchemes(doc);
  const scheme = schemes[schemeName];
  if (!isObject(scheme)) return schemeName;
  const type = scheme['type'];
  if (type === 'http') return typeof scheme['scheme'] === 'string' ? scheme['scheme'] : 'http';
  if (type === 'apiKey') return 'apiKey';
  if (type === 'oauth2') return 'oauth2';
  if (type === 'openIdConnect') return 'openIdConnect';
  return typeof type === 'string' ? type : 'none';
}

function resolveBodySchema(doc: Record<string, unknown>, op: Record<string, unknown>): unknown {
  const body = derefIfRef(doc, op['requestBody']);
  if (!isObject(body) || !isObject(body['content'])) return undefined;
  const content = body['content'] as Record<string, unknown>;
  const json = content['application/json'];
  const media = isObject(json) ? json : Object.values(content).find(isObject);
  if (!isObject(media)) return undefined;
  return derefIfRef(doc, media['schema']);
}

function responseSchema(response: Record<string, unknown>): unknown {
  if (!isObject(response['content'])) return undefined;
  const content = response['content'] as Record<string, unknown>;
  const json = content['application/json'];
  const media = isObject(json) ? json : Object.values(content).find(isObject);
  return isObject(media) ? media['schema'] : undefined;
}

function derefIfRef(doc: Record<string, unknown>, node: unknown): unknown {
  if (isObject(node) && typeof node['$ref'] === 'string') {
    const resolved = resolvePointer(doc, node['$ref']);
    return resolved === undefined ? node : resolved;
  }
  return node;
}

function normalizeLocation(loc: unknown): IrFieldLocation {
  if (loc === 'path' || loc === 'query' || loc === 'header' || loc === 'cookie') return loc;
  return 'query';
}

function byStatusPreference(a: string, b: string): number {
  const rank = (s: string): number => (s.startsWith('2') ? 0 : s === 'default' ? 2 : 1);
  const ra = rank(a);
  const rb = rank(b);
  return ra !== rb ? ra - rb : a.localeCompare(b);
}

function serverUrls(doc: Record<string, unknown>): string[] {
  const servers = doc['servers'];
  if (!Array.isArray(servers)) return [];
  const urls: string[] = [];
  for (const s of servers) {
    if (isObject(s) && typeof s['url'] === 'string') urls.push(s['url']);
  }
  return urls;
}

function componentSchemas(doc: Record<string, unknown>): Record<string, unknown> {
  const components = isObject(doc['components']) ? doc['components'] : {};
  return isObject(components['schemas']) ? (components['schemas'] as Record<string, unknown>) : {};
}

function componentSecuritySchemes(doc: Record<string, unknown>): Record<string, unknown> {
  const components = isObject(doc['components']) ? doc['components'] : {};
  return isObject(components['securitySchemes'])
    ? (components['securitySchemes'] as Record<string, unknown>)
    : {};
}

import type { Diagnostic, OpenApiDocument } from '@cn/contracts';
import { note, warn } from '@cn/contracts';
import { firstString, isHttpMethod, isObject, walkNodes } from './util';

export interface AdaptResult {
  document: OpenApiDocument;
  diagnostics: Diagnostic[];
}

/**
 * Adapt removes the FORMAT axis: collapse any inbound version onto the one OpenAPI-3.1 target
 * shape. Pragmatic coverage: 3.1 passes through, 3.0 is normalized (nullable → type arrays,
 * etc.), and Swagger 2.0 is upgraded best-effort with diagnostics flagging anything uncertain.
 */
export function adapt(input: OpenApiDocument): AdaptResult {
  const diagnostics: Diagnostic[] = [];
  let doc = structuredClone(input) as Record<string, unknown>;

  const swagger = doc['swagger'];
  if (typeof swagger === 'string' && swagger.startsWith('2')) {
    doc = upgradeSwagger2(doc, diagnostics);
  }

  const version = typeof doc['openapi'] === 'string' ? (doc['openapi'] as string) : '3.1.0';
  if (version.startsWith('3.0')) {
    normalizeNullable(doc);
    diagnostics.push(note('ing.adapt.upgraded', `normalized OpenAPI ${version} → 3.1.0`));
  } else if (!version.startsWith('3.1')) {
    diagnostics.push(
      warn('ing.adapt.unknown_version', `unrecognized OpenAPI version "${version}"; treating as 3.1`),
    );
  }

  doc['openapi'] = '3.1.0';
  delete doc['swagger'];
  return { document: doc as OpenApiDocument, diagnostics };
}

/** 3.0 `nullable: true` → 3.1 `type: [..., "null"]`; drop the keyword either way. */
function normalizeNullable(root: unknown): void {
  walkNodes(root, (node) => {
    if (node['nullable'] === true) {
      const t = node['type'];
      if (typeof t === 'string') node['type'] = [t, 'null'];
      else if (Array.isArray(t) && !t.includes('null')) node['type'] = [...t, 'null'];
      delete node['nullable'];
    } else if ('nullable' in node) {
      delete node['nullable'];
    }
  });
}

function rewriteRefs(root: unknown, from: string, to: string): void {
  walkNodes(root, (node) => {
    const ref = node['$ref'];
    if (typeof ref === 'string' && ref.startsWith(from)) node['$ref'] = to + ref.slice(from.length);
  });
}

/** Best-effort Swagger 2.0 → OpenAPI 3.x for the common shapes; flag the uncertain bits. */
function upgradeSwagger2(doc: Record<string, unknown>, diagnostics: Diagnostic[]): Record<string, unknown> {
  diagnostics.push(
    warn('ing.adapt.swagger2', 'best-effort upgrade Swagger 2.0 → OpenAPI 3.1; verify bodies/responses'),
  );
  const out: Record<string, unknown> = { ...doc };

  // host + basePath + schemes → servers
  const host = typeof doc['host'] === 'string' ? doc['host'] : '';
  const basePath = typeof doc['basePath'] === 'string' ? doc['basePath'] : '';
  const schemes = Array.isArray(doc['schemes']) ? (doc['schemes'] as string[]) : ['https'];
  if (host) out['servers'] = schemes.map((s) => ({ url: `${s}://${host}${basePath}` }));

  const components: Record<string, unknown> = isObject(out['components'])
    ? { ...(out['components'] as Record<string, unknown>) }
    : {};
  if (isObject(doc['definitions'])) components['schemas'] = doc['definitions'];

  if (isObject(doc['securityDefinitions'])) {
    const schemes2: Record<string, unknown> = {};
    for (const [name, def] of Object.entries(doc['securityDefinitions'])) {
      schemes2[name] = upgradeSecurityScheme(def, diagnostics);
    }
    components['securitySchemes'] = schemes2;
  }
  out['components'] = components;

  const consumes = firstString(doc['consumes']) ?? 'application/json';
  const produces = firstString(doc['produces']) ?? 'application/json';

  if (isObject(doc['paths'])) {
    const newPaths: Record<string, unknown> = {};
    for (const [path, item] of Object.entries(doc['paths'])) {
      if (!isObject(item)) {
        newPaths[path] = item;
        continue;
      }
      const newItem: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(item)) {
        newItem[key] =
          isHttpMethod(key) && isObject(value)
            ? upgradeOperation(value, consumes, produces, diagnostics)
            : value;
      }
      newPaths[path] = newItem;
    }
    out['paths'] = newPaths;
  }

  for (const key of ['swagger', 'host', 'basePath', 'schemes', 'definitions', 'securityDefinitions', 'consumes', 'produces']) {
    delete out[key];
  }
  out['openapi'] = '3.0.3';
  rewriteRefs(out, '#/definitions/', '#/components/schemas/');
  return out;
}

function upgradeOperation(
  op: Record<string, unknown>,
  consumes: string,
  produces: string,
  diagnostics: Diagnostic[],
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...op };
  const params = Array.isArray(op['parameters']) ? op['parameters'] : [];
  const kept: unknown[] = [];
  const formProps: Record<string, unknown> = {};
  const formRequired: string[] = [];
  let bodySchema: unknown;

  for (const param of params) {
    if (!isObject(param)) continue;
    const loc = param['in'];
    const name = typeof param['name'] === 'string' ? param['name'] : undefined;
    if (loc === 'body') {
      bodySchema = param['schema'];
    } else if (loc === 'formData' && name) {
      formProps[name] = { type: param['type'] ?? 'string' };
      if (param['required'] === true) formRequired.push(name);
    } else {
      kept.push(param);
    }
  }
  out['parameters'] = kept;

  if (bodySchema !== undefined) {
    out['requestBody'] = { content: { [consumes]: { schema: bodySchema } } };
  } else if (Object.keys(formProps).length > 0) {
    const schema: Record<string, unknown> = { type: 'object', properties: formProps };
    if (formRequired.length > 0) schema['required'] = formRequired;
    const mediaType = consumes === 'application/json' ? 'application/x-www-form-urlencoded' : consumes;
    out['requestBody'] = { content: { [mediaType]: { schema } } };
    diagnostics.push(note('ing.adapt.formdata', 'converted formData parameters into a requestBody object'));
  }

  if (isObject(op['responses'])) {
    const newResponses: Record<string, unknown> = {};
    for (const [code, response] of Object.entries(op['responses'])) {
      if (isObject(response) && 'schema' in response) {
        const { schema, ...rest } = response as Record<string, unknown>;
        newResponses[code] = { ...rest, content: { [produces]: { schema } } };
      } else {
        newResponses[code] = response;
      }
    }
    out['responses'] = newResponses;
  }
  return out;
}

function upgradeSecurityScheme(def: unknown, diagnostics: Diagnostic[]): unknown {
  if (!isObject(def)) return def;
  switch (def['type']) {
    case 'basic':
      return { type: 'http', scheme: 'basic' };
    case 'apiKey':
      return { type: 'apiKey', name: def['name'], in: def['in'] };
    case 'oauth2':
      diagnostics.push(note('ing.adapt.oauth2', 'oauth2 security scheme upgraded best-effort'));
      return { type: 'oauth2', flows: {} };
    default:
      return def;
  }
}

import type { Diagnostic, OpenApiDocument } from '@cn/contracts';
import { error, note, warn } from '@cn/contracts';
import { HTTP_METHODS, collectInternalRefs, isObject, resolvePointer } from './util';

export interface ValidateResult {
  diagnostics: Diagnostic[];
  valid: boolean;
}

/**
 * Validate answers "is it correct?" (blocking). Deterministic linting rejects broken specs loudly:
 * undeclared path params, duplicate operationIds, and unresolved internal refs are errors; softer
 * issues are warnings/notes. `valid` is false iff any error is present — bad specs fail loud, so
 * the IR stage won't run on them.
 */
export function validateSpec(document: OpenApiDocument): ValidateResult {
  const diagnostics: Diagnostic[] = [];
  const doc = document as Record<string, unknown>;

  const info = doc['info'];
  if (!isObject(info) || typeof info['title'] !== 'string') {
    diagnostics.push(warn('ing.validate.no_title', 'missing info.title'));
  }
  if (!isObject(info) || typeof info['version'] !== 'string') {
    diagnostics.push(warn('ing.validate.no_version', 'missing info.version'));
  }

  const paths = isObject(doc['paths']) ? doc['paths'] : {};
  if (Object.keys(paths).length === 0) {
    diagnostics.push(note('ing.validate.no_paths', 'document declares no paths'));
  }

  const seenOperationIds = new Map<string, string>();
  for (const [path, item] of Object.entries(paths)) {
    if (!isObject(item)) continue;

    const declared = declaredPathParams(doc, item);
    for (const placeholder of pathPlaceholders(path)) {
      if (!declared.has(placeholder)) {
        diagnostics.push(
          error(
            'ing.validate.undeclared_path_param',
            `path "${path}" uses {${placeholder}} but no path parameter declares it`,
          ),
        );
      }
    }

    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!isObject(op)) continue;
      const where = `${method.toUpperCase()} ${path}`;

      const operationId = op['operationId'];
      if (typeof operationId === 'string') {
        const prev = seenOperationIds.get(operationId);
        if (prev) {
          diagnostics.push(
            error(
              'ing.validate.duplicate_operation_id',
              `operationId "${operationId}" is used by both ${prev} and ${where}`,
            ),
          );
        } else {
          seenOperationIds.set(operationId, where);
        }
      } else {
        diagnostics.push(
          note('ing.validate.no_operation_id', `${where} has no operationId (one will be synthesized)`),
        );
      }

      const responses = op['responses'];
      if (!isObject(responses) || Object.keys(responses).length === 0) {
        diagnostics.push(warn('ing.validate.no_responses', `${where} declares no responses`));
      }
    }
  }

  for (const ref of new Set(collectInternalRefs(doc))) {
    if (resolvePointer(doc, ref) === undefined) {
      diagnostics.push(error('ing.validate.unresolved_ref', `internal $ref does not resolve: ${ref}`));
    }
  }

  return { diagnostics, valid: !diagnostics.some((d) => d.severity === 'error') };
}

function declaredPathParams(doc: Record<string, unknown>, pathItem: Record<string, unknown>): Set<string> {
  const names = new Set<string>();
  const harvest = (params: unknown): void => {
    if (!Array.isArray(params)) return;
    for (const raw of params) {
      // Parameters are commonly shared via $ref (#/components/parameters/...) — resolve before
      // inspecting, mirroring how the IR builder dereferences them, so we don't false-positive.
      const p = isObject(raw) && typeof raw['$ref'] === 'string' ? resolvePointer(doc, raw['$ref']) : raw;
      if (isObject(p) && p['in'] === 'path' && typeof p['name'] === 'string') names.add(p['name']);
    }
  };
  harvest(pathItem['parameters']);
  for (const method of HTTP_METHODS) {
    const op = pathItem[method];
    if (isObject(op)) harvest(op['parameters']);
  }
  return names;
}

function pathPlaceholders(path: string): string[] {
  const names: string[] = [];
  const re = /\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path)) !== null) names.push(m[1]!);
  return names;
}

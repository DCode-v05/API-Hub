import type { OpenApiDocument, RepairProposal } from '@cn/contracts';
import { HTTP_METHODS, isObject, schemaType } from './util';

/**
 * Repair answers "is it clear?" (advisory). It NEVER mutates the document — it drafts non-applied
 * proposals (shaped like transform rules) for a human to review and freeze. Today the drafter is
 * deterministic heuristics; an LLM drafter can emit the same RepairProposal shape later.
 */
export function proposeRepairs(document: OpenApiDocument): RepairProposal[] {
  const proposals: RepairProposal[] = [];
  const doc = document as Record<string, unknown>;
  const paths = isObject(doc['paths']) ? doc['paths'] : {};

  for (const [path, item] of Object.entries(paths)) {
    if (!isObject(item)) continue;
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!isObject(op)) continue;
      const where = `${method.toUpperCase()} ${path}`;
      const pointer = `#/paths/${escapePointer(path)}/${method}`;

      if (typeof op['summary'] !== 'string' && typeof op['description'] !== 'string') {
        proposals.push({
          code: 'repair.missing_description',
          op: 'set_description',
          target: pointer,
          reason: `${where} has no summary or description`,
          suggestion: `Describe what ${where} does and what it returns.`,
          severity: 'note',
          source: 'heuristic',
        });
      }

      const operationId = op['operationId'];
      if (typeof operationId === 'string' && !/^[a-z][A-Za-z0-9]*$/.test(operationId)) {
        const camel = toCamelCase(operationId);
        proposals.push({
          code: 'repair.ugly_operation_id',
          op: 'rename',
          target: pointer,
          reason: `operationId "${operationId}" is not lowerCamelCase`,
          suggestion: `Rename operationId to "${camel}".`,
          value: camel,
          severity: 'note',
          source: 'heuristic',
        });
      }

      const params = Array.isArray(op['parameters']) ? op['parameters'] : [];
      for (let i = 0; i < params.length; i++) {
        const param = params[i];
        if (!isObject(param)) continue;
        const name = param['name'];
        if (typeof name === 'string' && looksLikeId(name) && isNumeric(schemaType(param['schema']))) {
          // RFC6901 pointer to the parameter's schema (set_type applies to the schema).
          proposals.push(idTypeProposal(`${pointer}/parameters/${i}/schema`, name, where));
        }
      }

      const body = requestBody(op);
      const properties = body && isObject(body.schema) && isObject(body.schema['properties']) ? body.schema['properties'] : undefined;
      if (body && properties) {
        for (const [propName, propSchema] of Object.entries(properties)) {
          if (looksLikeId(propName) && isNumeric(schemaType(propSchema))) {
            const target = `${pointer}/requestBody/content/${escapePointer(body.media)}/schema/properties/${escapePointer(propName)}`;
            proposals.push(idTypeProposal(target, propName, where));
          }
        }
      }
    }
  }
  return proposals;
}

function idTypeProposal(target: string, name: string, where: string): RepairProposal {
  return {
    code: 'repair.id_typed_as_number',
    op: 'set_type',
    target,
    reason: `${where}: "${name}" looks like an identifier but is typed numeric; IDs are usually strings`,
    suggestion: `Set "${name}" type to string.`,
    value: 'string',
    severity: 'warning',
    source: 'heuristic',
  };
}

function requestBody(op: Record<string, unknown>): { schema: unknown; media: string } | undefined {
  const body = op['requestBody'];
  if (!isObject(body) || !isObject(body['content'])) return undefined;
  const content = body['content'] as Record<string, unknown>;
  if (isObject(content['application/json'])) {
    return { schema: (content['application/json'] as Record<string, unknown>)['schema'], media: 'application/json' };
  }
  const firstKey = Object.keys(content)[0];
  if (firstKey === undefined) return undefined;
  const media = content[firstKey];
  return isObject(media) ? { schema: media['schema'], media: firstKey } : undefined;
}

function looksLikeId(name: string): boolean {
  return /(^id$|_id$|Id$)/.test(name);
}

function isNumeric(type: string): boolean {
  return type === 'number' || type === 'integer';
}

function toCamelCase(s: string): string {
  const parts = s.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (parts.length === 0) return s;
  return parts
    .map((p, i) => (i === 0 ? p.charAt(0).toLowerCase() + p.slice(1) : p.charAt(0).toUpperCase() + p.slice(1)))
    .join('');
}

function escapePointer(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

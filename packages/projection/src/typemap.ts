import { isObject, refName, schemaType } from '@cn/ingest';
import { pascal } from './naming';

export interface TypedRef {
  type: string;
  ref?: string;
}

export function tsType(t: TypedRef): string {
  if (t.ref) return pascal(t.ref);
  switch (t.type) {
    case 'string':
    case 'datetime':
      return 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
      return 'unknown[]';
    case 'object':
      return 'Record<string, unknown>';
    default:
      return 'unknown';
  }
}

export function pyType(t: TypedRef): string {
  if (t.ref) return pascal(t.ref);
  switch (t.type) {
    case 'string':
    case 'datetime':
      return 'str';
    case 'integer':
      return 'int';
    case 'number':
      return 'float';
    case 'boolean':
      return 'bool';
    case 'array':
      return 'list';
    case 'object':
      return 'dict';
    default:
      return 'Any';
  }
}

export interface ModelField {
  name: string;
  type: string;
  ref?: string;
  required: boolean;
}

export function schemaFields(schema: unknown): ModelField[] {
  if (!isObject(schema) || !isObject(schema['properties'])) return [];
  const requiredList = Array.isArray(schema['required'])
    ? (schema['required'] as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];
  const required = new Set(requiredList);
  const fields: ModelField[] = [];
  for (const [name, prop] of Object.entries(schema['properties'] as Record<string, unknown>)) {
    const ref = isObject(prop) && typeof prop['$ref'] === 'string' ? refName(prop['$ref']) : undefined;
    const field: ModelField = { name, required: required.has(name), type: schemaType(prop) };
    if (ref) field.ref = ref;
    fields.push(field);
  }
  return fields;
}

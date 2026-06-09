import ts from 'typescript';
import type { Diagnostic } from '@cn/contracts';
import { note } from '@cn/contracts';
import type { DerivedOperation } from './openapi-shape';

export interface IntrospectResult {
  ops: DerivedOperation[];
  diagnostics: Diagnostic[];
}

export interface SdkFile {
  path: string;
  text: string;
}

// ---------- TypeScript ----------

/**
 * Reverse-derive operations from a TypeScript SDK by walking the AST for exported classes
 * (their public methods) and exported functions. Types are mapped to JSON Schema heuristically —
 * this is an inferred, lower-trust contract, not a declared one.
 */
export function introspectTypescriptSdk(files: SdkFile[]): IntrospectResult {
  const ops: DerivedOperation[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const file of files) {
    const sf = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node): void => {
      if (ts.isClassDeclaration(node) && node.name && isExported(node)) {
        const className = node.name.text;
        for (const member of node.members) {
          if (
            ts.isMethodDeclaration(member) &&
            member.name &&
            ts.isIdentifier(member.name) &&
            isPublicMember(member) &&
            !member.name.text.startsWith('_')
          ) {
            ops.push(methodToOp(className, member.name.text, member.parameters, jsDocOf(member)));
          }
        }
      } else if (ts.isFunctionDeclaration(node) && node.name && isExported(node)) {
        if (!node.name.text.startsWith('_')) {
          ops.push(methodToOp(null, node.name.text, node.parameters, jsDocOf(node)));
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  if (ops.length === 0) {
    diagnostics.push(
      note('acq.sdk.ts_no_ops', 'no exported classes or functions found to introspect'),
    );
  }
  return { ops, diagnostics };
}

function methodToOp(
  className: string | null,
  method: string,
  params: ts.NodeArray<ts.ParameterDeclaration>,
  description: string | undefined,
): DerivedOperation {
  const name = className ? `${lowerFirst(stripClientSuffix(className))}_${method}` : method;
  const op: DerivedOperation = { name, inputSchema: paramsToSchema(params) };
  if (description) op.description = description;
  return op;
}

function paramsToSchema(params: ts.NodeArray<ts.ParameterDeclaration>): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const p of params) {
    if (!ts.isIdentifier(p.name)) continue;
    const pname = p.name.text;
    if (pname === 'this') continue;
    properties[pname] = tsTypeToSchema(p.type?.getText());
    if (!p.questionToken && !p.initializer) required.push(pname);
  }
  const schema: Record<string, unknown> = { type: 'object', properties };
  if (required.length > 0) schema['required'] = required;
  return schema;
}

function tsTypeToSchema(typeText?: string): Record<string, unknown> {
  if (!typeText) return {};
  const t = typeText.trim();
  if (/^string$/i.test(t)) return { type: 'string' };
  if (/^(number|bigint)$/i.test(t)) return { type: 'number' };
  if (/^boolean$/i.test(t)) return { type: 'boolean' };
  if (/^Date$/.test(t)) return { type: 'string', format: 'date-time' };
  if (/\[\]$/.test(t) || /^(Array|ReadonlyArray)\s*</.test(t)) return { type: 'array' };
  if (/^['"`]/.test(t)) return { type: 'string' };
  if (/^(Record|Map|object|\{)/.test(t)) return { type: 'object' };
  return { type: 'object', 'x-cn-ts-type': t };
}

function isExported(node: ts.Node): boolean {
  return hasModifier(node, ts.SyntaxKind.ExportKeyword);
}

function isPublicMember(node: ts.Node): boolean {
  return (
    !hasModifier(node, ts.SyntaxKind.PrivateKeyword) &&
    !hasModifier(node, ts.SyntaxKind.ProtectedKeyword) &&
    !hasModifier(node, ts.SyntaxKind.StaticKeyword)
  );
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return (mods ?? []).some((m) => m.kind === kind);
}

function jsDocOf(node: ts.Node): string | undefined {
  const tags = ts.getJSDocCommentsAndTags(node);
  for (const tag of tags) {
    const comment = tag.comment;
    if (typeof comment === 'string' && comment.trim()) return comment.trim();
  }
  return undefined;
}

function stripClientSuffix(name: string): string {
  return name.replace(/(Client|Service|Api|API)$/, '') || name;
}

function lowerFirst(s: string): string {
  return s.length === 0 ? s : s[0]!.toLowerCase() + s.slice(1);
}

// ---------- Python ----------

const PY_DEF = /^[ \t]*(?:async[ \t]+)?def[ \t]+([A-Za-z_]\w*)[ \t]*\(([\s\S]*?)\)[ \t]*(?:->[ \t]*[^:]+)?:/gm;

/**
 * Reverse-derive operations from a Python SDK with a lightweight signature scan (no Python
 * runtime). Best-effort: handles `def name(self, a: str, b: int = 0) -> T:` shapes; complex
 * nested generics in annotations may be approximated.
 */
export function introspectPythonSdk(files: SdkFile[]): IntrospectResult {
  const ops: DerivedOperation[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const file of files) {
    PY_DEF.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PY_DEF.exec(file.text)) !== null) {
      const name = m[1]!;
      if (name.startsWith('_')) continue; // private / dunder
      ops.push({ name, inputSchema: pyParamsToSchema(m[2] ?? '') });
    }
  }

  if (ops.length === 0) {
    diagnostics.push(note('acq.sdk.py_no_ops', 'no public def signatures found to introspect'));
  } else {
    diagnostics.push(
      note('acq.sdk.py_heuristic', 'Python signatures parsed heuristically; verify required/optional flags'),
    );
  }
  return { ops, diagnostics };
}

function pyParamsToSchema(raw: string): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const part of splitTopLevel(raw)) {
    const seg = part.trim();
    if (!seg || seg === '/' || seg === '*') continue;
    if (seg.startsWith('*')) continue; // *args / **kwargs
    const eq = splitOnce(seg, '=');
    const left = eq[0].trim();
    const colon = splitOnce(left, ':');
    const name = colon[0].trim();
    if (name === 'self' || name === 'cls' || name === '') continue;
    properties[name] = pyTypeToSchema(colon[1]?.trim());
    if (eq[1] === undefined) required.push(name);
  }
  const schema: Record<string, unknown> = { type: 'object', properties };
  if (required.length > 0) schema['required'] = required;
  return schema;
}

function pyTypeToSchema(ann?: string): Record<string, unknown> {
  if (!ann) return {};
  const t = ann.trim();
  if (/^(str)$/i.test(t)) return { type: 'string' };
  if (/^(int|float)$/i.test(t)) return { type: 'number' };
  if (/^(bool)$/i.test(t)) return { type: 'boolean' };
  if (/^(list|List|Sequence|tuple|Tuple)\b/.test(t)) return { type: 'array' };
  if (/^(dict|Dict|Mapping)\b/.test(t)) return { type: 'object' };
  if (/^datetime/.test(t)) return { type: 'string', format: 'date-time' };
  return { type: 'object', 'x-cn-py-type': t };
}

/** Split a parameter list on top-level commas (ignoring commas inside [], (), {} or quotes). */
function splitTopLevel(raw: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';
  for (const ch of raw) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '[' || ch === '(' || ch === '{') depth++;
    else if (ch === ']' || ch === ')' || ch === '}') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
}

function splitOnce(s: string, delim: string): [string, string | undefined] {
  const i = s.indexOf(delim);
  if (i < 0) return [s, undefined];
  return [s.slice(0, i), s.slice(i + delim.length)];
}

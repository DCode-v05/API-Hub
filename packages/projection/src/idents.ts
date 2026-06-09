import { isIdent } from './gen-util';
import { snake } from './naming';

const PY_KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue',
  'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in',
  'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with',
  'yield', 'match', 'case',
]);

/** A valid, non-reserved Python identifier for a wire name (the wire name itself is kept separately). */
export function pySafeIdent(name: string): string {
  let s = isIdent(name) ? name : snake(name);
  if (!s) s = 'arg';
  if (!/^[A-Za-z_]/.test(s)) s = '_' + s; // digit-leading or empty → prefix
  if (PY_KEYWORDS.has(s)) s = s + '_'; // PEP 8 reserved-word escape
  return s;
}

/** Make `base` unique within `used`, appending 2, 3, … deterministically. */
export function uniquify(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let n = 2;
  while (used.has(base + String(n))) n += 1;
  const value = base + String(n);
  used.add(value);
  return value;
}

/** Sanitize free text for a single-line TS JSDoc comment. */
export function tsDoc(doc: string): string {
  return doc.replace(/\s+/g, ' ').replace(/\*\//g, '* /').trim();
}

/** Escape free text to sit safely inside a Python triple-quoted docstring. */
export function pyDoc(doc: string): string {
  return doc.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Ensure a name is a valid leading-letter identifier-ish token (for module/bin names). */
export function safeLeading(name: string, fallbackPrefix: string): string {
  if (name === '') return fallbackPrefix;
  return /^[A-Za-z_]/.test(name) ? name : `${fallbackPrefix}${name}`;
}

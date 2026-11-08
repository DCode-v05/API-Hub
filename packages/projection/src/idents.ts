import { isIdent } from './gen-util';
import { snake } from './naming';

const PY_KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue',
  'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in',
  'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with',
  'yield', 'match', 'case',
]);

export function pySafeIdent(name: string): string {
  let s = isIdent(name) ? name : snake(name);
  if (!s) s = 'arg';
  if (!/^[A-Za-z_]/.test(s)) s = '_' + s;
  if (PY_KEYWORDS.has(s)) s = s + '_';
  return s;
}

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

export function tsDoc(doc: string): string {
  return doc.replace(/\s+/g, ' ').replace(/\*\//g, '* /').trim();
}

export function pyDoc(doc: string): string {
  return doc.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function safeLeading(name: string, fallbackPrefix: string): string {
  if (name === '') return fallbackPrefix;
  return /^[A-Za-z_]/.test(name) ? name : `${fallbackPrefix}${name}`;
}

export function collectExternalRefs(root: unknown): string[] {
  const refs: string[] = [];
  const seen = new Set<object>();
  const visit = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    const obj = node as Record<string, unknown>;
    const ref = obj['$ref'];
    if (typeof ref === 'string' && ref.length > 0 && !ref.startsWith('#')) refs.push(ref);
    for (const value of Object.values(obj)) visit(value);
  };
  visit(root);
  return refs;
}

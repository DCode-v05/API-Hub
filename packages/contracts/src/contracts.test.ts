import { describe, it, expect } from 'vitest';
import { diag, error, warn, note, hasErrors, countBySeverity } from './index';

describe('diagnostics', () => {
  it('builds graded diagnostics and counts them', () => {
    const ds = [error('a', 'x'), warn('b', 'y'), note('c', 'z'), warn('d', 'w')];
    expect(hasErrors(ds)).toBe(true);
    expect(countBySeverity(ds)).toEqual({ error: 1, warning: 2, note: 1 });
  });

  it('treats note/warning-only as non-fatal', () => {
    expect(hasErrors([note('n', 'n'), warn('w', 'w')])).toBe(false);
  });

  it('carries an optional pointer only when given', () => {
    expect(diag('note', 'c', 'm')).not.toHaveProperty('pointer');
    expect(diag('error', 'c', 'm', '#/paths').pointer).toBe('#/paths');
  });
});

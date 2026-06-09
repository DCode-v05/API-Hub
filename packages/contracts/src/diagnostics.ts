/**
 * Graded diagnostics, diagnostics-first like the comparable tools: acquisition degrades
 * gracefully and reports, rather than hard-failing — except where correctness is impossible
 * (an `error` means no trustworthy artifact could be produced).
 */

export type Severity = 'error' | 'warning' | 'note';

export interface Diagnostic {
  severity: Severity;
  /** Stable machine code, e.g. "acq.github.spec_not_found". */
  code: string;
  message: string;
  /** Optional JSON Pointer or file location the diagnostic refers to. */
  pointer?: string;
}

export function diag(
  severity: Severity,
  code: string,
  message: string,
  pointer?: string,
): Diagnostic {
  return pointer === undefined
    ? { severity, code, message }
    : { severity, code, message, pointer };
}

export const error = (code: string, message: string, pointer?: string): Diagnostic =>
  diag('error', code, message, pointer);
export const warn = (code: string, message: string, pointer?: string): Diagnostic =>
  diag('warning', code, message, pointer);
export const note = (code: string, message: string, pointer?: string): Diagnostic =>
  diag('note', code, message, pointer);

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === 'error');
}

export function countBySeverity(
  diagnostics: readonly Diagnostic[],
): Record<Severity, number> {
  const counts: Record<Severity, number> = { error: 0, warning: 0, note: 0 };
  for (const d of diagnostics) counts[d.severity] += 1;
  return counts;
}

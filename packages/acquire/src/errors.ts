export function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Strip a PAT that may have been interpolated into a clone URL before it reaches a log/diagnostic. */
export function redactSecrets(text: string): string {
  return text
    .replace(/x-access-token:[^@\s]+@/gi, 'x-access-token:***@')
    .replace(/(https?:\/\/)[^@/\s:]+:[^@/\s]+@/gi, '$1***:***@');
}

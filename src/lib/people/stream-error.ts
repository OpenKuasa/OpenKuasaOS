/**
 * What the chat route may log about a stream error: only its class name. The
 * message of a rejected tool input embeds the whole input (NRIC, bank account,
 * salary), and a non-Error value can be anything, so neither is ever logged.
 */
export function streamErrorName(error: unknown): string {
  return error instanceof Error && error.name ? error.name : 'non-error';
}

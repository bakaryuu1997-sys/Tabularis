/**
 * Waits between automatic reconnect attempts after a health-check failure.
 * The first attempt runs immediately; there is no wait after the last one.
 */
export const RECONNECT_DELAYS_MS: readonly number[] = [2000, 5000, 15000];

/** Total number of reconnect attempts (one more than the number of waits). */
export function reconnectAttemptCount(delays: readonly number[] = RECONNECT_DELAYS_MS): number {
  return delays.length + 1;
}

import { describe, it, expect } from "vitest";
import { RECONNECT_DELAYS_MS, reconnectAttemptCount } from "../../src/utils/reconnect";

describe("reconnect backoff", () => {
  it("waits longer between each attempt", () => {
    for (let i = 1; i < RECONNECT_DELAYS_MS.length; i++) {
      expect(RECONNECT_DELAYS_MS[i]).toBeGreaterThan(RECONNECT_DELAYS_MS[i - 1]);
    }
  });

  it("makes one more attempt than the number of waits", () => {
    expect(reconnectAttemptCount()).toBe(RECONNECT_DELAYS_MS.length + 1);
    expect(reconnectAttemptCount([1000])).toBe(2);
    expect(reconnectAttemptCount([])).toBe(1);
  });
});

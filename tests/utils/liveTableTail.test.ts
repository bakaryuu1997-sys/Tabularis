import { describe, it, expect } from "vitest";
import {
  computeRowSignature,
  detectRowDeltas,
  normalizeLiveTailInterval,
} from "../../src/utils/liveTableTail";

describe("liveTableTail", () => {
  describe("computeRowSignature", () => {
    it("computes row signature using all values when pk is not specified", () => {
      const sig1 = computeRowSignature([1, "Alice", "alice@example.com"]);
      const sig2 = computeRowSignature([1, "Alice", "alice@example.com"]);
      const sig3 = computeRowSignature([2, "Bob", "bob@example.com"]);

      expect(sig1).toBe(sig2);
      expect(sig1).not.toBe(sig3);
    });

    it("computes signature using specific pk indices", () => {
      const sig1 = computeRowSignature([101, "Alice", "alice@example.com"], [0]);
      const sig2 = computeRowSignature([101, "Alice Modified", "alice@new.com"], [0]);

      expect(sig1).toBe(sig2);
      expect(sig1).toBe("101");
    });
  });

  describe("detectRowDeltas", () => {
    const baseRows = [
      [1, "Order #1", 100],
      [2, "Order #2", 250],
    ];

    it("returns zero deltas when data has not changed", () => {
      const result = detectRowDeltas(baseRows, [...baseRows]);
      expect(result.hasChanges).toBe(false);
      expect(result.newRowCount).toBe(0);
      expect(result.newRowIndices).toEqual([]);
    });

    it("detects newly inserted rows", () => {
      const updatedRows = [
        [3, "Order #3", 450], // newly inserted at top
        [1, "Order #1", 100],
        [2, "Order #2", 250],
      ];

      const result = detectRowDeltas(baseRows, updatedRows, [0]);
      expect(result.hasChanges).toBe(true);
      expect(result.newRowCount).toBe(1);
      expect(result.newRowIndices).toEqual([0]);
    });

    it("handles empty initial rows gracefully", () => {
      const result = detectRowDeltas([], baseRows);
      expect(result.hasChanges).toBe(false);
      expect(result.newRowCount).toBe(0);
    });
  });

  describe("normalizeLiveTailInterval", () => {
    it("clamps interval values between 1 and 60 seconds", () => {
      expect(normalizeLiveTailInterval(0.5)).toBe(3);
      expect(normalizeLiveTailInterval(5)).toBe(5);
      expect(normalizeLiveTailInterval(120)).toBe(60);
      expect(normalizeLiveTailInterval(NaN)).toBe(3);
    });
  });
});

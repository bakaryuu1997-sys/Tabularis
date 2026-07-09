import { describe, it, expect, beforeEach } from "vitest";
import {
  toggleHiddenColumn,
  computeColumnVisibility,
  pruneHiddenColumns,
  loadHiddenColumns,
  saveHiddenColumns,
} from "../../src/utils/columnVisibility";

describe("columnVisibility utils", () => {
  describe("toggleHiddenColumn", () => {
    it("adds then removes a column", () => {
      const a = toggleHiddenColumn(new Set(), "email");
      expect([...a]).toEqual(["email"]);
      const b = toggleHiddenColumn(a, "email");
      expect(b.has("email")).toBe(false);
    });
    it("does not mutate the input set", () => {
      const input = new Set<string>();
      toggleHiddenColumn(input, "x");
      expect(input.size).toBe(0);
    });
  });

  describe("computeColumnVisibility", () => {
    it("maps hidden columns to false only", () => {
      expect(computeColumnVisibility(new Set(["a", "b"]))).toEqual({
        a: false,
        b: false,
      });
      expect(computeColumnVisibility(new Set())).toEqual({});
    });
  });

  describe("pruneHiddenColumns", () => {
    it("drops names no longer present", () => {
      const pruned = pruneHiddenColumns(
        new Set(["a", "gone"]),
        ["a", "b", "c"],
      );
      expect([...pruned]).toEqual(["a"]);
    });
  });

  describe("load/save", () => {
    beforeEach(() => localStorage.clear());

    it("returns empty set when no key", () => {
      expect(loadHiddenColumns(undefined).size).toBe(0);
    });
    it("round-trips hidden columns", () => {
      saveHiddenColumns("k1", new Set(["x", "y"]));
      expect([...loadHiddenColumns("k1")].sort()).toEqual(["x", "y"]);
    });
    it("clears storage when the set is emptied", () => {
      saveHiddenColumns("k2", new Set(["x"]));
      saveHiddenColumns("k2", new Set());
      expect(loadHiddenColumns("k2").size).toBe(0);
    });
    it("returns empty set on corrupt storage", () => {
      localStorage.setItem("tabularis_hidden_cols:bad", "{oops");
      expect(loadHiddenColumns("bad").size).toBe(0);
    });
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import {
  evaluateHighlightRule,
  evaluateRowHighlight,
  buildHighlightStorageKey,
  loadHighlightRules,
  saveHighlightRules,
  getHighlightStyle,
  type HighlightRule,
} from "../../src/utils/highlightRules";

describe("highlightRules", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("evaluateHighlightRule", () => {
    it("returns false if rule is disabled", () => {
      const rule: HighlightRule = {
        id: "1",
        column: "status",
        operator: "=",
        value: "active",
        colorScheme: "green",
        target: "cell",
        enabled: false,
      };
      expect(evaluateHighlightRule("active", rule)).toBe(false);
    });

    it("evaluates is_null and is_not_null", () => {
      const nullRule: HighlightRule = {
        id: "1",
        column: "deleted_at",
        operator: "is_null",
        value: "",
        colorScheme: "gray",
        target: "row",
        enabled: true,
      };
      const notNullRule: HighlightRule = {
        id: "2",
        column: "deleted_at",
        operator: "is_not_null",
        value: "",
        colorScheme: "red",
        target: "row",
        enabled: true,
      };

      expect(evaluateHighlightRule(null, nullRule)).toBe(true);
      expect(evaluateHighlightRule(undefined, nullRule)).toBe(true);
      expect(evaluateHighlightRule("2026-01-01", nullRule)).toBe(false);

      expect(evaluateHighlightRule("2026-01-01", notNullRule)).toBe(true);
      expect(evaluateHighlightRule(null, notNullRule)).toBe(false);
    });

    it("evaluates string comparisons case-insensitively", () => {
      const eqRule: HighlightRule = {
        id: "1",
        column: "status",
        operator: "=",
        value: "FAILED",
        colorScheme: "red",
        target: "cell",
        enabled: true,
      };
      expect(evaluateHighlightRule("failed", eqRule)).toBe(true);
      expect(evaluateHighlightRule("SUCCESS", eqRule)).toBe(false);

      const containsRule: HighlightRule = {
        id: "2",
        column: "message",
        operator: "contains",
        value: "error",
        colorScheme: "red",
        target: "row",
        enabled: true,
      };
      expect(evaluateHighlightRule("Fatal ERROR occurred", containsRule)).toBe(true);
      expect(evaluateHighlightRule("All ok", containsRule)).toBe(false);

      const startsWithRule: HighlightRule = {
        id: "3",
        column: "code",
        operator: "starts_with",
        value: "50",
        colorScheme: "amber",
        target: "cell",
        enabled: true,
      };
      expect(evaluateHighlightRule("502 Bad Gateway", startsWithRule)).toBe(true);
      expect(evaluateHighlightRule("404 Not Found", startsWithRule)).toBe(false);
    });

    it("evaluates numeric comparisons correctly", () => {
      const gtRule: HighlightRule = {
        id: "1",
        column: "balance",
        operator: ">",
        value: "100",
        colorScheme: "green",
        target: "cell",
        enabled: true,
      };
      const lteRule: HighlightRule = {
        id: "2",
        column: "stock",
        operator: "<=",
        value: "5",
        colorScheme: "red",
        target: "cell",
        enabled: true,
      };

      expect(evaluateHighlightRule(250, gtRule)).toBe(true);
      expect(evaluateHighlightRule(50, gtRule)).toBe(false);
      expect(evaluateHighlightRule("150", gtRule)).toBe(true);

      expect(evaluateHighlightRule(5, lteRule)).toBe(true);
      expect(evaluateHighlightRule(0, lteRule)).toBe(true);
      expect(evaluateHighlightRule(10, lteRule)).toBe(false);
    });
  });

  describe("evaluateRowHighlight", () => {
    const columns = ["id", "username", "role", "balance", "deleted_at"];
    const colMap = new Map<string, number>();
    columns.forEach((col, idx) => colMap.set(col, idx));

    const rules: HighlightRule[] = [
      {
        id: "r1",
        column: "balance",
        operator: "<",
        value: "0",
        colorScheme: "red",
        target: "row",
        enabled: true,
      },
      {
        id: "r2",
        column: "role",
        operator: "=",
        value: "admin",
        colorScheme: "purple",
        target: "cell",
        enabled: true,
      },
    ];

    it("detects row-level and cell-level highlights", () => {
      const negativeBalanceRow = [1, "alice", "user", -50, null];
      const evalNegative = evaluateRowHighlight(negativeBalanceRow, colMap, rules);
      expect(evalNegative.rowRule?.id).toBe("r1");
      expect(evalNegative.cellRules.size).toBe(0);

      const adminRow = [2, "bob", "admin", 100, null];
      const evalAdmin = evaluateRowHighlight(adminRow, colMap, rules);
      expect(evalAdmin.rowRule).toBeUndefined();
      expect(evalAdmin.cellRules.get(2)?.id).toBe("r2"); // colIndex 2 is 'role'
    });
  });

  describe("storage and styles", () => {
    it("builds valid storage keys", () => {
      expect(buildHighlightStorageKey("conn_1", "public", "users")).toBe(
        "tabularis_highlight_rules:conn_1:public:users"
      );
      expect(buildHighlightStorageKey(null, null, null)).toBeNull();
    });

    it("saves and loads rules from localStorage", () => {
      const key = "tabularis_highlight_rules:test:table";
      const sampleRules: HighlightRule[] = [
        {
          id: "123",
          column: "status",
          operator: "=",
          value: "done",
          colorScheme: "green",
          target: "row",
          enabled: true,
        },
      ];

      saveHighlightRules(key, sampleRules);
      const loaded = loadHighlightRules(key);
      expect(loaded).toEqual(sampleRules);

      saveHighlightRules(key, []);
      expect(loadHighlightRules(key)).toEqual([]);
    });

    it("retrieves valid styles for colors", () => {
      const style = getHighlightStyle("red");
      expect(style.rowClass).toContain("bg-red-500");
      expect(style.cellClass).toContain("bg-red-500");
    });
  });
});

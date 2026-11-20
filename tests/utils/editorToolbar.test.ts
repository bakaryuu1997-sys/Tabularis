import { describe, it, expect } from "vitest";
import {
  canEditParameters,
  canExportResult,
  getRunShortcutLabel,
  getRunAriaShortcut,
  getActiveDatabaseLabel,
} from "../../src/utils/editorToolbar";

describe("editorToolbar utils", () => {
  describe("canEditParameters", () => {
    it("returns false for undefined or null tab", () => {
      expect(canEditParameters(undefined)).toBe(false);
      expect(canEditParameters(null)).toBe(false);
    });

    it("returns false for table tabs", () => {
      expect(
        canEditParameters({ type: "table", query: "SELECT * FROM users WHERE id = :id" }),
      ).toBe(false);
    });

    it("returns false when query has no parameters", () => {
      expect(
        canEditParameters({ type: "console", query: "SELECT * FROM users" }),
      ).toBe(false);
    });

    it("returns true when console query has named parameters", () => {
      expect(
        canEditParameters({
          type: "console",
          query: "SELECT * FROM users WHERE id = :user_id",
        }),
      ).toBe(true);
    });
  });

  describe("canExportResult", () => {
    it("returns false for null/undefined result", () => {
      expect(canExportResult(null)).toBe(false);
      expect(canExportResult(undefined)).toBe(false);
    });

    it("returns false when rows array is empty", () => {
      expect(canExportResult({ rows: [] })).toBe(false);
    });

    it("returns true when rows array has items", () => {
      expect(canExportResult({ rows: [{ id: 1, name: "Alice" }] })).toBe(true);
    });
  });

  describe("getRunShortcutLabel", () => {
    it("returns Cmd+Enter on macOS", () => {
      expect(getRunShortcutLabel(true)).toBe("Cmd+Enter");
    });

    it("returns Ctrl+Enter on Windows/Linux", () => {
      expect(getRunShortcutLabel(false)).toBe("Ctrl+Enter");
    });
  });

  describe("getRunAriaShortcut", () => {
    it("returns Meta+Enter on macOS", () => {
      expect(getRunAriaShortcut(true)).toBe("Meta+Enter");
    });

    it("returns Control+Enter on Windows/Linux", () => {
      expect(getRunAriaShortcut(false)).toBe("Control+Enter");
    });
  });

  describe("getActiveDatabaseLabel", () => {
    it("returns schema if provided and non-empty", () => {
      expect(getActiveDatabaseLabel("public", ["default_db"])).toBe("public");
    });

    it("falls back to first selected database if schema is missing or empty", () => {
      expect(getActiveDatabaseLabel(undefined, ["sales_db", "analytics_db"])).toBe(
        "sales_db",
      );
      expect(getActiveDatabaseLabel("", ["sales_db"])).toBe("sales_db");
    });

    it("returns empty string if neither schema nor selected databases exist", () => {
      expect(getActiveDatabaseLabel(undefined, [])).toBe("");
    });
  });
});

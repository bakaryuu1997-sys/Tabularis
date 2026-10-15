import { describe, it, expect } from "vitest";
import {
  canRenameTab,
  sanitizeTabTitle,
  validateTabTitle,
} from "../../src/utils/tabRename";

describe("tabRename", () => {
  it("determines if a tab type can be renamed", () => {
    expect(canRenameTab("console")).toBe(true);
    expect(canRenameTab("notebook")).toBe(true);
    expect(canRenameTab("table")).toBe(false);
    expect(canRenameTab("query_builder")).toBe(false);
  });

  it("sanitizes tab title and falls back on empty string", () => {
    expect(sanitizeTabTitle("  My Query  ")).toBe("My Query");
    expect(sanitizeTabTitle("   ", "Default")).toBe("Default");
    expect(sanitizeTabTitle("")).toBe("Console");
  });

  it("validates tab title length and emptiness", () => {
    expect(validateTabTitle("").valid).toBe(false);
    expect(validateTabTitle("   ").valid).toBe(false);
    expect(validateTabTitle("Valid Title").valid).toBe(true);
    expect(validateTabTitle("a".repeat(101)).valid).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { withVietnameseSafeFont } from "../../src/utils/fontStack";

describe("withVietnameseSafeFont", () => {
  it("puts Segoe UI before system-ui so it wins over a CJK system font", () => {
    expect(withVietnameseSafeFont("Inter, system-ui, sans-serif")).toBe('Inter, "Segoe UI", system-ui, sans-serif');
  });

  it("keeps the order of the user's own fonts", () => {
    expect(withVietnameseSafeFont("Open Sans, system-ui, sans-serif")).toBe('Open Sans, "Segoe UI", system-ui, sans-serif');
  });

  it("goes before -apple-system and the other generic families too", () => {
    expect(withVietnameseSafeFont("system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif")).toBe(
      "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
    );
    expect(withVietnameseSafeFont("-apple-system, Roboto")).toBe('"Segoe UI", -apple-system, Roboto');
  });

  it("does not add it twice, quoted or not", () => {
    expect(withVietnameseSafeFont('Inter, "Segoe UI", system-ui')).toBe('Inter, "Segoe UI", system-ui');
    expect(withVietnameseSafeFont("Inter, Segoe UI, system-ui")).toBe("Inter, Segoe UI, system-ui");
  });

  it("appends it when there is no generic family", () => {
    expect(withVietnameseSafeFont("Roboto, Helvetica, Arial")).toBe('Roboto, Helvetica, Arial, "Segoe UI"');
  });

  it("leaves an empty value alone", () => {
    expect(withVietnameseSafeFont("")).toBe("");
  });
});

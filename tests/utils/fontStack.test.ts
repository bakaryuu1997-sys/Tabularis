import { describe, it, expect } from "vitest";
import { withVietnameseSafeFont, withVietnameseSafeMonoFont } from "../../src/utils/fontStack";

describe("withVietnameseSafeFont", () => {
  it("puts Segoe UI before system-ui so it wins over a CJK system font", () => {
    expect(withVietnameseSafeFont("Inter, system-ui, sans-serif")).toBe('Inter, "Segoe UI", system-ui, sans-serif');
  });

  it("keeps the order of the user's own fonts", () => {
    expect(withVietnameseSafeFont("Open Sans, system-ui, sans-serif")).toBe('Open Sans, "Segoe UI", system-ui, sans-serif');
  });

  it("moves Segoe UI before system-ui, -apple-system and generic families even if already listed after them", () => {
    expect(withVietnameseSafeFont("system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif")).toBe(
      '"Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, Roboto, sans-serif',
    );
    expect(withVietnameseSafeFont("-apple-system, Roboto")).toBe('"Segoe UI", -apple-system, Roboto');
  });

  it("does not duplicate Segoe UI when already correctly placed before generic families", () => {
    expect(withVietnameseSafeFont('Inter, "Segoe UI", system-ui')).toBe('Inter, "Segoe UI", system-ui');
    expect(withVietnameseSafeFont("Inter, Segoe UI, system-ui")).toBe('Inter, "Segoe UI", system-ui');
  });

  it("appends it when there is no generic family", () => {
    expect(withVietnameseSafeFont("Roboto, Helvetica, Arial")).toBe('Roboto, Helvetica, Arial, "Segoe UI"');
  });

  it("leaves an empty value alone", () => {
    expect(withVietnameseSafeFont("")).toBe("");
  });
});

describe("withVietnameseSafeMonoFont", () => {
  it("puts JetBrains Mono before generic monospace", () => {
    expect(withVietnameseSafeMonoFont("Fira Code, Monaco, Consolas, monospace")).toBe(
      'Fira Code, Monaco, Consolas, "JetBrains Mono", monospace',
    );
  });

  it("appends JetBrains Mono when no generic mono family is present", () => {
    expect(withVietnameseSafeMonoFont("Consolas, Menlo")).toBe('Consolas, Menlo, "JetBrains Mono"');
  });

  it("keeps a stack that already lists JetBrains Mono unchanged", () => {
    expect(withVietnameseSafeMonoFont('"JetBrains Mono", Consolas, monospace')).toBe(
      '"JetBrains Mono", Consolas, monospace',
    );
    expect(withVietnameseSafeMonoFont("Fira Code, JetBrains Mono, monospace")).toBe(
      "Fira Code, JetBrains Mono, monospace",
    );
  });

  it("leaves an empty string alone", () => {
    expect(withVietnameseSafeMonoFont("")).toBe("");
  });
});

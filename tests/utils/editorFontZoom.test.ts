import { describe, it, expect } from "vitest";
import {
  clampFontSize,
  zoomInFontSize,
  zoomOutFontSize,
  resetFontSize,
  MIN_EDITOR_FONT_SIZE,
  MAX_EDITOR_FONT_SIZE,
  DEFAULT_EDITOR_FONT_SIZE,
} from "../../src/utils/editorFontZoom";

describe("editorFontZoom", () => {
  it("clamps font size between min and max", () => {
    expect(clampFontSize(5)).toBe(MIN_EDITOR_FONT_SIZE);
    expect(clampFontSize(50)).toBe(MAX_EDITOR_FONT_SIZE);
    expect(clampFontSize(16)).toBe(16);
    expect(clampFontSize(NaN)).toBe(DEFAULT_EDITOR_FONT_SIZE);
  });

  it("zooms in font size by step", () => {
    expect(zoomInFontSize(14)).toBe(15);
    expect(zoomInFontSize(14, 2)).toBe(16);
    expect(zoomInFontSize(MAX_EDITOR_FONT_SIZE)).toBe(MAX_EDITOR_FONT_SIZE);
  });

  it("zooms out font size by step", () => {
    expect(zoomOutFontSize(14)).toBe(13);
    expect(zoomOutFontSize(14, 2)).toBe(12);
    expect(zoomOutFontSize(MIN_EDITOR_FONT_SIZE)).toBe(MIN_EDITOR_FONT_SIZE);
  });

  it("resets font size to default", () => {
    expect(resetFontSize()).toBe(DEFAULT_EDITOR_FONT_SIZE);
    expect(resetFontSize(16)).toBe(16);
  });
});

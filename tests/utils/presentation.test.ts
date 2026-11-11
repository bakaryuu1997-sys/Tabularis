import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRESENTATION_ZOOM,
  HIDDEN_DETAIL,
  PRESENTATION_ZOOM_OPTIONS,
  effectiveSafeMode,
  hideDetail,
  isMaskingActive,
  normalizePresentationZoom,
} from "../../src/utils/presentation";
import type { SafeModeLevel } from "../../src/utils/sqlSafety";

describe("normalizePresentationZoom", () => {
  it.each(PRESENTATION_ZOOM_OPTIONS)("keeps the supported factor %s", (zoom) => {
    expect(normalizePresentationZoom(zoom)).toBe(zoom);
  });

  it("accepts a numeric string from a hand-edited config", () => {
    expect(normalizePresentationZoom("1.5")).toBe(1.5);
  });

  it.each([undefined, null, "", "abc", 0, 1, 2, 9, -1.25, NaN, Infinity])(
    "falls back to the default for %s",
    (value) => {
      expect(normalizePresentationZoom(value)).toBe(DEFAULT_PRESENTATION_ZOOM);
    },
  );
});

describe("hideDetail", () => {
  it("shows the text when not presenting", () => {
    expect(hideDetail("db.example.com:5432", false)).toBe("db.example.com:5432");
  });

  it("replaces any text with dots while presenting, without leaking its length", () => {
    expect(hideDetail("db.example.com:5432", true)).toBe(HIDDEN_DETAIL);
    expect(hideDetail("x", true)).toBe(HIDDEN_DETAIL);
  });

  it("leaves empty text empty so no dots appear where there was nothing", () => {
    expect(hideDetail("", true)).toBe("");
  });
});

describe("effectiveSafeMode", () => {
  const levels: SafeModeLevel[] = ["silent", "alert", "strict", "readonly"];

  it.each(levels)("keeps %s when not presenting", (level) => {
    expect(effectiveSafeMode(level, false)).toBe(level);
  });

  it.each(levels)("forces read-only over %s while presenting", (level) => {
    expect(effectiveSafeMode(level, true)).toBe("readonly");
  });
});

describe("isMaskingActive", () => {
  it("follows the user's own toggle outside presentation mode", () => {
    expect(isMaskingActive(true, false)).toBe(true);
    expect(isMaskingActive(false, false)).toBe(false);
    expect(isMaskingActive(undefined, false)).toBe(false);
    expect(isMaskingActive(null, false)).toBe(false);
  });

  it("is always on while presenting, even if the user's toggle is off", () => {
    expect(isMaskingActive(false, true)).toBe(true);
    expect(isMaskingActive(undefined, true)).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { beforeEach } from "vitest";
import {
  clampSplitRatio,
  splitRatioFromClientX,
  resolveSplitTab,
  resolvePinnedTabs,
  togglePinnedTab,
  loadSplitState,
  saveSplitState,
  MIN_SPLIT_RATIO,
  MAX_SPLIT_RATIO,
  DEFAULT_SPLIT_RATIO,
} from "../../src/utils/splitView";
import type { Tab } from "../../src/types/editor";

const makeTab = (id: string): Tab => ({
  id,
  title: id,
  type: "table",
  query: "",
  result: null,
  error: "",
  executionTime: null,
  page: 1,
  activeTable: id,
  pkColumns: null,
  connectionId: "c1",
});

describe("splitView utils", () => {
  describe("clampSplitRatio", () => {
    it("keeps values inside the allowed band", () => {
      expect(clampSplitRatio(0.5)).toBe(0.5);
      expect(clampSplitRatio(0.1)).toBe(MIN_SPLIT_RATIO);
      expect(clampSplitRatio(0.99)).toBe(MAX_SPLIT_RATIO);
    });
    it("falls back to default for non-finite input", () => {
      expect(clampSplitRatio(NaN)).toBe(DEFAULT_SPLIT_RATIO);
      expect(clampSplitRatio(Infinity)).toBe(DEFAULT_SPLIT_RATIO);
    });
  });

  describe("splitRatioFromClientX", () => {
    it("computes the fraction of the container width", () => {
      expect(splitRatioFromClientX(500, 0, 1000)).toBe(0.5);
      expect(splitRatioFromClientX(300, 100, 400)).toBe(0.5);
    });
    it("clamps extremes", () => {
      expect(splitRatioFromClientX(0, 0, 1000)).toBe(MIN_SPLIT_RATIO);
      expect(splitRatioFromClientX(1000, 0, 1000)).toBe(MAX_SPLIT_RATIO);
    });
    it("guards against zero width", () => {
      expect(splitRatioFromClientX(10, 0, 0)).toBe(DEFAULT_SPLIT_RATIO);
    });
  });

  describe("resolveSplitTab", () => {
    const tabs = [makeTab("a"), makeTab("b")];
    it("returns the matching tab", () => {
      expect(resolveSplitTab(tabs, "b")?.id).toBe("b");
    });
    it("returns null when unset or missing", () => {
      expect(resolveSplitTab(tabs, null)).toBeNull();
      expect(resolveSplitTab(tabs, "zzz")).toBeNull();
    });
  });

  describe("resolvePinnedTabs", () => {
    const tabs = [makeTab("a"), makeTab("b"), makeTab("c")];
    it("keeps only existing tabs in pin order, de-duped", () => {
      expect(resolvePinnedTabs(tabs, ["c", "gone", "a", "c"]).map((t) => t.id)).toEqual([
        "c",
        "a",
      ]);
    });
  });

  describe("togglePinnedTab", () => {
    it("appends and activates a new pin", () => {
      expect(togglePinnedTab(["a"], "a", "b")).toEqual({
        splitTabIds: ["a", "b"],
        activeSplitTabId: "b",
      });
    });
    it("removes an existing pin and re-picks active", () => {
      expect(togglePinnedTab(["a", "b"], "b", "b")).toEqual({
        splitTabIds: ["a"],
        activeSplitTabId: "a",
      });
    });
    it("keeps active when removing a non-active pin", () => {
      expect(togglePinnedTab(["a", "b"], "a", "b")).toEqual({
        splitTabIds: ["a"],
        activeSplitTabId: "a",
      });
    });
  });

  describe("loadSplitState / saveSplitState", () => {
    beforeEach(() => localStorage.clear());

    it("returns defaults when nothing is stored", () => {
      expect(loadSplitState()).toEqual({
        splitTabIds: [],
        activeSplitTabId: null,
        splitRatio: DEFAULT_SPLIT_RATIO,
      });
    });

    it("round-trips a saved state", () => {
      saveSplitState({
        splitTabIds: ["a", "b"],
        activeSplitTabId: "b",
        splitRatio: 0.4,
      });
      expect(loadSplitState()).toEqual({
        splitTabIds: ["a", "b"],
        activeSplitTabId: "b",
        splitRatio: 0.4,
      });
    });

    it("migrates the legacy single-id shape", () => {
      localStorage.setItem(
        "tabularis_split_view",
        JSON.stringify({ splitTabId: "x", splitRatio: 0.4 }),
      );
      expect(loadSplitState()).toEqual({
        splitTabIds: ["x"],
        activeSplitTabId: "x",
        splitRatio: 0.4,
      });
    });

    it("clamps a persisted out-of-range ratio", () => {
      saveSplitState({ splitTabIds: [], activeSplitTabId: null, splitRatio: 0.95 });
      expect(loadSplitState().splitRatio).toBe(MAX_SPLIT_RATIO);
    });

    it("falls back to defaults on corrupt storage", () => {
      localStorage.setItem("tabularis_split_view", "{not json");
      expect(loadSplitState()).toEqual({
        splitTabIds: [],
        activeSplitTabId: null,
        splitRatio: DEFAULT_SPLIT_RATIO,
      });
    });
  });
});

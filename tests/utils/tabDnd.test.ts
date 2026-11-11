import { describe, it, expect, beforeEach } from "vitest";
import {
  dropPositionFromPointer,
  moveRelative,
  pinTabAt,
  reorderPinnedIds,
  reorderTabs,
  resolveTabDrop,
  tabDrag,
} from "../../src/utils/tabDnd";

const ids = (tabs: { id: string }[]) => tabs.map((t) => t.id);
const tabs = ["a", "b", "c", "d"].map((id) => ({ id }));

describe("dropPositionFromPointer", () => {
  it("uses the middle of the target as the boundary", () => {
    const rect = { left: 100, width: 200 };
    expect(dropPositionFromPointer(120, rect)).toBe("before");
    expect(dropPositionFromPointer(199, rect)).toBe("before");
    expect(dropPositionFromPointer(200, rect)).toBe("after");
    expect(dropPositionFromPointer(290, rect)).toBe("after");
  });
  it("handles a zero-width target", () => {
    expect(dropPositionFromPointer(5, { left: 0, width: 0 })).toBe("after");
  });
});

describe("reorderTabs", () => {
  it("moves a tab forward and backward", () => {
    expect(ids(reorderTabs(tabs, "a", "c", "after"))).toEqual(["b", "c", "a", "d"]);
    expect(ids(reorderTabs(tabs, "a", "c", "before"))).toEqual(["b", "a", "c", "d"]);
    expect(ids(reorderTabs(tabs, "d", "a", "before"))).toEqual(["d", "a", "b", "c"]);
    expect(ids(reorderTabs(tabs, "d", "b", "after"))).toEqual(["a", "b", "d", "c"]);
  });

  it("can move to either end", () => {
    expect(ids(reorderTabs(tabs, "a", "d", "after"))).toEqual(["b", "c", "d", "a"]);
    expect(ids(reorderTabs(tabs, "d", "a", "before"))).toEqual(["d", "a", "b", "c"]);
  });

  it("returns the same array when nothing changes", () => {
    expect(reorderTabs(tabs, "b", "b", "before")).toBe(tabs);
    expect(reorderTabs(tabs, "b", "a", "after")).toBe(tabs); // already right after a
    expect(reorderTabs(tabs, "a", "b", "before")).toBe(tabs); // already right before b
    expect(reorderTabs(tabs, "x", "a", "before")).toBe(tabs);
    expect(reorderTabs(tabs, "a", "x", "before")).toBe(tabs);
  });

  it("never mutates its input and keeps every tab exactly once", () => {
    const snapshot = ids(tabs);
    const result = reorderTabs(tabs, "b", "d", "after");
    expect(ids(tabs)).toEqual(snapshot);
    expect(ids(result).sort()).toEqual(snapshot);
  });
});

describe("moveRelative with plain values", () => {
  it("works on arbitrary items", () => {
    expect(moveRelative(["x", "y", "z"], (s) => s, "z", "x", "before")).toEqual(["z", "x", "y"]);
  });
});

describe("pinned tabs", () => {
  it("reorders pinned ids", () => {
    expect(reorderPinnedIds(["a", "b", "c"], "c", "a", "before")).toEqual(["c", "a", "b"]);
  });

  it("pins next to a target, appends otherwise, and never duplicates", () => {
    expect(pinTabAt(["a", "b"], "x", "a", "after")).toEqual(["a", "x", "b"]);
    expect(pinTabAt(["a", "b"], "x", "a", "before")).toEqual(["x", "a", "b"]);
    expect(pinTabAt(["a", "b"], "x", null, "after")).toEqual(["a", "b", "x"]);
    expect(pinTabAt(["a", "b"], "x", "missing", "before")).toEqual(["a", "b", "x"]);
    expect(pinTabAt([], "x", null, "after")).toEqual(["x"]);
    expect(pinTabAt(["a", "b"], "a", null, "after")).toEqual(["a", "b"]);
    expect(pinTabAt(["a", "b", "c"], "c", "a", "before")).toEqual(["c", "a", "b"]);
  });
});

describe("resolveTabDrop", () => {
  it("maps each origin / destination pair to an action", () => {
    expect(resolveTabDrop({ tabId: "a", origin: "left" }, "left", "b", "after")).toEqual({
      kind: "reorder-left", draggedId: "a", targetId: "b", position: "after",
    });
    expect(resolveTabDrop({ tabId: "a", origin: "right" }, "left", "b", "before")).toEqual({
      kind: "unpin-to-left", draggedId: "a", targetId: "b", position: "before",
    });
    expect(resolveTabDrop({ tabId: "a", origin: "right" }, "right", "b", "after")).toEqual({
      kind: "reorder-right", draggedId: "a", targetId: "b", position: "after",
    });
    expect(resolveTabDrop({ tabId: "a", origin: "left" }, "right", null, "after")).toEqual({
      kind: "pin-from-left", draggedId: "a", targetId: null, position: "after",
    });
  });

  it("ignores drops without a drag or without a target where one is needed", () => {
    expect(resolveTabDrop(null, "left", "b", "after")).toEqual({ kind: "none" });
    expect(resolveTabDrop({ tabId: "a", origin: "left" }, "left", null, "after")).toEqual({ kind: "none" });
    expect(resolveTabDrop({ tabId: "a", origin: "right" }, "right", null, "after")).toEqual({ kind: "none" });
  });

  it("allows dropping a pinned tab on empty space of the left strip", () => {
    expect(resolveTabDrop({ tabId: "a", origin: "right" }, "left", null, "after")).toMatchObject({ kind: "unpin-to-left", targetId: null });
  });
});

describe("tabDrag state", () => {
  beforeEach(() => tabDrag.clear());
  it("holds the payload only for the duration of a drag", () => {
    expect(tabDrag.payload).toBeNull();
    tabDrag.start({ tabId: "a", origin: "left" });
    expect(tabDrag.payload).toEqual({ tabId: "a", origin: "left" });
    tabDrag.clear();
    expect(tabDrag.payload).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import { resolveGridScrollKey } from "../../src/utils/dataGrid";

describe("resolveGridScrollKey", () => {
  it("prefers explicit scrollKey over columnVisibilityKey and tableName", () => {
    expect(
      resolveGridScrollKey("split:tab-1", "conn1:public:users", "users", "conn1"),
    ).toBe("split:tab-1");
  });

  it("falls back to columnVisibilityKey when scrollKey is omitted", () => {
    expect(
      resolveGridScrollKey(undefined, "conn1:public:users", "users", "conn1"),
    ).toBe("conn1:public:users");
  });

  it("falls back to connectionId:tableName when both scrollKey and columnVisibilityKey are omitted", () => {
    expect(
      resolveGridScrollKey(undefined, undefined, "orders", "conn2"),
    ).toBe("conn2:orders");
  });

  it("returns undefined when no key source is available", () => {
    expect(resolveGridScrollKey(undefined, undefined, null, null)).toBeUndefined();
    expect(resolveGridScrollKey(undefined, undefined, "users", null)).toBeUndefined();
  });

  it("generates distinct scroll keys for left tab vs split right pane", () => {
    const leftKey = resolveGridScrollKey("tab-123");
    const rightKey = resolveGridScrollKey("split:tab-123");
    expect(leftKey).toBe("tab-123");
    expect(rightKey).toBe("split:tab-123");
    expect(leftKey).not.toBe(rightKey);
  });
});

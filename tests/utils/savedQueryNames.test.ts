import { describe, it, expect } from "vitest";
import { getSavedQueryCopyName } from "../../src/utils/savedQueryNames";

describe("getSavedQueryCopyName", () => {
  it("appends (copy) when the name is not taken", () => {
    expect(getSavedQueryCopyName("Recent Orders", [])).toBe("Recent Orders (copy)");
    expect(getSavedQueryCopyName("Recent Orders", ["Other Query"])).toBe("Recent Orders (copy)");
  });

  it("appends (copy 2) when (copy) exists", () => {
    expect(getSavedQueryCopyName("Recent Orders", ["Recent Orders (copy)"])).toBe(
      "Recent Orders (copy 2)",
    );
  });

  it("increments the counter past existing copies", () => {
    expect(
      getSavedQueryCopyName("Recent Orders", [
        "Recent Orders (copy)",
        "Recent Orders (copy 2)",
        "Recent Orders (copy 3)",
      ]),
    ).toBe("Recent Orders (copy 4)");
  });
});

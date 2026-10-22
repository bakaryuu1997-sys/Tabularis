import { describe, it, expect } from "vitest";
import { profileColumn } from "../../src/utils/columnProfiler";

describe("columnProfiler", () => {
  it("handles empty dataset", () => {
    const res = profileColumn("age", []);
    expect(res.totalRows).toBe(0);
    expect(res.nullCount).toBe(0);
    expect(res.distinctCount).toBe(0);
  });

  it("calculates numeric statistics correctly", () => {
    const rows = [
      { age: 20 },
      { age: 30 },
      { age: 40 },
      { age: null },
      { age: 30 },
    ];
    const res = profileColumn("age", rows);

    expect(res.totalRows).toBe(5);
    expect(res.nullCount).toBe(1);
    expect(res.nullPercentage).toBe(20.0);
    expect(res.distinctCount).toBe(3); // 20, 30, 40
    expect(res.numericStats).toBeDefined();
    expect(res.numericStats?.min).toBe(20);
    expect(res.numericStats?.max).toBe(40);
    expect(res.numericStats?.avg).toBe(30);
    expect(res.numericStats?.sum).toBe(120);

    // Top frequency should be 30 (count 2)
    expect(res.topFrequencies[0].value).toBe("30");
    expect(res.topFrequencies[0].count).toBe(2);
    expect(res.topFrequencies[0].percentage).toBe(40.0);
  });

  it("calculates string statistics correctly", () => {
    const rows = [
      { city: "Hanoi" },
      { city: "Tokyo" },
      { city: "San Francisco" },
      { city: "" },
    ];
    const res = profileColumn("city", rows);

    expect(res.stringStats).toBeDefined();
    expect(res.stringStats?.minLength).toBe(0);
    expect(res.stringStats?.maxLength).toBe(13); // "San Francisco"
    expect(res.stringStats?.emptyCount).toBe(1);
  });

  it("identifies date statistics", () => {
    const rows = [
      { created_at: "2026-01-01 10:00:00" },
      { created_at: "2026-05-15 12:00:00" },
      { created_at: "2026-10-22 08:30:00" },
    ];
    const res = profileColumn("created_at", rows);
    expect(res.inferredType).toBe("date");
    expect(res.dateStats).toBeDefined();
    expect(res.dateStats?.earliest).toContain("2026-01-01");
    expect(res.dateStats?.latest).toContain("2026-10-22");
  });
});

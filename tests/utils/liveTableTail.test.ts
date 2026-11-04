import { describe, it, expect } from "vitest";
import {
  buildMaxKeyQuery,
  buildNewKeysQuery,
  computeRowSignature,
  detectRowDeltas,
  MAX_POLL_DELAY_MS,
  nextPollDelayMs,
  normalizeLiveTailInterval,
  resolveKeysetTarget,
  toKeysetLiteral,
} from "../../src/utils/liveTableTail";

describe("computeRowSignature", () => {
  it("is stable for equal rows and differs for different rows", () => {
    expect(computeRowSignature([1, "Alice"])).toBe(computeRowSignature([1, "Alice"]));
    expect(computeRowSignature([1, "Alice"])).not.toBe(computeRowSignature([2, "Bob"]));
  });

  it("uses only the primary-key columns when given", () => {
    expect(computeRowSignature([101, "Alice"], [0])).toBe(computeRowSignature([101, "Renamed"], [0]));
  });

  it("does not collide on separator characters or objects", () => {
    expect(computeRowSignature(["a|b"])).not.toBe(computeRowSignature(["a", "b"]));
    expect(computeRowSignature([{ a: 1 }])).not.toBe(computeRowSignature([{ a: 2 }]));
    // SQL NULL and the text "null" are different values.
    expect(computeRowSignature([null])).not.toBe(computeRowSignature(["null"]));
  });
});

describe("detectRowDeltas with a primary key", () => {
  const before = [
    [1, "a", 10],
    [2, "b", 20],
  ];

  it("reports nothing for identical data", () => {
    expect(detectRowDeltas(before, [...before], [0]).hasChanges).toBe(false);
  });

  it("separates new, updated and removed rows", () => {
    const after = [
      [3, "c", 30],
      [1, "a", 99],
    ];
    const result = detectRowDeltas(before, after, [0]);
    expect(result.newRowIndices).toEqual([0]);
    expect(result.updatedRowIndices).toEqual([1]);
    expect(result.removedRowCount).toBe(1);
    expect(result.newRowCount).toBe(1);
  });

  it("does not count an edited row as a new row", () => {
    const result = detectRowDeltas(before, [[1, "a", 11], [2, "b", 20]], [0]);
    expect(result.newRowCount).toBe(0);
    expect(result.updatedRowIndices).toEqual([0]);
  });

  it("ignores an empty previous snapshot (first load)", () => {
    expect(detectRowDeltas([], before, [0]).hasChanges).toBe(false);
  });
});

describe("detectRowDeltas without a primary key", () => {
  it("counts duplicate rows correctly", () => {
    const before = [[1, "x"], [1, "x"]];
    expect(detectRowDeltas(before, [[1, "x"], [1, "x"], [1, "x"]]).newRowCount).toBe(1);
    expect(detectRowDeltas(before, [[1, "x"]]).removedRowCount).toBe(1);
  });

  it("treats an edited row as one removal plus one new row", () => {
    const result = detectRowDeltas([[1, "a"]], [[1, "b"]]);
    expect(result.newRowCount).toBe(1);
    expect(result.removedRowCount).toBe(1);
  });
});

describe("polling helpers", () => {
  it("normalizes the interval", () => {
    expect(normalizeLiveTailInterval(NaN)).toBe(3);
    expect(normalizeLiveTailInterval(0)).toBe(3);
    expect(normalizeLiveTailInterval(500)).toBe(60);
    expect(normalizeLiveTailInterval(4.6)).toBe(5);
  });

  it("backs off exponentially and caps at one minute", () => {
    expect(nextPollDelayMs(2, 0)).toBe(2000);
    expect(nextPollDelayMs(2, 1)).toBe(4000);
    expect(nextPollDelayMs(2, 3)).toBe(16000);
    expect(nextPollDelayMs(10, 9)).toBe(MAX_POLL_DELAY_MS);
    expect(nextPollDelayMs(2, -4)).toBe(2000);
  });
});

describe("keyset probe", () => {
  const pg = { id: "postgres", identifier_quote: '"' } as never;
  const mysql = { id: "mysql", identifier_quote: "`" } as never;

  it("only targets table tabs with exactly one primary-key column", () => {
    const tab = { type: "table", activeTable: "orders", pkColumns: ["id"], schema: "public" };
    expect(resolveKeysetTarget(tab)).toEqual({ table: "orders", schema: "public", pkColumn: "id" });
    expect(resolveKeysetTarget({ ...tab, pkColumns: ["a", "b"] })).toBeNull();
    expect(resolveKeysetTarget({ ...tab, pkColumns: null })).toBeNull();
    expect(resolveKeysetTarget({ ...tab, type: "console" })).toBeNull();
    expect(resolveKeysetTarget({ ...tab, activeTable: null })).toBeNull();
    expect(resolveKeysetTarget(undefined)).toBeNull();
  });

  it("accepts only plain integer key values", () => {
    expect(toKeysetLiteral(42)).toBe("42");
    expect(toKeysetLiteral(-7)).toBe("-7");
    expect(toKeysetLiteral("9007199254740993")).toBe("9007199254740993");
    expect(toKeysetLiteral(3n)).toBe("3");
    expect(toKeysetLiteral(1.5)).toBeNull();
    expect(toKeysetLiteral("1; DROP TABLE t")).toBeNull();
    expect(toKeysetLiteral("abc")).toBeNull();
    expect(toKeysetLiteral(null)).toBeNull();
    expect(toKeysetLiteral(Number.MAX_SAFE_INTEGER + 2)).toBeNull();
  });

  it("builds driver-quoted queries", () => {
    const target = { table: "my table", schema: "sales", pkColumn: 'i"d' };
    expect(buildMaxKeyQuery(target, pg)).toBe('SELECT MAX("i""d") AS tail_max FROM "sales"."my table"');
    expect(buildNewKeysQuery(target, pg, "10")).toBe(
      'SELECT "i""d" FROM "sales"."my table" WHERE "i""d" > 10 ORDER BY "i""d" ASC',
    );
    expect(buildNewKeysQuery({ table: "t", schema: null, pkColumn: "id" }, mysql, null)).toBe(
      "SELECT `id` FROM `t` ORDER BY `id` ASC",
    );
  });
});

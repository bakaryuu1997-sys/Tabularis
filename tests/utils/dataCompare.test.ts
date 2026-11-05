import { describe, it, expect } from "vitest";
import {
  cellValuesEqual,
  compareTableData,
  DataCompareError,
  isIdentical,
  rowKey,
  type TableData,
} from "../../src/utils/dataCompare";

const table = (columns: string[], rows: unknown[][]): TableData => ({ columns, rows });

describe("cellValuesEqual", () => {
  it("treats NULL and undefined as equal, and different from everything else", () => {
    expect(cellValuesEqual(null, undefined)).toBe(true);
    expect(cellValuesEqual(null, "")).toBe(false);
    expect(cellValuesEqual(null, 0)).toBe(false);
    expect(cellValuesEqual("", undefined)).toBe(false);
  });

  it("matches a number with the same number written as text", () => {
    expect(cellValuesEqual(5, "5")).toBe(true);
    expect(cellValuesEqual("1.50", 1.5)).toBe(true);
    expect(cellValuesEqual(5, "6")).toBe(false);
  });

  it("compares numeric text with numbers by value but rejects non-numeric text", () => {
    expect(cellValuesEqual("01", 1)).toBe(true);
    expect(cellValuesEqual("01", "1")).toBe(false); // two strings must match exactly
    expect(cellValuesEqual("0x1", 1)).toBe(false);
    expect(cellValuesEqual("abc", 0)).toBe(false);
  });

  it("matches booleans with 1 and 0 but not with other values", () => {
    expect(cellValuesEqual(true, 1)).toBe(true);
    expect(cellValuesEqual(false, "0")).toBe(true);
    expect(cellValuesEqual(true, 2)).toBe(false);
    expect(cellValuesEqual(true, "yes")).toBe(false);
    expect(cellValuesEqual(true, null)).toBe(false);
  });

  it("compares objects structurally regardless of key order", () => {
    expect(cellValuesEqual({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toBe(true);
    expect(cellValuesEqual({ a: 1 }, { a: 2 })).toBe(false);
  });

  it("compares strings exactly", () => {
    expect(cellValuesEqual("A", "a")).toBe(false);
    expect(cellValuesEqual("x ", "x")).toBe(false);
  });
});

describe("compareTableData", () => {
  const cols = ["id", "name", "age"];

  it("reports identical tables", () => {
    const a = table(cols, [[1, "Ann", 30], [2, "Bob", 40]]);
    const result = compareTableData(a, table(cols, [[2, "Bob", 40], [1, "Ann", 30]]), { keyColumns: ["id"] });
    expect(isIdentical(result)).toBe(true);
    expect(result.identicalCount).toBe(2);
  });

  it("finds missing, extra and changed rows", () => {
    const source = table(cols, [[1, "Ann", 30], [2, "Bob", 41], [3, "Cy", 20]]);
    const target = table(cols, [[1, "Ann", 30], [2, "Bob", 40], [4, "Dee", 50]]);
    const result = compareTableData(source, target, { keyColumns: ["id"] });

    expect(result.onlyInSource).toEqual([{ id: 3, name: "Cy", age: 20 }]);
    expect(result.onlyInTarget).toEqual([{ id: 4, name: "Dee", age: 50 }]);
    expect(result.changed).toHaveLength(1);
    expect(result.changed[0].key).toEqual({ id: 2 });
    expect(result.changed[0].changes).toEqual([{ column: "age", source: 41, target: 40 }]);
    expect(result.identicalCount).toBe(1);
    expect(isIdentical(result)).toBe(false);
  });

  it("supports composite keys", () => {
    const source = table(["a", "b", "v"], [[1, 1, "x"], [1, 2, "y"]]);
    const target = table(["a", "b", "v"], [[1, 1, "x"], [1, 2, "z"]]);
    const result = compareTableData(source, target, { keyColumns: ["a", "b"] });
    expect(result.changed.map((c) => c.key)).toEqual([{ a: 1, b: 2 }]);
  });

  it("matches keys across numeric text and numbers", () => {
    const result = compareTableData(table(["id", "v"], [[1, "x"]]), table(["id", "v"], [["1", "x"]]), { keyColumns: ["id"] });
    expect(result.identicalCount).toBe(1);
    expect(result.onlyInSource).toEqual([]);
  });

  it("only compares columns that exist on both sides and reports the rest", () => {
    const source = table(["id", "name", "extra_s"], [[1, "Ann", "s"]]);
    const target = table(["id", "name", "extra_t"], [[1, "Bob", "t"]]);
    const result = compareTableData(source, target, { keyColumns: ["id"] });
    expect(result.comparedColumns).toEqual(["name"]);
    expect(result.sourceOnlyColumns).toEqual(["extra_s"]);
    expect(result.targetOnlyColumns).toEqual(["extra_t"]);
    expect(result.changed[0].changes).toEqual([{ column: "name", source: "Ann", target: "Bob" }]);
  });

  it("skips ignored columns", () => {
    const source = table(["id", "name", "updated_at"], [[1, "Ann", "2026-01-01"]]);
    const target = table(["id", "name", "updated_at"], [[1, "Ann", "2026-02-02"]]);
    const result = compareTableData(source, target, { keyColumns: ["id"], ignoreColumns: ["updated_at"] });
    expect(isIdentical(result)).toBe(true);
    expect(result.comparedColumns).toEqual(["name"]);
  });

  it("treats NULL equal to NULL when comparing cells", () => {
    const result = compareTableData(table(["id", "v"], [[1, null]]), table(["id", "v"], [[1, null]]), { keyColumns: ["id"] });
    expect(isIdentical(result)).toBe(true);
  });

  it("reports duplicate keys and uses the first occurrence", () => {
    const source = table(["id", "v"], [[1, "a"], [1, "b"]]);
    const target = table(["id", "v"], [[1, "a"]]);
    const result = compareTableData(source, target, { keyColumns: ["id"] });
    expect(result.duplicateKeys).toEqual([{ side: "source", key: { id: 1 } }]);
    expect(isIdentical(result)).toBe(true);
  });

  it("handles empty tables", () => {
    const empty = table(["id"], []);
    const full = table(["id"], [[1]]);
    expect(compareTableData(empty, full, { keyColumns: ["id"] }).onlyInTarget).toHaveLength(1);
    expect(compareTableData(full, empty, { keyColumns: ["id"] }).onlyInSource).toHaveLength(1);
    expect(isIdentical(compareTableData(empty, empty, { keyColumns: ["id"] }))).toBe(true);
  });

  it("rejects missing or empty key columns", () => {
    const t = table(["id"], []);
    expect(() => compareTableData(t, t, { keyColumns: [] })).toThrow(DataCompareError);
    try {
      compareTableData(t, table(["other"], []), { keyColumns: ["id"] });
      expect.unreachable();
    } catch (e) {
      expect((e as DataCompareError).code).toBe("key_column_missing");
      expect((e as DataCompareError).columns).toEqual(["id"]);
    }
  });

  it("handles a few thousand rows quickly", () => {
    const rows = Array.from({ length: 20000 }, (_, i) => [i, `n${i}`]);
    const changedRows = rows.map((r) => (r[0] === 777 ? [777, "changed"] : r));
    const started = Date.now();
    const result = compareTableData(table(["id", "n"], rows), table(["id", "n"], changedRows), { keyColumns: ["id"] });
    expect(result.changed).toHaveLength(1);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe("rowKey", () => {
  it("is order-sensitive to the key columns given and treats missing as null", () => {
    expect(rowKey({ a: 1, b: 2 }, ["a", "b"])).not.toBe(rowKey({ a: 1, b: 2 }, ["b", "a"]));
    expect(rowKey({ a: 1 }, ["a", "b"])).toBe(rowKey({ a: 1, b: null }, ["a", "b"]));
  });
});

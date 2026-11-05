import { describe, it, expect, vi } from "vitest";
import { buildTableSelect, loadTableRows } from "../../src/utils/dataCompareFetch";

const pg = { id: "postgres", identifier_quote: '"' } as never;
const mysql = { id: "mysql", identifier_quote: "`" } as never;

describe("buildTableSelect", () => {
  it("orders by the key columns with driver quoting", () => {
    expect(buildTableSelect("orders", "public", ["id", "line"], pg)).toBe(
      'SELECT * FROM "public"."orders" ORDER BY "id", "line"',
    );
    expect(buildTableSelect("orders", null, ["id"], mysql)).toBe("SELECT * FROM `orders` ORDER BY `id`");
  });

  it("escapes quotes in names and omits ORDER BY without keys", () => {
    expect(buildTableSelect('we"ird', null, [], pg)).toBe('SELECT * FROM "we""ird"');
  });
});

describe("loadTableRows", () => {
  const pageOf = (start: number, count: number) => ({
    columns: ["id"],
    rows: Array.from({ length: count }, (_, i) => [start + i]),
  });

  it("reads pages until a short page and is not truncated", async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce(pageOf(0, 3))
      .mockResolvedValueOnce(pageOf(3, 3))
      .mockResolvedValueOnce(pageOf(6, 1));
    const result = await loadTableRows(execute, "SELECT 1", { pageSize: 3, maxRows: 100 });
    expect(result.rows).toHaveLength(7);
    expect(result.truncated).toBe(false);
    expect(execute.mock.calls.map((c) => c[2])).toEqual([1, 2, 3]);
    expect(execute).toHaveBeenCalledWith("SELECT 1", 3, 1);
  });

  it("stops at maxRows and reports truncation", async () => {
    const execute = vi.fn().mockImplementation(async (_q: string, limit: number, page: number) => pageOf((page - 1) * limit, limit));
    const result = await loadTableRows(execute, "q", { pageSize: 5, maxRows: 12 });
    expect(result.rows).toHaveLength(12);
    expect(result.truncated).toBe(true);
  });

  it("is not truncated when the table has exactly maxRows rows and then ends", async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce(pageOf(0, 5))
      .mockResolvedValueOnce(pageOf(5, 5))
      .mockResolvedValueOnce(pageOf(10, 0));
    const result = await loadTableRows(execute, "q", { pageSize: 5, maxRows: 10 });
    expect(result.rows).toHaveLength(10);
    expect(result.truncated).toBe(false);
  });

  it("handles an empty table and keeps the column names", async () => {
    const execute = vi.fn().mockResolvedValue({ columns: ["id", "name"], rows: [] });
    const result = await loadTableRows(execute, "q");
    expect(result).toEqual({ columns: ["id", "name"], rows: [], truncated: false });
  });

  it("propagates query failures", async () => {
    const execute = vi.fn().mockRejectedValue(new Error("permission denied"));
    await expect(loadTableRows(execute, "q")).rejects.toThrow("permission denied");
  });
});

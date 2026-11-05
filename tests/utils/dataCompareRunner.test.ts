import { describe, it, expect, vi } from "vitest";
import { runDataCompare, type QueryExecutor } from "../../src/utils/dataCompareRunner";
import type { TableData } from "../../src/utils/dataCompare";

const pg = { id: "postgres", identifier_quote: '"' } as never;
const mysql = { id: "mysql", identifier_quote: "`" } as never;

function executorFor(tables: Record<string, TableData>): QueryExecutor {
  return vi.fn(async (connectionId, _query, limit, page) => {
    const data = tables[connectionId];
    const start = (page - 1) * limit;
    return { columns: data.columns, rows: data.rows.slice(start, start + limit) };
  });
}

const sides = {
  source: { connectionId: "src", table: "people", schema: "public", driver: pg },
  target: { connectionId: "tgt", table: "people", schema: null, driver: mysql },
};

describe("runDataCompare", () => {
  it("compares two connections and quotes each query for its own driver", async () => {
    const execute = executorFor({
      src: { columns: ["id", "name"], rows: [[1, "Ann"], [2, "Bob"]] },
      tgt: { columns: ["id", "name"], rows: [[1, "Ann"], [3, "Cy"]] },
    });
    const run = await runDataCompare(execute, { ...sides, keyColumns: ["id"] });

    expect(run.result.onlyInSource).toEqual([{ id: 2, name: "Bob" }]);
    expect(run.result.onlyInTarget).toEqual([{ id: 3, name: "Cy" }]);
    expect(run.canGenerateSql).toBe(true);
    expect(run.sourceRowCount).toBe(2);

    const queries = vi.mocked(execute).mock.calls.map((c) => [c[0], c[1]]);
    expect(queries).toContainEqual(["src", 'SELECT * FROM "public"."people" ORDER BY "id"']);
    expect(queries).toContainEqual(["tgt", "SELECT * FROM `people` ORDER BY `id`"]);
  });

  it("passes each side's schema to the executor", async () => {
    const execute = executorFor({ src: { columns: ["id"], rows: [] }, tgt: { columns: ["id"], rows: [] } });
    await runDataCompare(execute, { ...sides, keyColumns: ["id"] });
    const schemas = Object.fromEntries(vi.mocked(execute).mock.calls.map((c) => [c[0], c[4]]));
    expect(schemas).toEqual({ src: "public", tgt: null });
  });

  it("refuses to offer SQL when either side was read only partially", async () => {
    const big: TableData = { columns: ["id"], rows: Array.from({ length: 30 }, (_, i) => [i]) };
    const execute = executorFor({ src: big, tgt: { columns: ["id"], rows: [[0]] } });
    const run = await runDataCompare(execute, { ...sides, keyColumns: ["id"], pageSize: 10, maxRows: 15 });
    expect(run.sourceTruncated).toBe(true);
    expect(run.targetTruncated).toBe(false);
    expect(run.canGenerateSql).toBe(false);
    expect(run.sourceRowCount).toBe(15);
  });

  it("surfaces a missing key column", async () => {
    const execute = executorFor({
      src: { columns: ["id"], rows: [] },
      tgt: { columns: ["other"], rows: [] },
    });
    await expect(runDataCompare(execute, { ...sides, keyColumns: ["id"] })).rejects.toMatchObject({
      code: "key_column_missing",
    });
  });

  it("propagates a failing query", async () => {
    const execute: QueryExecutor = vi.fn().mockRejectedValue(new Error("relation does not exist"));
    await expect(runDataCompare(execute, { ...sides, keyColumns: ["id"] })).rejects.toThrow("relation does not exist");
  });
});

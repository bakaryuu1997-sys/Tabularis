import { describe, it, expect } from "vitest";
import { buildSyncScript, toSqlLiteral, UnsupportedValueError } from "../../src/utils/dataSyncSql";
import { compareTableData, type TableData } from "../../src/utils/dataCompare";

const pg = { id: "postgres", identifier_quote: '"' } as never;
const mysql = { id: "mysql", identifier_quote: "`" } as never;
const table = (columns: string[], rows: unknown[][]): TableData => ({ columns, rows });

describe("toSqlLiteral", () => {
  it("writes NULL, numbers and booleans unquoted", () => {
    expect(toSqlLiteral(null, false)).toBe("NULL");
    expect(toSqlLiteral(undefined, false)).toBe("NULL");
    expect(toSqlLiteral(42, false)).toBe("42");
    expect(toSqlLiteral(-1.5, false)).toBe("-1.5");
    expect(toSqlLiteral(true, false)).toBe("TRUE");
    expect(toSqlLiteral(9007199254740993n, false)).toBe("9007199254740993");
  });

  it("doubles single quotes so a value can never end the string", () => {
    expect(toSqlLiteral("O'Brien", false)).toBe("'O''Brien'");
    expect(toSqlLiteral("'; DROP TABLE users; --", false)).toBe("'''; DROP TABLE users; --'");
  });

  it("only doubles backslashes for engines that treat them as escapes", () => {
    expect(toSqlLiteral("a\\b", false)).toBe("'a\\b'");
    expect(toSqlLiteral("a\\b", true)).toBe("'a\\\\b'");
    // A trailing backslash must not escape the closing quote on MySQL.
    expect(toSqlLiteral("end\\", true)).toBe("'end\\\\'");
  });

  it("serializes objects as JSON text", () => {
    expect(toSqlLiteral({ a: "it's" }, false)).toBe(`'{"a":"it''s"}'`);
  });

  it("refuses values that cannot be written safely", () => {
    expect(() => toSqlLiteral("a\0b", false)).toThrow(UnsupportedValueError);
    expect(() => toSqlLiteral(NaN, false)).toThrow(UnsupportedValueError);
    expect(() => toSqlLiteral(Infinity, false)).toThrow(UnsupportedValueError);
  });
});

describe("buildSyncScript", () => {
  const cols = ["id", "name", "age"];
  const source = table(cols, [[1, "Ann", 30], [2, "Bob", 41], [3, "O'Cy", null]]);
  const target = table(cols, [[1, "Ann", 30], [2, "Bob", 40], [4, "Dee", 50]]);
  const result = compareTableData(source, target, { keyColumns: ["id"] });

  it("generates insert and update statements, and no deletes by default", () => {
    const script = buildSyncScript(result, { table: "people", driver: pg });
    expect(script.sql.split("\n")).toEqual([
      `INSERT INTO "people" ("id", "name", "age") VALUES (3, 'O''Cy', NULL);`,
      `UPDATE "people" SET "age" = 41 WHERE "id" = 2;`,
    ]);
    expect(script.counts).toEqual({ inserts: 1, updates: 1, deletes: 0 });
    expect(script.sql).not.toContain("DELETE");
  });

  it("adds deletes only when asked", () => {
    const script = buildSyncScript(result, { table: "people", driver: pg, includeDeletes: true });
    expect(script.sql).toContain(`DELETE FROM "people" WHERE "id" = 4;`);
    expect(script.counts.deletes).toBe(1);
  });

  it("can restrict the script to selected statement kinds", () => {
    expect(buildSyncScript(result, { table: "t", driver: pg, includeInserts: false }).sql).not.toContain("INSERT");
    expect(buildSyncScript(result, { table: "t", driver: pg, includeUpdates: false }).sql).not.toContain("UPDATE");
  });

  it("qualifies the table with the schema and uses the driver's quoting", () => {
    expect(buildSyncScript(result, { table: "people", schema: "hr", driver: pg }).sql).toContain(`INSERT INTO "hr"."people"`);
    expect(buildSyncScript(result, { table: "people", schema: "hr", driver: mysql }).sql).toContain("INSERT INTO `hr`.`people`");
  });

  it("matches rows by every column of a composite key and handles NULL keys", () => {
    const s = table(["a", "b", "v"], [[1, null, "new"]]);
    const t = table(["a", "b", "v"], [[1, null, "old"]]);
    const r = compareTableData(s, t, { keyColumns: ["a", "b"] });
    expect(buildSyncScript(r, { table: "x", driver: pg }).sql).toBe(
      `UPDATE "x" SET "v" = 'new' WHERE "a" = 1 AND "b" IS NULL;`,
    );
  });

  it("only updates the columns that changed", () => {
    const s = table(["id", "a", "b"], [[1, "x", "same"]]);
    const t = table(["id", "a", "b"], [[1, "y", "same"]]);
    const sql = buildSyncScript(compareTableData(s, t, { keyColumns: ["id"] }), { table: "t", driver: pg }).sql;
    expect(sql).toBe(`UPDATE "t" SET "a" = 'x' WHERE "id" = 1;`);
  });

  it("skips a row it cannot write safely instead of emitting broken SQL", () => {
    const s = table(["id", "v"], [[1, "bad\0value"], [2, "ok"]]);
    const t = table(["id", "v"], []);
    const script = buildSyncScript(compareTableData(s, t, { keyColumns: ["id"] }), { table: "t", driver: pg });
    expect(script.statementCount).toBe(1);
    expect(script.sql).toContain("'ok'");
    expect(script.skipped).toEqual([expect.objectContaining({ statement: "insert", key: { id: 1 } })]);
  });

  it("produces an empty script for identical tables", () => {
    const same = compareTableData(source, source, { keyColumns: ["id"] });
    const script = buildSyncScript(same, { table: "t", driver: pg, includeDeletes: true });
    expect(script.sql).toBe("");
    expect(script.statementCount).toBe(0);
  });
});

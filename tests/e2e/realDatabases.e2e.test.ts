/**
 * End-to-end checks of the SQL this app generates, executed against real PostgreSQL and MySQL
 * servers running in Docker. Skipped unless TAB_E2E=1:
 *
 *   docker run -d --name tab-e2e-pg -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=e2e postgres:16-alpine
 *   docker run -d --name tab-e2e-mysql -e MYSQL_ROOT_PASSWORD=pw -e MYSQL_DATABASE=e2e mysql:8.0
 *   TAB_E2E=1 TAB_E2E_MYSQL_PASSWORD=pw pnpm exec vitest run tests/e2e
 */
import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { compareTableData, isIdentical, type TableData } from "../../src/utils/dataCompare";
import { buildSyncScript } from "../../src/utils/dataSyncSql";
import { buildMaxKeyQuery, buildNewKeysQuery } from "../../src/utils/liveTableTail";

const enabled = process.env.TAB_E2E === "1";
const PG_CONTAINER = process.env.TAB_E2E_PG_CONTAINER ?? "tab-e2e-pg";
const MYSQL_CONTAINER = process.env.TAB_E2E_MYSQL_CONTAINER ?? "tab-e2e-mysql";
const MYSQL_PASSWORD = process.env.TAB_E2E_MYSQL_PASSWORD ?? "";

interface Engine {
  name: string;
  driver: { id: string; identifier_quote: string };
  /** Runs SQL and returns stdout. */
  run: (sql: string) => string;
  /** Hex-based string literal that does not depend on any quoting rules under test. */
  text: (value: string | null) => string;
  jsonType: string;
  boolType: string;
  jsonCast: (json: string | null) => string;
  /** SELECT that returns the table as a JSON array of row objects. */
  readAll: (table: string) => string;
}

const hex = (s: string) => Buffer.from(s, "utf8").toString("hex");

const postgres: Engine = {
  name: "PostgreSQL",
  driver: { id: "postgres", identifier_quote: '"' },
  run: (sql) =>
    execFileSync("docker", ["exec", "-i", PG_CONTAINER, "psql", "-U", "postgres", "-d", "e2e", "-v", "ON_ERROR_STOP=1", "-At"], {
      input: sql,
      encoding: "utf8",
    }),
  text: (v) => (v === null ? "NULL" : `convert_from(decode('${hex(v)}','hex'),'UTF8')`),
  jsonType: "JSONB",
  boolType: "BOOLEAN",
  jsonCast: (j) => (j === null ? "NULL" : `convert_from(decode('${hex(j)}','hex'),'UTF8')::jsonb`),
  readAll: (t) => `SELECT COALESCE(json_agg(x), '[]'::json) FROM (SELECT * FROM "${t}") x;`,
};

const mysql: Engine = {
  name: "MySQL",
  driver: { id: "mysql", identifier_quote: "`" },
  run: (sql) =>
    execFileSync(
      "docker",
      ["exec", "-i", MYSQL_CONTAINER, "mysql", "-uroot", `-p${MYSQL_PASSWORD}`, "--default-character-set=utf8mb4", "-N", "-B", "-r", "e2e"],
      { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    ),
  text: (v) => (v === null ? "NULL" : `CONVERT(X'${hex(v)}' USING utf8mb4)`),
  jsonType: "JSON",
  boolType: "BOOLEAN",
  jsonCast: (j) => (j === null ? "NULL" : `CAST(CONVERT(X'${hex(j)}' USING utf8mb4) AS JSON)`),
  readAll: (t) =>
    `SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT('id', id, 'name', name, 'note', note, 'active', active, 'score', score, 'meta', meta)), JSON_ARRAY()) FROM \`${t}\`;`,
};

interface Row {
  id: number;
  name: string | null;
  note: string | null;
  active: boolean | null;
  score: string | null;
  meta: string | null;
}

const NASTY = {
  quote: `O'Brien said "hi"; DROP TABLE x; --`,
  backslash: "C:\\temp\\new\\table\\",
  multiline: "line1\nline2\ttabbed",
  unicode: "Nguyễn Văn Á — 日本語のテキスト 🚀",
  trailingBackslash: "ends with a backslash\\",
};

const SOURCE: Row[] = [
  { id: 1, name: "Ann", note: NASTY.quote, active: true, score: "10.50", meta: '{"a":1}' },
  { id: 2, name: "Bob", note: NASTY.backslash, active: false, score: "0.00", meta: '{"b":[1,2]}' },
  { id: 3, name: NASTY.unicode, note: NASTY.multiline, active: true, score: "99999999.99", meta: null },
  { id: 4, name: "NullGuy", note: null, active: null, score: null, meta: null },
  { id: 5, name: "Trailing", note: NASTY.trailingBackslash, active: true, score: "1.25", meta: '{"k":"it\'s"}' },
];

// Target differs on purpose: row 1 identical, 2 and 5 changed, 3 and 4 missing, 6 extra.
const TARGET: Row[] = [
  SOURCE[0],
  { ...SOURCE[1], name: "Bobby", score: "5.00" },
  { ...SOURCE[4], note: "different" },
  { id: 6, name: "Extra", note: "only in target", active: true, score: "3.00", meta: null },
];

function createAndFill(engine: Engine, table: string, rows: Row[]): void {
  engine.run(`DROP TABLE IF EXISTS \`${table}\`;`.replace(/`/g, engine.driver.identifier_quote));
  const q = engine.driver.identifier_quote;
  engine.run(
    `CREATE TABLE ${q}${table}${q} (id INT PRIMARY KEY, name VARCHAR(200), note TEXT, active ${engine.boolType}, score DECIMAL(12,2), meta ${engine.jsonType});`,
  );
  for (const r of rows) {
    const values = [
      String(r.id),
      engine.text(r.name),
      engine.text(r.note),
      r.active === null ? "NULL" : r.active ? "TRUE" : "FALSE",
      r.score === null ? "NULL" : r.score,
      engine.jsonCast(r.meta),
    ].join(", ");
    engine.run(`INSERT INTO ${q}${table}${q} (id, name, note, active, score, meta) VALUES (${values});`);
  }
}

function readTable(engine: Engine, table: string): TableData {
  const out = engine.run(engine.readAll(table)).trim();
  const objects = JSON.parse(out) as Record<string, unknown>[];
  const columns = ["id", "name", "note", "active", "score", "meta"];
  return {
    columns,
    rows: objects.map((o) =>
      columns.map((c) => {
        const v = o[c];
        // MySQL returns JSON columns as nested JSON; PostgreSQL does too. Compare them structurally.
        return v === undefined ? null : v;
      }),
    ),
  };
}

describe.skipIf(!enabled).each([postgres, mysql])("real $name", (engine) => {
  beforeAll(() => {
    createAndFill(engine, "people_src", SOURCE);
    createAndFill(engine, "people_tgt", TARGET);
  });

  it("finds exactly the differences that were planted", () => {
    const result = compareTableData(readTable(engine, "people_src"), readTable(engine, "people_tgt"), { keyColumns: ["id"] });
    expect(result.onlyInSource.map((r) => r.id).sort()).toEqual([3, 4]);
    expect(result.changed.map((c) => c.key.id).sort()).toEqual([2, 5]);
    expect(result.onlyInTarget.map((r) => r.id)).toEqual([6]);
    expect(result.identicalCount).toBe(1);
  });

  it("generates a script that really makes the target identical, including hostile strings", () => {
    const source = readTable(engine, "people_src");
    const result = compareTableData(source, readTable(engine, "people_tgt"), { keyColumns: ["id"] });
    const script = buildSyncScript(result, { table: "people_tgt", driver: engine.driver, includeDeletes: true });

    expect(script.skipped).toEqual([]);
    expect(script.counts).toEqual({ inserts: 2, updates: 2, deletes: 1 });
    engine.run(script.sql);

    const after = compareTableData(source, readTable(engine, "people_tgt"), { keyColumns: ["id"] });
    expect(isIdentical(after)).toBe(true);
    expect(after.identicalCount).toBe(5);

    // The nasty values must have arrived byte for byte, not merely "compared equal".
    const stored = readTable(engine, "people_tgt");
    const byId = new Map(stored.rows.map((r) => [r[0], r]));
    expect(byId.get(1)![2]).toBe(NASTY.quote);
    expect(byId.get(2)![2]).toBe(NASTY.backslash);
    expect(byId.get(3)![1]).toBe(NASTY.unicode);
    expect(byId.get(3)![2]).toBe(NASTY.multiline);
    expect(byId.get(5)![2]).toBe(NASTY.trailingBackslash);
  });

  it("does not delete anything unless asked to", () => {
    createAndFill(engine, "people_tgt2", [...TARGET]);
    const result = compareTableData(readTable(engine, "people_src"), readTable(engine, "people_tgt2"), { keyColumns: ["id"] });
    engine.run(buildSyncScript(result, { table: "people_tgt2", driver: engine.driver }).sql);
    const ids = readTable(engine, "people_tgt2").rows.map((r) => r[0]);
    expect(ids).toContain(6);
  });

  it("runs the Live Tail probe queries and sees only newly inserted keys", () => {
    const target = { table: "people_src", schema: null, pkColumn: "id" };
    const max = engine.run(buildMaxKeyQuery(target, engine.driver)).trim();
    expect(max).toBe("5");

    const q = engine.driver.identifier_quote;
    engine.run(`INSERT INTO ${q}people_src${q} (id, name) VALUES (8, 'new8'), (9, 'new9');`);
    const keys = engine.run(buildNewKeysQuery(target, engine.driver, max)).trim().split(/\s+/);
    expect(keys).toEqual(["8", "9"]);

    const none = engine.run(buildNewKeysQuery(target, engine.driver, "9")).trim();
    expect(none).toBe("");
  });
});

describe.skipIf(!process.env.TAB_E2E_XLSX_OUT)("XLSX export read by an independent reader", () => {
  it("writes a workbook for openpyxl / Excel-compatible readers", async () => {
    const { writeFileSync } = await import("node:fs");
    const { buildXlsx } = await import("../../src/utils/xlsxWriter");
    const bytes = buildXlsx({
      name: "Khách hàng",
      columns: ["id", "name", "formula", "active", "score"],
      rows: [
        [1, "Nguyễn Văn Á 日本語", "=1+1", true, 10.5],
        [2, "O'Brien & <Co>", "@SUM(A1)", false, null],
      ],
    });
    writeFileSync(process.env.TAB_E2E_XLSX_OUT as string, bytes);
  });
});

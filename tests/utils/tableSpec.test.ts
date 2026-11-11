import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildXlsxWorkbook } from "../../src/utils/xlsxWriter";
import {
  MAX_TABLE_SPEC_TABLES,
  SPEC_LABELS,
  buildTableSpecSheets,
  formatSpecDate,
  splitComment,
  tableSpecFileName,
  type SpecTable,
  type TableSpecInput,
} from "../../src/utils/tableSpec";

const col = (name: string, extra: Partial<SpecTable["columns"][number]> = {}) => ({
  name,
  data_type: "integer",
  is_pk: false,
  is_nullable: true,
  is_auto_increment: false,
  ...extra,
});

const users: SpecTable = {
  name: "users",
  columns: [
    col("id", { is_pk: true, is_nullable: false, is_auto_increment: true }),
    col("name", { data_type: "varchar", character_maximum_length: 100, is_nullable: false }),
    col("company_id"),
    col("status", { data_type: "varchar", default_value: "active" }),
  ],
  foreignKeys: [
    { name: "fk_users_company", column_name: "company_id", ref_table: "companies", ref_column: "id", on_delete: "CASCADE", on_update: "NO ACTION" },
  ],
  indexes: [
    { name: "users_pkey", column_name: "id", is_unique: true, is_primary: true, seq_in_index: 1 },
    { name: "idx_users_company_name", column_name: "name", is_unique: false, is_primary: false, seq_in_index: 2 },
    { name: "idx_users_company_name", column_name: "company_id", is_unique: false, is_primary: false, seq_in_index: 1 },
  ],
};

const companies: SpecTable = { name: "companies", columns: [col("id", { is_pk: true, is_nullable: false })], foreignKeys: [], indexes: [] };

const input = (over: Partial<TableSpecInput> = {}): TableSpecInput => ({
  tables: [users, companies],
  comments: {
    tables: { users: "顧客 / Khách hàng", companies: "会社" },
    columns: { users: { id: "顧客ID", name: "氏名 / Họ tên\nTên đầy đủ", status: "状態" } },
  },
  language: "ja",
  options: { includeIndexes: true, includeForeignKeys: true },
  meta: { connectionName: "Prod DB", databaseName: "shop", schema: "public", generatedAt: new Date(2026, 10, 12, 9, 5) },
  ...over,
});

const read = (sheets = buildTableSpecSheets(input())) =>
  XLSX.read(buildXlsxWorkbook(sheets), { type: "array" });
const grid = (wb: XLSX.WorkBook, name: string) =>
  XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: "", blankrows: true }) as unknown[][];

describe("splitComment", () => {
  it.each([
    [undefined, "", ""],
    [null, "", ""],
    ["", "", ""],
    ["   ", "", ""],
    ["顧客名", "顧客名", ""],
    ["顧客名 / Tên khách hàng", "顧客名", "Tên khách hàng"],
    ["顧客名｜Tên khách hàng", "顧客名", "Tên khách hàng"],
    ["顧客名 | Tên khách hàng", "顧客名", "Tên khách hàng"],
    ["顧客名\nTên khách hàng\nghi chú", "顧客名", "Tên khách hàng\nghi chú"],
    ["顧客名\r\nnote", "顧客名", "note"],
    ["a/b has no spaces", "a/b has no spaces", ""],
    ["  padded  /  note  ", "padded", "note"],
  ])("%j -> logical %j, note %j", (comment, logical, note) => {
    expect(splitComment(comment)).toEqual({ logical, note });
  });
});

describe("buildTableSpecSheets", () => {
  it("makes an index sheet first, then one sheet per table in the given order", () => {
    const sheets = buildTableSpecSheets(input());
    expect(sheets.map((s) => s.name)).toEqual(["目次", "users", "companies"]);
  });

  it("lists every table in the index with its logical name, note and column count", () => {
    const wb = read();
    const rows = grid(wb, "目次");
    expect(rows[0][0]).toBe("テーブル定義書");
    expect(rows.find((r) => r[0] === "接続名")?.[1]).toBe("Prod DB");
    expect(rows.find((r) => r[0] === "データベース")?.[1]).toBe("shop");
    expect(rows.find((r) => r[0] === "スキーマ")?.[1]).toBe("public");
    expect(rows.find((r) => r[0] === "作成日時")?.[1]).toBe("2026-11-12 09:05");
    const headerAt = rows.findIndex((r) => r[0] === "No.");
    expect(rows[headerAt + 1]).toEqual([1, "users", "顧客", "Khách hàng", 4]);
    expect(rows[headerAt + 2]).toEqual([2, "companies", "会社", "", 1]);
  });

  it("omits the schema line when there is no schema", () => {
    const wb = read(buildTableSpecSheets(input({ meta: { connectionName: "c", databaseName: "d", generatedAt: new Date() } })));
    expect(grid(wb, "目次").some((r) => r[0] === "スキーマ")).toBe(false);
  });

  it("writes the table header block and the column table", () => {
    const rows = grid(read(), "users");
    expect(rows[1].slice(0, 2)).toEqual(["テーブル名(物理)", "users"]);
    expect(rows[2].slice(0, 2)).toEqual(["テーブル名(論理)", "顧客"]);
    expect(rows[3].slice(0, 2)).toEqual(["備考", "Khách hàng"]);
    const headerAt = rows.findIndex((r) => r[0] === "No." && r[1] === "列名(物理)");
    expect(rows[headerAt]).toEqual([
      "No.", "列名(物理)", "列名(論理)", "データ型", "桁数", "NOT NULL", "主キー", "外部キー(参照先)", "デフォルト値", "備考",
    ]);
    // id: primary key, not null, auto increment, logical name from the comment
    expect(rows[headerAt + 1]).toEqual([1, "id", "顧客ID", "integer", "", "○", "○", "", "", "自動採番"]);
    // name: length, not null, logical name and a multi-line note
    expect(rows[headerAt + 2]).toEqual([2, "name", "氏名", "varchar", 100, "○", "", "", "", "Họ tên\nTên đầy đủ"]);
    // company_id: foreign key target, nullable
    expect(rows[headerAt + 3]).toEqual([3, "company_id", "", "integer", "", "", "", "companies.id", "", ""]);
    // status: default value
    expect(rows[headerAt + 4]).toEqual([4, "status", "状態", "varchar", "", "", "", "", "active", ""]);
  });

  it("groups index columns by name in index order and marks unique / primary", () => {
    const rows = grid(read(), "users");
    const at = rows.findIndex((r) => r[1] === "インデックス名");
    expect(rows[at + 1].slice(0, 5)).toEqual([1, "users_pkey", "id", "○", "○"]);
    expect(rows[at + 2].slice(0, 5)).toEqual([2, "idx_users_company_name", "company_id, name", "", ""]);
  });

  it("lists foreign keys with their rules", () => {
    const rows = grid(read(), "users");
    const at = rows.findIndex((r) => r[1] === "制約名");
    expect(rows[at + 1].slice(0, 7)).toEqual([1, "fk_users_company", "company_id", "companies", "id", "CASCADE", "NO ACTION"]);
  });

  it("leaves out indexes and foreign keys when not asked for", () => {
    const rows = grid(read(buildTableSpecSheets(input({ options: { includeIndexes: false, includeForeignKeys: false } }))), "users");
    expect(rows.some((r) => r[1] === "インデックス名")).toBe(false);
    expect(rows.some((r) => r[1] === "制約名")).toBe(false);
    // The FK target stays in the column table: it describes the column, not a separate list.
    expect(rows.some((r) => r[7] === "companies.id")).toBe(true);
  });

  it("has no index or foreign key section for a table without any", () => {
    const rows = grid(read(), "companies");
    expect(rows.some((r) => r[1] === "インデックス名" || r[1] === "制約名")).toBe(false);
  });

  it.each(["ja", "en", "vi"] as const)("writes a complete %s document", (language) => {
    const labels = SPEC_LABELS[language];
    const wb = read(buildTableSpecSheets(input({ language })));
    expect(wb.SheetNames[0]).toBe(labels.indexSheet);
    expect(grid(wb, labels.indexSheet)[0][0]).toBe(labels.title);
    expect(grid(wb, "users").some((r) => r[1] === labels.columnPhysical)).toBe(true);
  });

  it("never leaves a label empty in any language", () => {
    for (const language of ["ja", "en", "vi"] as const) {
      for (const [key, value] of Object.entries(SPEC_LABELS[language])) {
        expect(value, `${language}.${key}`).not.toBe("");
      }
    }
  });

  it("works for a database without comments", () => {
    const rows = grid(read(buildTableSpecSheets(input({ comments: { tables: {}, columns: {} } }))), "users");
    expect(rows[2].slice(0, 2)).toEqual(["テーブル名(論理)", ""]);
  });

  it("handles a table with no columns", () => {
    const sheets = buildTableSpecSheets(input({ tables: [{ name: "empty", columns: [], foreignKeys: [], indexes: [] }] }));
    expect(read(sheets).SheetNames).toEqual(["目次", "empty"]);
  });

  it("copes with long and awkward table names by making sheet names valid and unique", () => {
    const long = "a_very_long_table_name_that_exceeds_the_limit";
    const tables: SpecTable[] = [
      { ...companies, name: long },
      { ...companies, name: `${long}_2` },
      { ...companies, name: "Users" },
      { ...companies, name: "users" },
      { ...companies, name: "a/b" },
    ];
    const names = read(buildTableSpecSheets(input({ tables, comments: { tables: {}, columns: {} } }))).SheetNames;
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(names.length);
    expect(names.every((n) => n.length <= 31)).toBe(true);
    expect(names).toContain("a_b");
  });

  it("refuses an empty list and more tables than a workbook can hold", () => {
    expect(() => buildTableSpecSheets(input({ tables: [] }))).toThrow("no tables");
    const many = Array.from({ length: MAX_TABLE_SPEC_TABLES + 1 }, (_, i) => ({ ...companies, name: `t${i}` }));
    expect(() => buildTableSpecSheets(input({ tables: many }))).toThrow(/Too many tables/);
  });

  it("accepts exactly the maximum number of tables", () => {
    const many = Array.from({ length: MAX_TABLE_SPEC_TABLES }, (_, i) => ({ ...companies, name: `t${i}` }));
    expect(buildTableSpecSheets(input({ tables: many, comments: { tables: {}, columns: {} } }))).toHaveLength(MAX_TABLE_SPEC_TABLES + 1);
  });

  it("does not turn a value starting with = into a formula", () => {
    const evil: SpecTable = { ...companies, name: "t", columns: [col("=cmd|' /C calc'!A0", { default_value: "=1+1" })] };
    const wb = read(buildTableSpecSheets(input({ tables: [evil], comments: { tables: {}, columns: {} } })));
    const rows = grid(wb, "t");
    expect(rows.some((r) => r[1] === "=cmd|' /C calc'!A0" && r[8] === "=1+1")).toBe(true);
    const sheet = wb.Sheets["t"];
    expect(Object.values(sheet).some((c) => typeof c === "object" && c !== null && "f" in (c as object))).toBe(false);
  });
});

describe("formatSpecDate / tableSpecFileName", () => {
  it("pads the date and time", () => {
    expect(formatSpecDate(new Date(2026, 0, 2, 3, 4))).toBe("2026-01-02 03:04");
  });

  it("builds a safe, dated file name", () => {
    const date = new Date(2026, 10, 12);
    expect(tableSpecFileName("shop", date)).toBe("table_definitions_shop_20261112.xlsx");
    expect(tableSpecFileName("my db/prod:1", date)).toBe("table_definitions_my_db_prod_1_20261112.xlsx");
    expect(tableSpecFileName("", date)).toBe("table_definitions_database_20261112.xlsx");
    expect(tableSpecFileName("///", date)).toBe("table_definitions_database_20261112.xlsx");
  });
});

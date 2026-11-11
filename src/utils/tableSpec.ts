import type { XlsxFreeSheet, XlsxStyledCell } from "./xlsxWriter";

/** Language of the headings in the generated document (independent of the app's UI language). */
export type TableSpecLanguage = "ja" | "en" | "vi";

export const TABLE_SPEC_LANGUAGES: readonly TableSpecLanguage[] = ["ja", "en", "vi"];

/** Most sheets one workbook holds here: one index sheet plus one sheet per table. */
export const MAX_TABLE_SPEC_TABLES = 254;

export interface SpecColumn {
  name: string;
  data_type: string;
  is_pk: boolean;
  is_nullable: boolean;
  is_auto_increment: boolean;
  default_value?: string | null;
  character_maximum_length?: number | null;
}

export interface SpecForeignKey {
  name: string;
  column_name: string;
  ref_table: string;
  ref_column: string;
  on_delete?: string | null;
  on_update?: string | null;
}

export interface SpecIndex {
  name: string;
  column_name: string;
  is_unique: boolean;
  is_primary: boolean;
  seq_in_index?: number | null;
}

export interface SpecTable {
  name: string;
  columns: SpecColumn[];
  foreignKeys: SpecForeignKey[];
  indexes: SpecIndex[];
}

/** Comments read from the database (`get_schema_comments`). */
export interface SpecComments {
  tables: Record<string, string>;
  columns: Record<string, Record<string, string>>;
}

export interface TableSpecOptions {
  includeIndexes: boolean;
  includeForeignKeys: boolean;
}

export interface TableSpecMeta {
  connectionName: string;
  databaseName: string;
  schema?: string | null;
  generatedAt: Date;
}

export interface TableSpecInput {
  tables: readonly SpecTable[];
  comments: SpecComments;
  language: TableSpecLanguage;
  options: TableSpecOptions;
  meta: TableSpecMeta;
}

interface SpecLabels {
  title: string;
  indexSheet: string;
  connection: string;
  database: string;
  schema: string;
  createdAt: string;
  no: string;
  tablePhysical: string;
  tableLogical: string;
  note: string;
  columnCount: string;
  columnPhysical: string;
  columnLogical: string;
  dataType: string;
  length: string;
  notNull: string;
  primaryKey: string;
  foreignKey: string;
  defaultValue: string;
  autoIncrement: string;
  indexes: string;
  indexName: string;
  indexColumns: string;
  unique: string;
  constraintName: string;
  column: string;
  refTable: string;
  refColumn: string;
  onDelete: string;
  onUpdate: string;
  foreignKeys: string;
  mark: string;
  backToIndex: string;
}

export const SPEC_LABELS: Record<TableSpecLanguage, SpecLabels> = {
  ja: {
    title: "テーブル定義書",
    indexSheet: "目次",
    connection: "接続名",
    database: "データベース",
    schema: "スキーマ",
    createdAt: "作成日時",
    no: "No.",
    tablePhysical: "テーブル名(物理)",
    tableLogical: "テーブル名(論理)",
    note: "備考",
    columnCount: "列数",
    columnPhysical: "列名(物理)",
    columnLogical: "列名(論理)",
    dataType: "データ型",
    length: "桁数",
    notNull: "NOT NULL",
    primaryKey: "主キー",
    foreignKey: "外部キー(参照先)",
    defaultValue: "デフォルト値",
    autoIncrement: "自動採番",
    indexes: "インデックス",
    indexName: "インデックス名",
    indexColumns: "対象列",
    unique: "ユニーク",
    constraintName: "制約名",
    column: "列",
    refTable: "参照テーブル",
    refColumn: "参照列",
    onDelete: "ON DELETE",
    onUpdate: "ON UPDATE",
    foreignKeys: "外部キー",
    mark: "○",
    backToIndex: "← 目次へ",
  },
  en: {
    title: "Table definitions",
    indexSheet: "Index",
    connection: "Connection",
    database: "Database",
    schema: "Schema",
    createdAt: "Created",
    no: "No.",
    tablePhysical: "Table name (physical)",
    tableLogical: "Table name (logical)",
    note: "Notes",
    columnCount: "Columns",
    columnPhysical: "Column name (physical)",
    columnLogical: "Column name (logical)",
    dataType: "Data type",
    length: "Length",
    notNull: "NOT NULL",
    primaryKey: "Primary key",
    foreignKey: "Foreign key (references)",
    defaultValue: "Default",
    autoIncrement: "auto increment",
    indexes: "Indexes",
    indexName: "Index name",
    indexColumns: "Columns",
    unique: "Unique",
    constraintName: "Constraint name",
    column: "Column",
    refTable: "Referenced table",
    refColumn: "Referenced column",
    onDelete: "ON DELETE",
    onUpdate: "ON UPDATE",
    foreignKeys: "Foreign keys",
    mark: "Y",
    backToIndex: "← Back to index",
  },
  vi: {
    title: "Tài liệu định nghĩa bảng",
    indexSheet: "Mục lục",
    connection: "Kết nối",
    database: "Cơ sở dữ liệu",
    schema: "Schema",
    createdAt: "Ngày tạo",
    no: "STT",
    tablePhysical: "Tên bảng (vật lý)",
    tableLogical: "Tên bảng (logic)",
    note: "Ghi chú",
    columnCount: "Số cột",
    columnPhysical: "Tên cột (vật lý)",
    columnLogical: "Tên cột (logic)",
    dataType: "Kiểu dữ liệu",
    length: "Độ dài",
    notNull: "NOT NULL",
    primaryKey: "Khóa chính",
    foreignKey: "Khóa ngoại (tham chiếu)",
    defaultValue: "Mặc định",
    autoIncrement: "tự tăng",
    indexes: "Chỉ mục",
    indexName: "Tên chỉ mục",
    indexColumns: "Cột",
    unique: "Duy nhất",
    constraintName: "Tên ràng buộc",
    column: "Cột",
    refTable: "Bảng tham chiếu",
    refColumn: "Cột tham chiếu",
    onDelete: "ON DELETE",
    onUpdate: "ON UPDATE",
    foreignKeys: "Khóa ngoại",
    mark: "x",
    backToIndex: "← Về mục lục",
  },
};

/** The part of a comment before a line break, ` / `, ` | ` or `｜`; the rest is kept as a note. */
const COMMENT_SEPARATOR = /\r?\n|\s\/\s|\s\|\s|｜/;

/**
 * Splits a database comment into the logical name and a note. The convention is
 * `論理名`, optionally followed by a line break, ` / ` or `｜` and a second language or a remark:
 * `顧客名 / Tên khách hàng` gives logical name `顧客名` and note `Tên khách hàng`.
 */
export function splitComment(comment: string | null | undefined): { logical: string; note: string } {
  const text = (comment ?? "").trim();
  if (!text) return { logical: "", note: "" };
  const match = COMMENT_SEPARATOR.exec(text);
  if (!match) return { logical: text, note: "" };
  return {
    logical: text.slice(0, match.index).trim(),
    note: text.slice(match.index + match[0].length).trim(),
  };
}

/** `YYYY-MM-DD HH:mm` in local time. */
export function formatSpecDate(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`;
}

const header = (value: string): XlsxStyledCell => ({ value, style: "header" });
const cell = (value: string | number | null | undefined): XlsxStyledCell => ({ value, style: "cell" });
const title = (value: string): XlsxStyledCell => ({ value, style: "title" });

/** Indexes grouped by name, columns in their order inside the index. */
function groupIndexes(indexes: readonly SpecIndex[]) {
  const groups = new Map<string, { name: string; columns: SpecIndex[]; unique: boolean; primary: boolean }>();
  for (const index of indexes) {
    const group = groups.get(index.name) ?? { name: index.name, columns: [], unique: index.is_unique, primary: index.is_primary };
    group.columns.push(index);
    group.unique ||= index.is_unique;
    group.primary ||= index.is_primary;
    groups.set(index.name, group);
  }
  return [...groups.values()].map((g) => ({
    ...g,
    columns: [...g.columns].sort((a, b) => (a.seq_in_index ?? 0) - (b.seq_in_index ?? 0)),
  }));
}

function buildTableSheet(table: SpecTable, input: TableSpecInput, labels: SpecLabels, indexSheetName: string): XlsxFreeSheet {
  const tableComment = splitComment(input.comments.tables[table.name]);
  const columnComments = input.comments.columns[table.name] ?? {};
  const fkByColumn = new Map<string, string[]>();
  for (const fk of table.foreignKeys) {
    fkByColumn.set(fk.column_name, [...(fkByColumn.get(fk.column_name) ?? []), `${fk.ref_table}.${fk.ref_column}`]);
  }

  const rows: XlsxFreeSheet["rows"] = [];
  rows.push([title(labels.title), null, null, null, null, null, null, null, null, { value: labels.backToIndex, linkToSheet: indexSheetName }]);
  rows.push([header(labels.tablePhysical), cell(table.name)]);
  rows.push([header(labels.tableLogical), cell(tableComment.logical)]);
  rows.push([header(labels.note), cell(tableComment.note)]);
  rows.push([]);

  rows.push(
    [
      labels.no,
      labels.columnPhysical,
      labels.columnLogical,
      labels.dataType,
      labels.length,
      labels.notNull,
      labels.primaryKey,
      labels.foreignKey,
      labels.defaultValue,
      labels.note,
    ].map(header),
  );
  table.columns.forEach((column, i) => {
    const comment = splitComment(columnComments[column.name]);
    const notes = [comment.note, column.is_auto_increment ? labels.autoIncrement : ""].filter(Boolean).join(" / ");
    rows.push([
      cell(i + 1),
      cell(column.name),
      cell(comment.logical),
      cell(column.data_type),
      cell(column.character_maximum_length ?? null),
      cell(column.is_nullable ? "" : labels.mark),
      cell(column.is_pk ? labels.mark : ""),
      cell((fkByColumn.get(column.name) ?? []).join(", ")),
      cell(column.default_value ?? ""),
      cell(notes),
    ]);
  });

  const indexGroups = input.options.includeIndexes ? groupIndexes(table.indexes) : [];
  if (indexGroups.length > 0) {
    rows.push([]);
    rows.push([title(labels.indexes)]);
    rows.push([labels.no, labels.indexName, labels.indexColumns, labels.unique, labels.primaryKey].map(header));
    indexGroups.forEach((group, i) => {
      rows.push([
        cell(i + 1),
        cell(group.name),
        cell(group.columns.map((c) => c.column_name).join(", ")),
        cell(group.unique ? labels.mark : ""),
        cell(group.primary ? labels.mark : ""),
      ]);
    });
  }

  if (input.options.includeForeignKeys && table.foreignKeys.length > 0) {
    rows.push([]);
    rows.push([title(labels.foreignKeys)]);
    rows.push(
      [labels.no, labels.constraintName, labels.column, labels.refTable, labels.refColumn, labels.onDelete, labels.onUpdate].map(header),
    );
    table.foreignKeys.forEach((fk, i) => {
      rows.push([
        cell(i + 1),
        cell(fk.name),
        cell(fk.column_name),
        cell(fk.ref_table),
        cell(fk.ref_column),
        cell(fk.on_delete ?? ""),
        cell(fk.on_update ?? ""),
      ]);
    });
  }

  return {
    name: table.name,
    rows,
    columnWidths: [6, 30, 30, 20, 8, 10, 10, 32, 20, 40],
  };
}

/**
 * Builds the sheets of a table-definition workbook (テーブル定義書): an index sheet that links to one sheet per
 * table, each with the table's names, its columns (physical and logical names, type, length, NOT NULL, key,
 * default, notes) and optionally its indexes and foreign keys.
 *
 * Logical names and notes come from the database comments, see `splitComment`.
 */
export function buildTableSpecSheets(input: TableSpecInput): XlsxFreeSheet[] {
  if (input.tables.length === 0) throw new Error("There are no tables to document");
  if (input.tables.length > MAX_TABLE_SPEC_TABLES) {
    throw new Error(`Too many tables for one workbook: ${input.tables.length} (max ${MAX_TABLE_SPEC_TABLES})`);
  }
  const labels = SPEC_LABELS[input.language];
  const { meta } = input;

  const indexRows: XlsxFreeSheet["rows"] = [];
  indexRows.push([title(labels.title)]);
  indexRows.push([header(labels.connection), cell(meta.connectionName)]);
  indexRows.push([header(labels.database), cell(meta.databaseName)]);
  if (meta.schema) indexRows.push([header(labels.schema), cell(meta.schema)]);
  indexRows.push([header(labels.createdAt), cell(formatSpecDate(meta.generatedAt))]);
  indexRows.push([]);
  indexRows.push([labels.no, labels.tablePhysical, labels.tableLogical, labels.note, labels.columnCount].map(header));
  input.tables.forEach((table, i) => {
    const comment = splitComment(input.comments.tables[table.name]);
    indexRows.push([
      cell(i + 1),
      { value: table.name, style: "cell", linkToSheet: table.name },
      cell(comment.logical),
      cell(comment.note),
      cell(table.columns.length),
    ]);
  });

  const indexSheet: XlsxFreeSheet = {
    name: labels.indexSheet,
    rows: indexRows,
    columnWidths: [6, 32, 30, 40, 8],
  };
  return [indexSheet, ...input.tables.map((table) => buildTableSheet(table, input, labels, labels.indexSheet))];
}

/** Default file name, e.g. `table_definitions_shop_20261112.xlsx`. */
export function tableSpecFileName(databaseName: string, date: Date = new Date()): string {
  const safe = databaseName.replace(/[^A-Za-z0-9_.-]+/g, "_").replace(/^_+|_+$/g, "") || "database";
  const p = (n: number) => String(n).padStart(2, "0");
  return `table_definitions_${safe}_${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}.xlsx`;
}

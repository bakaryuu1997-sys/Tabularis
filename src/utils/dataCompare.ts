/**
 * Row-level comparison of two tables, matched by key columns.
 *
 * Everything here is pure: callers fetch the rows, this module only decides which rows are missing,
 * extra or different. The comparison is "make the target look like the source".
 */

export type DataRow = Record<string, unknown>;

export interface TableData {
  columns: string[];
  rows: unknown[][];
}

export interface DataCompareOptions {
  /** Columns that identify a row. Must exist on both sides. */
  keyColumns: string[];
  /** Columns that are never compared (for example audit timestamps). */
  ignoreColumns?: string[];
}

export interface ColumnChange {
  column: string;
  source: unknown;
  target: unknown;
}

export interface ChangedRow {
  key: DataRow;
  /** Full source row, restricted to the compared columns. */
  sourceRow: DataRow;
  changes: ColumnChange[];
}

export interface DataCompareResult {
  keyColumns: string[];
  /** Non-key columns present on both sides and not ignored. */
  comparedColumns: string[];
  sourceOnlyColumns: string[];
  targetOnlyColumns: string[];
  /** Rows to INSERT into the target. */
  onlyInSource: DataRow[];
  /** Rows that exist only in the target (DELETE candidates). */
  onlyInTarget: DataRow[];
  /** Rows with the same key but different values (UPDATE candidates). */
  changed: ChangedRow[];
  identicalCount: number;
  /** Keys that appeared more than once on a side. Only the first occurrence is used. */
  duplicateKeys: { side: "source" | "target"; key: DataRow }[];
}

export type DataCompareErrorCode = "no_key_columns" | "key_column_missing";

export class DataCompareError extends Error {
  readonly code: DataCompareErrorCode;
  readonly columns: string[];

  constructor(code: DataCompareErrorCode, message: string, columns: string[] = []) {
    super(message);
    this.name = "DataCompareError";
    this.code = code;
    this.columns = columns;
  }
}

const NUMERIC = /^-?\d+(\.\d+)?$/;

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * Equality used to decide whether a cell changed. NULL equals NULL, a number equals the same number
 * written as text (drivers return DECIMAL as text), a boolean equals 1 / 0 (MySQL has no boolean), and
 * objects are compared structurally. Anything else must match exactly: "01" is not 1.
 */
export function cellValuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) {
    return (a === null || a === undefined) && (b === null || b === undefined);
  }
  if (typeof a === "boolean" || typeof b === "boolean") {
    const asNumber = (v: unknown) => (typeof v === "boolean" ? (v ? 1 : 0) : v);
    const x = asNumber(a);
    const y = asNumber(b);
    return typeof x === "boolean" || typeof y === "boolean" ? false : cellValuesEqual(x, y);
  }
  const numberLike = (v: unknown) => typeof v === "number" || (typeof v === "string" && NUMERIC.test(v));
  if (typeof a !== typeof b && numberLike(a) && numberLike(b)) {
    const x = Number(a);
    const y = Number(b);
    return Number.isFinite(x) && x === y && (typeof a === "number" ? String(a) === String(x) : true);
  }
  if (typeof a === "object" && typeof b === "object") return stableStringify(a) === stableStringify(b);
  return false;
}

/** Stable identity of a row: the key columns serialized in the order given. */
export function rowKey(row: DataRow, keyColumns: string[]): string {
  return JSON.stringify(keyColumns.map((c) => (row[c] === undefined ? null : row[c])).map(String));
}

function toRows(data: TableData): DataRow[] {
  return data.rows.map((cells) => {
    const row: DataRow = {};
    data.columns.forEach((column, i) => {
      row[column] = cells[i];
    });
    return row;
  });
}

function pick(row: DataRow, columns: string[]): DataRow {
  const out: DataRow = {};
  for (const c of columns) out[c] = row[c];
  return out;
}

/** Compares `source` with `target` and reports what is needed to turn the target into the source. */
export function compareTableData(
  source: TableData,
  target: TableData,
  options: DataCompareOptions,
): DataCompareResult {
  const { keyColumns } = options;
  if (keyColumns.length === 0) {
    throw new DataCompareError("no_key_columns", "At least one key column is required");
  }
  const missing = keyColumns.filter((c) => !source.columns.includes(c) || !target.columns.includes(c));
  if (missing.length > 0) {
    throw new DataCompareError("key_column_missing", `Key column(s) missing on one side: ${missing.join(", ")}`, missing);
  }

  const ignored = new Set(options.ignoreColumns ?? []);
  const keySet = new Set(keyColumns);
  const targetColumns = new Set(target.columns);
  const sourceColumns = new Set(source.columns);
  const comparedColumns = source.columns.filter((c) => !keySet.has(c) && !ignored.has(c) && targetColumns.has(c));
  const sourceOnlyColumns = source.columns.filter((c) => !targetColumns.has(c) && !ignored.has(c));
  const targetOnlyColumns = target.columns.filter((c) => !sourceColumns.has(c) && !ignored.has(c));
  const projection = [...keyColumns, ...comparedColumns];

  const duplicateKeys: DataCompareResult["duplicateKeys"] = [];
  const indexRows = (rows: DataRow[], side: "source" | "target") => {
    const index = new Map<string, DataRow>();
    for (const row of rows) {
      const k = rowKey(row, keyColumns);
      if (index.has(k)) duplicateKeys.push({ side, key: pick(row, keyColumns) });
      else index.set(k, row);
    }
    return index;
  };

  const sourceIndex = indexRows(toRows(source), "source");
  const targetIndex = indexRows(toRows(target), "target");

  const onlyInSource: DataRow[] = [];
  const changed: ChangedRow[] = [];
  let identicalCount = 0;

  for (const [k, sourceRow] of sourceIndex) {
    const targetRow = targetIndex.get(k);
    if (!targetRow) {
      onlyInSource.push(pick(sourceRow, projection));
      continue;
    }
    const changes: ColumnChange[] = [];
    for (const column of comparedColumns) {
      if (!cellValuesEqual(sourceRow[column], targetRow[column])) {
        changes.push({ column, source: sourceRow[column], target: targetRow[column] });
      }
    }
    if (changes.length === 0) identicalCount++;
    else changed.push({ key: pick(sourceRow, keyColumns), sourceRow: pick(sourceRow, projection), changes });
  }

  const onlyInTarget: DataRow[] = [];
  for (const [k, targetRow] of targetIndex) {
    if (!sourceIndex.has(k)) onlyInTarget.push(pick(targetRow, projection));
  }

  return {
    keyColumns,
    comparedColumns,
    sourceOnlyColumns,
    targetOnlyColumns,
    onlyInSource,
    onlyInTarget,
    changed,
    identicalCount,
    duplicateKeys,
  };
}

/** True when the two tables hold the same data for the compared columns. */
export function isIdentical(result: DataCompareResult): boolean {
  return (
    result.onlyInSource.length === 0 &&
    result.onlyInTarget.length === 0 &&
    result.changed.length === 0
  );
}

import type { DriverCapabilities, PluginManifest } from "../types/plugins";
import type { DataCompareResult, DataRow } from "./dataCompare";
import { getQuoteChar, quoteIdentifier, quoteTableRef } from "./identifiers";

type DriverLike = string | PluginManifest | DriverCapabilities | null | undefined;

export class UnsupportedValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedValueError";
  }
}

/**
 * SQL literal for a value read from a result set.
 *
 * Strings are single-quoted with embedded quotes doubled. MySQL-style engines (identified by their
 * back-tick identifier quote) additionally treat a backslash as an escape character, so it is doubled
 * there. Values that cannot be written safely (NUL characters, non-finite numbers) throw instead of
 * producing a statement that could change meaning.
 */
export function toSqlLiteral(value: unknown, backslashEscapes: boolean): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new UnsupportedValueError(`Cannot write the number ${value} as SQL`);
    return String(value);
  }
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text === undefined) throw new UnsupportedValueError("Cannot serialize value as SQL");
  if (text.includes("\0")) throw new UnsupportedValueError("Text containing NUL characters cannot be written as SQL");
  let escaped = text.replace(/'/g, "''");
  if (backslashEscapes) escaped = escaped.replace(/\\/g, "\\\\");
  return `'${escaped}'`;
}

export interface SyncScriptOptions {
  /** Target table name. */
  table: string;
  schema?: string | null;
  driver: DriverLike;
  includeInserts?: boolean;
  includeUpdates?: boolean;
  /** Off by default: deleting rows is the only destructive part of a sync. */
  includeDeletes?: boolean;
}

export interface SyncScript {
  sql: string;
  statementCount: number;
  counts: { inserts: number; updates: number; deletes: number };
  /** Rows that could not be turned into SQL, with the reason. */
  skipped: { statement: "insert" | "update" | "delete"; key: DataRow; reason: string }[];
}

/**
 * Builds the statements that make the target table equal to the source for the compared rows.
 * Deletes are only generated when `includeDeletes` is set.
 */
export function buildSyncScript(result: DataCompareResult, options: SyncScriptOptions): SyncScript {
  const { driver } = options;
  const backslashEscapes = getQuoteChar(driver) === "`";
  const tableRef = quoteTableRef(options.table, driver, options.schema);
  const q = (name: string) => quoteIdentifier(name, driver);
  const lit = (v: unknown) => toSqlLiteral(v, backslashEscapes);

  const where = (key: DataRow) =>
    result.keyColumns
      .map((c) => (key[c] === null || key[c] === undefined ? `${q(c)} IS NULL` : `${q(c)} = ${lit(key[c])}`))
      .join(" AND ");

  const statements: string[] = [];
  const counts = { inserts: 0, updates: 0, deletes: 0 };
  const skipped: SyncScript["skipped"] = [];
  const attempt = (statement: "insert" | "update" | "delete", key: DataRow, build: () => string) => {
    try {
      statements.push(build());
      counts[`${statement}s` as keyof typeof counts]++;
    } catch (e) {
      if (!(e instanceof UnsupportedValueError)) throw e;
      skipped.push({ statement, key, reason: e.message });
    }
  };

  const keyOf = (row: DataRow) => Object.fromEntries(result.keyColumns.map((c) => [c, row[c]]));
  const insertColumns = [...result.keyColumns, ...result.comparedColumns];

  if (options.includeInserts !== false) {
    for (const row of result.onlyInSource) {
      attempt("insert", keyOf(row), () =>
        `INSERT INTO ${tableRef} (${insertColumns.map(q).join(", ")}) VALUES (${insertColumns.map((c) => lit(row[c])).join(", ")});`,
      );
    }
  }

  if (options.includeUpdates !== false) {
    for (const change of result.changed) {
      attempt("update", change.key, () =>
        `UPDATE ${tableRef} SET ${change.changes.map((c) => `${q(c.column)} = ${lit(c.source)}`).join(", ")} WHERE ${where(change.key)};`,
      );
    }
  }

  if (options.includeDeletes === true) {
    for (const row of result.onlyInTarget) {
      attempt("delete", keyOf(row), () => `DELETE FROM ${tableRef} WHERE ${where(keyOf(row))};`);
    }
  }

  return { sql: statements.join("\n"), statementCount: statements.length, counts, skipped };
}

import { invoke } from "@tauri-apps/api/core";
import type { TableColumn } from "./sqlGenerator";
import type { MinimalTableInfo } from "./schemaDiff";

/** Most `get_columns` calls in flight at once when the batch command is unavailable. */
export const COLUMN_FETCH_CONCURRENCY = 8;

/** Longest list of table names quoted in an error message. */
const MAX_REPORTED_TABLES = 5;

/**
 * Like `Promise.all(items.map(fn))`, but runs at most `limit` calls at a time and keeps the result order.
 * After a call fails no new item is started, and the first error is rethrown.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const workers = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));
  let next = 0;
  let failed = false;

  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (!failed && next < items.length) {
        const index = next++;
        try {
          results[index] = await fn(items[index], index);
        } catch (err) {
          failed = true;
          throw err;
        }
      }
    }),
  );
  return results;
}

export interface SchemaColumns {
  tables: MinimalTableInfo[];
  columns: Record<string, TableColumn[]>;
}

interface SnapshotTable {
  name: string;
  columns: TableColumn[];
}

const schemaArgs = (connectionId: string, schema?: string) => ({
  connectionId,
  ...(schema ? { schema } : {}),
});

/**
 * Loads every table of a schema together with its columns.
 *
 * Fast path: one `get_schema_snapshot` call, which reads all columns with a single query per driver.
 * Fallback (a driver or plugin without the batch command): `get_tables` plus `get_columns` per table with
 * bounded concurrency, so a 500-table database does not fire ~500 calls at once.
 *
 * A table whose columns cannot be read is an error, never an empty column list: an empty list would make the
 * schema diff report every column as added or dropped and generate destructive migration SQL.
 */
export async function loadSchemaColumns(
  connectionId: string,
  schema?: string,
): Promise<SchemaColumns> {
  try {
    const snapshot = await invoke<SnapshotTable[]>(
      "get_schema_snapshot",
      schemaArgs(connectionId, schema),
    );
    const columns: Record<string, TableColumn[]> = {};
    for (const table of snapshot) columns[table.name] = table.columns;
    return { tables: snapshot.map((t) => ({ name: t.name })), columns };
  } catch (err) {
    console.warn("get_schema_snapshot unavailable, reading columns per table:", err);
  }

  const tables = await invoke<MinimalTableInfo[]>(
    "get_tables",
    schemaArgs(connectionId, schema),
  );
  const failed: string[] = [];
  const columns: Record<string, TableColumn[]> = {};

  await mapLimit(tables, COLUMN_FETCH_CONCURRENCY, async (table) => {
    try {
      columns[table.name] = await invoke<TableColumn[]>("get_columns", {
        ...schemaArgs(connectionId, schema),
        tableName: table.name,
      });
    } catch {
      failed.push(table.name);
    }
  });

  if (failed.length > 0) {
    const shown = failed.slice(0, MAX_REPORTED_TABLES).join(", ");
    const more = failed.length > MAX_REPORTED_TABLES ? ` (+${failed.length - MAX_REPORTED_TABLES} more)` : "";
    throw new Error(`Could not read columns of: ${shown}${more}`);
  }
  return { tables, columns };
}

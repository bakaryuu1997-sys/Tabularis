import type { DriverCapabilities, PluginManifest } from "../types/plugins";
import type { TableData } from "./dataCompare";
import { quoteIdentifier, quoteTableRef } from "./identifiers";

type DriverLike = string | PluginManifest | DriverCapabilities | null | undefined;

export const DEFAULT_PAGE_SIZE = 1000;
/** Upper bound per side. Larger tables are compared on a prefix and flagged as truncated. */
export const DEFAULT_MAX_ROWS = 20_000;

export interface FetchedTable extends TableData {
  /** More rows exist than were loaded, so "only in target" results cannot be trusted. */
  truncated: boolean;
}

export type PageExecutor = (query: string, limit: number, page: number) => Promise<TableData>;

/** `SELECT *` ordered by the key columns, so paging is stable and both sides line up. */
export function buildTableSelect(
  table: string,
  schema: string | null | undefined,
  orderBy: string[],
  driver: DriverLike,
): string {
  const order = orderBy.length > 0 ? ` ORDER BY ${orderBy.map((c) => quoteIdentifier(c, driver)).join(", ")}` : "";
  return `SELECT * FROM ${quoteTableRef(table, driver, schema)}${order}`;
}

/**
 * Reads a table page by page until it is exhausted or more than `maxRows` rows were seen.
 * `truncated` is true only when rows beyond `maxRows` actually exist.
 */
export async function loadTableRows(
  execute: PageExecutor,
  query: string,
  { pageSize = DEFAULT_PAGE_SIZE, maxRows = DEFAULT_MAX_ROWS }: { pageSize?: number; maxRows?: number } = {},
): Promise<FetchedTable> {
  const rows: unknown[][] = [];
  let columns: string[] = [];
  let truncated = false;

  for (let page = 1; ; page++) {
    const chunk = await execute(query, pageSize, page);
    if (page === 1) columns = chunk.columns;
    rows.push(...chunk.rows);

    // Reading past maxRows proves that more data exists; stopping exactly at maxRows does not.
    if (rows.length > maxRows) {
      truncated = true;
      break;
    }
    if (chunk.rows.length < pageSize) break;
  }

  return { columns, rows: rows.length > maxRows ? rows.slice(0, maxRows) : rows, truncated };
}

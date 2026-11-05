import type { DriverCapabilities, PluginManifest } from "../types/plugins";
import { compareTableData, type DataCompareResult, type TableData } from "./dataCompare";
import { buildTableSelect, loadTableRows, type FetchedTable } from "./dataCompareFetch";

type DriverLike = string | PluginManifest | DriverCapabilities | null | undefined;

export interface CompareSide {
  connectionId: string;
  schema?: string | null;
  table: string;
  driver: DriverLike;
}

/** Runs one page of a query on a connection. Supplied by the caller (Tauri `execute_query` in the app). */
export type QueryExecutor = (
  connectionId: string,
  query: string,
  limit: number,
  page: number,
  schema: string | null,
) => Promise<TableData>;

export interface DataCompareRun {
  result: DataCompareResult;
  sourceTruncated: boolean;
  targetTruncated: boolean;
  sourceRowCount: number;
  targetRowCount: number;
  /**
   * A script is only safe when both sides were read completely. With a partial read, "missing" rows may
   * simply not have been loaded, so inserts and deletes could be wrong.
   */
  canGenerateSql: boolean;
}

export interface RunDataCompareParams {
  source: CompareSide;
  target: CompareSide;
  keyColumns: string[];
  ignoreColumns?: string[];
  pageSize?: number;
  maxRows?: number;
}

/** Loads both tables (ordered by the key) and compares them. */
export async function runDataCompare(
  execute: QueryExecutor,
  { source, target, keyColumns, ignoreColumns, pageSize, maxRows }: RunDataCompareParams,
): Promise<DataCompareRun> {
  const load = (side: CompareSide): Promise<FetchedTable> =>
    loadTableRows(
      (query, limit, page) => execute(side.connectionId, query, limit, page, side.schema ?? null),
      buildTableSelect(side.table, side.schema, keyColumns, side.driver),
      { pageSize, maxRows },
    );

  const [src, tgt] = await Promise.all([load(source), load(target)]);
  const result = compareTableData(src, tgt, { keyColumns, ignoreColumns });

  return {
    result,
    sourceTruncated: src.truncated,
    targetTruncated: tgt.truncated,
    sourceRowCount: src.rows.length,
    targetRowCount: tgt.rows.length,
    canGenerateSql: !src.truncated && !tgt.truncated,
  };
}

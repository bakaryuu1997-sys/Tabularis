import { invoke } from "@tauri-apps/api/core";
import { loadSchemaColumns, mapLimit } from "./schemaFetch";
import type { SpecColumn, SpecComments, SpecForeignKey, SpecIndex, SpecTable } from "./tableSpec";

/** Most `get_indexes` / `get_foreign_keys` calls in flight at once. */
const DETAIL_CONCURRENCY = 8;

interface SnapshotTable {
  name: string;
  columns: SpecColumn[];
  foreign_keys: SpecForeignKey[];
}

export interface TableSpecData {
  tables: SpecTable[];
  comments: SpecComments;
  /** Tables whose indexes could not be read (the document then has no index list for them). */
  indexWarnings: string[];
  /** True when the driver returned no table or column comments at all. */
  noComments: boolean;
}

export interface LoadTableSpecOptions {
  connectionId: string;
  schema?: string | null;
  database?: string | null;
  /** Only these tables; omitted means every table. */
  tableNames?: readonly string[];
  includeIndexes: boolean;
  onProgress?: (done: number, total: number) => void;
}

const EMPTY_COMMENTS: SpecComments = { tables: {}, columns: {} };

const schemaArgs = (schema?: string | null) => (schema ? { schema } : {});

/** Tables, columns and foreign keys: one snapshot call, or (drivers without it) per-table calls. */
async function loadStructure(options: LoadTableSpecOptions): Promise<SnapshotTable[]> {
  try {
    return await invoke<SnapshotTable[]>("get_schema_snapshot", {
      connectionId: options.connectionId,
      ...schemaArgs(options.schema),
      ...(options.database ? { database: options.database } : {}),
    });
  } catch (error) {
    console.warn("get_schema_snapshot unavailable, reading tables one by one:", error);
  }

  const { tables, columns } = await loadSchemaColumns(options.connectionId, options.schema ?? undefined);
  return mapLimit(tables, DETAIL_CONCURRENCY, async (table) => {
    let foreignKeys: SpecForeignKey[] = [];
    try {
      foreignKeys = await invoke<SpecForeignKey[]>("get_foreign_keys", {
        connectionId: options.connectionId,
        tableName: table.name,
        ...schemaArgs(options.schema),
      });
    } catch {
      // A driver without foreign keys: the document simply has none.
    }
    return { name: table.name, columns: (columns[table.name] ?? []) as SpecColumn[], foreign_keys: foreignKeys };
  });
}

async function loadComments(options: LoadTableSpecOptions): Promise<SpecComments> {
  try {
    const comments = await invoke<SpecComments>("get_schema_comments", {
      connectionId: options.connectionId,
      ...schemaArgs(options.schema),
      ...(options.database ? { database: options.database } : {}),
    });
    return { tables: comments?.tables ?? {}, columns: comments?.columns ?? {} };
  } catch (error) {
    // Comments are a bonus: a driver or plugin that cannot read them still gets a document.
    console.warn("get_schema_comments failed:", error);
    return EMPTY_COMMENTS;
  }
}

/**
 * Everything the table-definition document needs: structure, comments and (optionally) indexes. Tables come out
 * in name order, so the document does not depend on the order the database happens to return.
 */
export async function loadTableSpecData(options: LoadTableSpecOptions): Promise<TableSpecData> {
  const [structure, comments] = await Promise.all([loadStructure(options), loadComments(options)]);

  const wanted = options.tableNames ? new Set(options.tableNames) : null;
  const selected = structure
    .filter((table) => !wanted || wanted.has(table.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  const indexWarnings: string[] = [];
  let done = 0;
  options.onProgress?.(done, selected.length);

  const tables = await mapLimit(selected, DETAIL_CONCURRENCY, async (table): Promise<SpecTable> => {
    let indexes: SpecIndex[] = [];
    if (options.includeIndexes) {
      try {
        indexes = await invoke<SpecIndex[]>("get_indexes", {
          connectionId: options.connectionId,
          tableName: table.name,
          ...schemaArgs(options.schema),
        });
      } catch {
        indexWarnings.push(table.name);
      }
    }
    options.onProgress?.(++done, selected.length);
    return { name: table.name, columns: table.columns, foreignKeys: table.foreign_keys ?? [], indexes };
  });

  const noComments =
    Object.keys(comments.tables).length === 0 &&
    Object.values(comments.columns).every((byColumn) => Object.keys(byColumn).length === 0);

  return { tables, comments, indexWarnings, noComments };
}

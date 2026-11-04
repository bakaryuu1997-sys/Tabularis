import { useContext, useEffect, useMemo } from "react";
import type { Monaco } from "@monaco-editor/react";
import { loader } from "@monaco-editor/react";
import { useDatabase } from "./useDatabase";
import { SettingsContext } from "../contexts/SettingsContext";
import type { TableInfo, SchemaData } from "../contexts/DatabaseContext";
import type { DriverCapabilities } from "../types/plugins";
import {
  registerSqlAutocomplete,
  disposeSqlAutocomplete,
  registerSqlHover,
  disposeSqlHover,
} from "../utils/autocomplete";

type Options = {
  monaco?: Monaco | null;
  schema?: string | null;
  tables?: TableInfo[];
  /** When false, skips registration (e.g. inactive notebook tabs). Defaults to true. */
  enabled?: boolean;
};

/**
 * Resolves all available tables across active schema, multi-database map, or connection tables.
 */
export function getEffectiveTables(
  tables: TableInfo[],
  activeCapabilities: DriverCapabilities | null | undefined,
  schema: string | null | undefined,
  schemaDataMap: Record<string, SchemaData>,
  databaseDataMap: Record<string, SchemaData>,
): TableInfo[] {
  // 1. PostgreSQL schema-scoped tables
  if (activeCapabilities?.schemas && schema && schemaDataMap[schema]?.tables?.length) {
    return schemaDataMap[schema].tables;
  }

  // 2. Multi-database / MySQL loaded database tables
  const dbTables: TableInfo[] = [];
  for (const [db, data] of Object.entries(databaseDataMap)) {
    if (data?.tables?.length) {
      for (const t of data.tables) {
        dbTables.push({
          name: t.name,
          schema: t.schema || db,
        });
      }
    }
  }
  if (dbTables.length > 0) {
    return dbTables;
  }

  // 3. Fallback to connection root tables
  return tables;
}

/**
 * Keeps the global SQL completion provider and hover provider in sync with the active connection.
 * Pass `monaco` from the main editor when available; otherwise Monaco is loaded via loader.init (notebook).
 */
export function useSqlAutocompleteRegistration(
  connectionId: string | null,
  options?: Options,
) {
  const {
    tables,
    activeDriver,
    activeSchema,
    activeCapabilities,
    schemaDataMap,
    databaseDataMap,
  } = useDatabase();
  const settingsContext = useContext(SettingsContext);
  const keywordCase =
    settingsContext?.settings.autocompleteKeywordCase ?? "upper";

  const schema = options?.schema ?? activeSchema;
  const enabled = options?.enabled ?? true;

  const effectiveTables = useMemo(() => {
    if (options?.tables && options.tables.length > 0) {
      return options.tables;
    }
    return getEffectiveTables(
      tables,
      activeCapabilities,
      schema,
      schemaDataMap,
      databaseDataMap,
    );
  }, [
    options?.tables,
    tables,
    activeCapabilities,
    schema,
    schemaDataMap,
    databaseDataMap,
  ]);

  useEffect(() => {
    if (!connectionId || !enabled) return;

    let cancelled = false;

    const register = (monaco: Monaco) => {
      if (cancelled) return;

      registerSqlAutocomplete(
        monaco,
        connectionId,
        effectiveTables,
        schema,
        activeDriver ?? null,
        keywordCase,
      );

      registerSqlHover(
        monaco,
        connectionId,
        effectiveTables,
        schema,
      );
    };

    const cleanup = () => {
      cancelled = true;
      disposeSqlAutocomplete();
      disposeSqlHover();
    };

    if (options?.monaco) {
      register(options.monaco);
      return cleanup;
    }

    loader.init().then((monaco) => register(monaco));
    return cleanup;
  }, [
    connectionId,
    enabled,
    options?.monaco,
    schema,
    effectiveTables,
    activeDriver,
    keywordCase,
  ]);

  return { effectiveTables };
}

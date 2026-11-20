import { extractQueryParams } from "./queryParameters";
import type { QueryResult, Tab } from "../types/editor";

/**
 * Returns true if the tab can edit query parameters (must not be a table tab
 * and must contain at least one extracted query parameter).
 */
export function canEditParameters(
  tab?: Pick<Tab, "type" | "query"> | null,
): boolean {
  if (!tab || tab.type === "table" || !tab.query) {
    return false;
  }
  return extractQueryParams(tab.query).length > 0;
}

/**
 * Returns true if the query result has rows available for export.
 */
export function canExportResult(
  result?: Pick<QueryResult, "rows"> | null,
): boolean {
  return Boolean(result && Array.isArray(result.rows) && result.rows.length > 0);
}

/**
 * Returns the human-readable keyboard shortcut for the run action.
 */
export function getRunShortcutLabel(isMac: boolean): string {
  return isMac ? "Cmd+Enter" : "Ctrl+Enter";
}

/**
 * Returns the ARIA keyshortcuts attribute value for the run action.
 */
export function getRunAriaShortcut(isMac: boolean): string {
  return isMac ? "Meta+Enter" : "Control+Enter";
}

/**
 * Resolves the active schema or database name to display in the selector.
 */
export function getActiveDatabaseLabel(
  schema: string | undefined | null,
  selectedDatabases: string[],
): string {
  if (schema && schema.trim().length > 0) {
    return schema;
  }
  return selectedDatabases[0] || "";
}

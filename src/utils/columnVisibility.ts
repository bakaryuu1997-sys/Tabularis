/**
 * Client-side column show/hide for the data grid. Purely presentational — it
 * never changes the SQL or the underlying row/column indices, so cell editing,
 * selection and focus (all index-based) keep working. Hidden columns are stored
 * by name and can be persisted per table.
 */

const STORAGE_PREFIX = "tabularis_hidden_cols:";

/** Toggle a column's hidden state, returning a new Set. */
export function toggleHiddenColumn(
  hidden: Set<string>,
  column: string,
): Set<string> {
  const next = new Set(hidden);
  if (next.has(column)) next.delete(column);
  else next.add(column);
  return next;
}

/**
 * Build the react-table `columnVisibility` map (hidden columns → false) so the
 * header omits them. Only columns that are actually hidden appear in the map.
 */
export function computeColumnVisibility(
  hidden: Set<string>,
): Record<string, boolean> {
  const visibility: Record<string, boolean> = {};
  for (const col of hidden) visibility[col] = false;
  return visibility;
}

/** Drop hidden entries that no longer exist in the current column set. */
export function pruneHiddenColumns(
  hidden: Set<string>,
  columns: string[],
): Set<string> {
  const live = new Set(columns);
  const next = new Set<string>();
  for (const col of hidden) if (live.has(col)) next.add(col);
  return next;
}

export function loadHiddenColumns(key: string | undefined): Set<string> {
  if (!key) return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((c): c is string => typeof c === "string"))
      : new Set();
  } catch {
    return new Set();
  }
}

export function saveHiddenColumns(
  key: string | undefined,
  hidden: Set<string>,
): void {
  if (!key) return;
  try {
    if (hidden.size === 0) localStorage.removeItem(STORAGE_PREFIX + key);
    else localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify([...hidden]));
  } catch {
    /* storage unavailable — ignore */
  }
}

import type { PendingInsertion, Tab } from "../types/editor";
import { serializePkKey } from "./dataGrid";

/**
 * Pure state transitions for the pending (uncommitted) edits of a result tab.
 *
 * Each function receives the current tab and returns the patch to apply with `updateTab`, or `null`
 * when nothing should change. They never mutate their input, which keeps the grid's undo / discard
 * behaviour easy to test without rendering the editor.
 */

type PendingTab = Pick<
  Tab,
  "pendingChanges" | "pendingDeletions" | "pendingInsertions" | "autoIncrementColumns" | "result"
>;

type TabPatch = Partial<Pick<Tab, "pendingChanges" | "pendingDeletions" | "pendingInsertions">>;

const keyOf = (pkVal: unknown) => serializePkKey(pkVal as Record<string, unknown>);

/** Sets (or, when `value` is `undefined`, removes) one edited cell of an existing row. */
export function applyPendingChange(
  tab: PendingTab,
  pkVal: unknown,
  colName: string,
  value: unknown,
): TabPatch {
  const pkKey = keyOf(pkVal);
  const currentPending = tab.pendingChanges || {};
  const rowEntry = currentPending[pkKey] || { pkOriginalValue: pkVal, changes: {} };

  const newChanges = { ...rowEntry.changes };
  if (value === undefined) delete newChanges[colName];
  else newChanges[colName] = value;

  const newPending = { ...currentPending };
  if (Object.keys(newChanges).length === 0) delete newPending[pkKey];
  else newPending[pkKey] = { ...rowEntry, changes: newChanges };

  return { pendingChanges: newPending };
}

/** Edits one cell of a row that has not been inserted yet. `null` if the insertion is unknown. */
export function applyPendingInsertionChange(
  tab: PendingTab,
  tempId: string,
  colName: string,
  value: unknown,
): TabPatch | null {
  const current = tab.pendingInsertions || {};
  const insertion = current[tempId];
  if (!insertion) return null;

  const newData = { ...insertion.data };
  if (value === undefined) delete newData[colName];
  else newData[colName] = value;

  return { pendingInsertions: { ...current, [tempId]: { ...insertion, data: newData } } };
}

/** Drops a not-yet-inserted row. `null` if the tab has no pending insertions. */
export function discardPendingInsertion(tab: PendingTab, tempId: string): TabPatch | null {
  if (!tab.pendingInsertions) return null;
  const next = { ...tab.pendingInsertions };
  delete next[tempId];
  return { pendingInsertions: next };
}

/** Un-marks a row for deletion; clears the map entirely when it becomes empty. */
export function revertPendingDeletion(tab: PendingTab, pkVal: unknown): TabPatch | null {
  if (!tab.pendingDeletions) return null;
  const next = { ...tab.pendingDeletions };
  delete next[keyOf(pkVal)];
  return { pendingDeletions: Object.keys(next).length > 0 ? next : undefined };
}

/** Marks several rows for deletion at once (a single one is just a list of one). */
export function markRowsForDeletion(tab: PendingTab, pkVals: unknown[]): TabPatch {
  const next = { ...(tab.pendingDeletions || {}) };
  for (const pkVal of pkVals) next[keyOf(pkVal)] = pkVal;
  return { pendingDeletions: next };
}

/**
 * Queues a copy of `rowData` as a new row. Auto-increment columns are reset to NULL so the database
 * assigns them. `tempId` is injected to keep the function deterministic.
 */
export function duplicateRowAsInsertion(
  tab: PendingTab,
  rowData: Record<string, unknown>,
  tempId: string,
): TabPatch {
  const data: Record<string, unknown> = { ...rowData };
  for (const col of tab.autoIncrementColumns ?? []) data[col] = null;

  const current = tab.pendingInsertions || {};
  const displayIndex = (tab.result?.rows.length || 0) + Object.keys(current).length;
  const insertion: PendingInsertion = { tempId, data, displayIndex };

  return { pendingInsertions: { ...current, [tempId]: insertion } };
}

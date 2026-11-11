/**
 * Pure helpers for dragging tabs: reordering the tab strip, reordering the pinned tabs of the split
 * pane, and moving a tab between the left strip and the split pane.
 */

export type DropPosition = "before" | "after";
export type TabDragOrigin = "left" | "right";

export interface TabDragPayload {
  tabId: string;
  origin: TabDragOrigin;
}

/** Custom MIME type so only tab drags (never files or text) are accepted by the drop zones. */
export const TAB_DRAG_MIME = "application/x-tabularis-tab";

let current: TabDragPayload | null = null;

/**
 * Browsers hide the dragged data during `dragover`, so the payload is also kept here for the duration of
 * a drag. It is always cleared on `dragend`.
 */
export const tabDrag = {
  get payload(): TabDragPayload | null {
    return current;
  },
  start(payload: TabDragPayload) {
    current = payload;
  },
  clear() {
    current = null;
  },
};

/** Which side of a target the pointer is on: the left half means "before", the right half "after". */
export function dropPositionFromPointer(clientX: number, rect: { left: number; width: number }): DropPosition {
  if (rect.width <= 0) return "after";
  return clientX - rect.left < rect.width / 2 ? "before" : "after";
}

/**
 * Moves the item with `draggedId` next to the item with `targetId`.
 * Returns the very same array when nothing would change (unknown ids, dropping on itself, or dropping
 * where the item already is), so callers can skip a state update.
 */
export function moveRelative<T>(
  items: T[],
  getId: (item: T) => string,
  draggedId: string,
  targetId: string,
  position: DropPosition,
): T[] {
  if (draggedId === targetId) return items;
  const from = items.findIndex((i) => getId(i) === draggedId);
  const target = items.findIndex((i) => getId(i) === targetId);
  if (from === -1 || target === -1) return items;

  const without = items.filter((_, i) => i !== from);
  const targetInWithout = without.findIndex((i) => getId(i) === targetId);
  const insertAt = position === "before" ? targetInWithout : targetInWithout + 1;
  if (insertAt === from) return items;

  return [...without.slice(0, insertAt), items[from], ...without.slice(insertAt)];
}

export function reorderTabs<T extends { id: string }>(
  tabs: T[],
  draggedId: string,
  targetId: string,
  position: DropPosition,
): T[] {
  return moveRelative(tabs, (t) => t.id, draggedId, targetId, position);
}

export function reorderPinnedIds(
  ids: string[],
  draggedId: string,
  targetId: string,
  position: DropPosition,
): string[] {
  return moveRelative(ids, (id) => id, draggedId, targetId, position);
}

/**
 * Pins `tabId`: inserts it next to `targetId` when that pinned tab exists, otherwise appends it.
 * A tab that is already pinned is moved instead of duplicated.
 */
export function pinTabAt(
  ids: string[],
  tabId: string,
  targetId: string | null,
  position: DropPosition,
): string[] {
  if (ids.includes(tabId)) {
    return targetId && ids.includes(targetId) ? reorderPinnedIds(ids, tabId, targetId, position) : ids;
  }
  const targetIndex = targetId ? ids.indexOf(targetId) : -1;
  if (targetIndex === -1) return [...ids, tabId];
  const insertAt = position === "before" ? targetIndex : targetIndex + 1;
  return [...ids.slice(0, insertAt), tabId, ...ids.slice(insertAt)];
}

/** What a drop means, given where the drag started and where it was released. */
export type TabDropAction =
  | { kind: "reorder-left"; draggedId: string; targetId: string; position: DropPosition }
  | { kind: "unpin-to-left"; draggedId: string; targetId: string | null; position: DropPosition }
  | { kind: "reorder-right"; draggedId: string; targetId: string; position: DropPosition }
  | { kind: "pin-from-left"; draggedId: string; targetId: string | null; position: DropPosition }
  | { kind: "none" };

export function resolveTabDrop(
  payload: TabDragPayload | null,
  destination: TabDragOrigin,
  targetId: string | null,
  position: DropPosition,
): TabDropAction {
  if (!payload) return { kind: "none" };
  const { tabId, origin } = payload;
  if (origin === "left" && destination === "left") {
    return targetId ? { kind: "reorder-left", draggedId: tabId, targetId, position } : { kind: "none" };
  }
  if (origin === "right" && destination === "left") {
    return { kind: "unpin-to-left", draggedId: tabId, targetId, position };
  }
  if (origin === "right" && destination === "right") {
    return targetId ? { kind: "reorder-right", draggedId: tabId, targetId, position } : { kind: "none" };
  }
  return { kind: "pin-from-left", draggedId: tabId, targetId, position };
}

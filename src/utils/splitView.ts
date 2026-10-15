import type { Tab } from "../types/editor";

// The left (main) pane may take between 25% and 75% of the workspace width so
// neither side collapses to an unusable sliver.
export const MIN_SPLIT_RATIO = 0.25;
export const MAX_SPLIT_RATIO = 0.75;
export const DEFAULT_SPLIT_RATIO = 0.5;

/** Clamp a left-pane width fraction into the allowed range. */
export function clampSplitRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return DEFAULT_SPLIT_RATIO;
  return Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, ratio));
}

/**
 * Convert an absolute pointer X position during a divider drag into a clamped
 * left-pane width fraction, given the workspace container's geometry.
 */
export function splitRatioFromClientX(
  clientX: number,
  containerLeft: number,
  containerWidth: number,
): number {
  if (containerWidth <= 0) return DEFAULT_SPLIT_RATIO;
  return clampSplitRatio((clientX - containerLeft) / containerWidth);
}

/**
 * Convert an absolute pointer Y position during a divider drag into a clamped
 * top-pane height fraction, given the workspace container's geometry.
 */
export function splitRatioFromClientY(
  clientY: number,
  containerTop: number,
  containerHeight: number,
): number {
  if (containerHeight <= 0) return DEFAULT_SPLIT_RATIO;
  return clampSplitRatio((clientY - containerTop) / containerHeight);
}

export type SplitOrientation = "horizontal" | "vertical";

/** Toggle split orientation between horizontal (side-by-side) and vertical (stacked). */
export function toggleSplitOrientation(
  current: SplitOrientation,
): SplitOrientation {
  return current === "horizontal" ? "vertical" : "horizontal";
}

/** Resolve the tab pinned into the split pane, or null if it no longer exists. */
export function resolveSplitTab(
  tabs: Tab[],
  splitTabId: string | null,
): Tab | null {
  if (!splitTabId) return null;
  return tabs.find((t) => t.id === splitTabId) ?? null;
}

/** Resolve the still-existing pinned tabs, preserving pin order. */
export function resolvePinnedTabs(tabs: Tab[], splitTabIds: string[]): Tab[] {
  const byId = new Map(tabs.map((t) => [t.id, t]));
  const seen = new Set<string>();
  const result: Tab[] = [];
  for (const id of splitTabIds) {
    if (seen.has(id)) continue;
    const tab = byId.get(id);
    if (tab) {
      result.push(tab);
      seen.add(id);
    }
  }
  return result;
}

/**
 * Toggle a tab's pin: removing it if already pinned, otherwise appending it.
 * Also resolves which pinned tab should be shown next.
 */
export function togglePinnedTab(
  splitTabIds: string[],
  activeSplitTabId: string | null,
  tabId: string,
): { splitTabIds: string[]; activeSplitTabId: string | null } {
  if (splitTabIds.includes(tabId)) {
    const next = splitTabIds.filter((id) => id !== tabId);
    const nextActive =
      activeSplitTabId === tabId ? (next[next.length - 1] ?? null) : activeSplitTabId;
    return { splitTabIds: next, activeSplitTabId: nextActive };
  }
  return {
    splitTabIds: [...splitTabIds, tabId],
    activeSplitTabId: tabId,
  };
}

// ── persistence ───────────────────────────────────────────────────────────────

const SPLIT_STORAGE_KEY = "tabularis_split_view";

export interface SplitState {
  splitTabIds: string[];
  activeSplitTabId: string | null;
  splitRatio: number;
  splitOrientation?: SplitOrientation;
}

const EMPTY_SPLIT_STATE: SplitState = {
  splitTabIds: [],
  activeSplitTabId: null,
  splitRatio: DEFAULT_SPLIT_RATIO,
  splitOrientation: "horizontal",
};

/** Load the persisted split layout (pinned tab ids + active pin + divider ratio + orientation).
 * Tolerates the older single-`splitTabId` shape. Stale ids are validated against
 * the live tab list separately via {@link resolvePinnedTabs}, so they are safe. */
export function loadSplitState(): SplitState {
  try {
    const raw = localStorage.getItem(SPLIT_STORAGE_KEY);
    if (!raw) return { ...EMPTY_SPLIT_STATE };
    const parsed = JSON.parse(raw) as Partial<SplitState> & {
      splitTabId?: string | null;
    };
    const splitRatio = clampSplitRatio(Number(parsed.splitRatio));
    const splitOrientation: SplitOrientation =
      parsed.splitOrientation === "vertical" ? "vertical" : "horizontal";

    // New (array) shape.
    if (Array.isArray(parsed.splitTabIds)) {
      const ids = parsed.splitTabIds.filter(
        (id): id is string => typeof id === "string",
      );
      const active =
        typeof parsed.activeSplitTabId === "string" &&
        ids.includes(parsed.activeSplitTabId)
          ? parsed.activeSplitTabId
          : (ids[ids.length - 1] ?? null);
      return {
        splitTabIds: ids,
        activeSplitTabId: active,
        splitRatio,
        splitOrientation,
      };
    }

    // Legacy single-id shape.
    if (typeof parsed.splitTabId === "string") {
      return {
        splitTabIds: [parsed.splitTabId],
        activeSplitTabId: parsed.splitTabId,
        splitRatio,
        splitOrientation,
      };
    }

    return {
      splitTabIds: [],
      activeSplitTabId: null,
      splitRatio,
      splitOrientation,
    };
  } catch {
    return { ...EMPTY_SPLIT_STATE };
  }
}

/** Persist the split layout so it survives an app restart. */
export function saveSplitState(state: SplitState): void {
  try {
    localStorage.setItem(SPLIT_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable — ignore */
  }
}

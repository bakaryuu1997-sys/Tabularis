import { useState, useEffect, useCallback } from "react";
import { getTabScrollState, getScrollPageOffset } from "../utils/tabScroll";

export interface UseScrollableTabStripOptions {
  activeTabId?: string | null;
  tabCount?: number;
  scrollRatio?: number;
}

export interface UseScrollableTabStripReturn {
  /**
   * Callback ref for the scrollable strip. A callback ref (instead of a ref
   * object) lets the listeners attach when the strip mounts later than the
   * component using the hook, e.g. the split pane strip that only renders once
   * a second tab is pinned.
   */
  containerRef: (element: HTMLDivElement | null) => void;
  canScrollLeft: boolean;
  canScrollRight: boolean;
  updateScrollState: () => void;
  scrollByPage: (direction: "left" | "right") => void;
  scrollTabIntoView: (tabId: string) => void;
}

export function useScrollableTabStrip({
  activeTabId,
  tabCount = 0,
  scrollRatio = 0.8,
}: UseScrollableTabStripOptions = {}): UseScrollableTabStripReturn {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const containerRef = useCallback((element: HTMLDivElement | null) => {
    setContainer(element);
    // Compute the chevron state right away when the strip mounts.
    if (element) {
      const state = getTabScrollState(element);
      setCanScrollLeft(state.canScrollLeft);
      setCanScrollRight(state.canScrollRight);
    }
  }, []);

  const updateScrollState = useCallback(() => {
    if (!container) return;
    const state = getTabScrollState(container);
    setCanScrollLeft(state.canScrollLeft);
    setCanScrollRight(state.canScrollRight);
  }, [container]);

  const scrollByPage = useCallback(
    (direction: "left" | "right") => {
      if (!container) return;
      const left = getScrollPageOffset(
        container.scrollLeft,
        container.clientWidth,
        direction,
        scrollRatio,
      );
      container.scrollTo({ left, behavior: "smooth" });
    },
    [container, scrollRatio],
  );

  const scrollTabIntoView = useCallback(
    (tabId: string) => {
      if (!container || !tabId) return;
      const tabEl = Array.from(container.children).find(
        (child) => child.getAttribute("data-tab-id") === tabId,
      ) as HTMLElement | undefined;
      tabEl?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    },
    [container],
  );

  // Vertical mouse wheel scrolls the strip horizontally (non-passive listener).
  useEffect(() => {
    if (!container) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      container.scrollLeft += e.deltaY;
    };
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [container]);

  // Keep the chevrons in sync with scrolling, resizing and tab changes.
  useEffect(() => {
    if (!container) return;
    // Tabs were added or removed: re-check once the strip has laid out again.
    const frame = requestAnimationFrame(updateScrollState);
    container.addEventListener("scroll", updateScrollState, { passive: true });

    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateScrollState) : null;
    resizeObserver?.observe(container);

    return () => {
      cancelAnimationFrame(frame);
      container.removeEventListener("scroll", updateScrollState);
      resizeObserver?.disconnect();
    };
  }, [container, updateScrollState, tabCount]);

  // Keep the active tab visible.
  useEffect(() => {
    if (activeTabId) scrollTabIntoView(activeTabId);
  }, [activeTabId, scrollTabIntoView]);

  return {
    containerRef,
    canScrollLeft,
    canScrollRight,
    updateScrollState,
    scrollByPage,
    scrollTabIntoView,
  };
}

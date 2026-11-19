import { useRef, useState, useEffect, useCallback, type RefObject } from "react";
import { getTabScrollState } from "../utils/tabScroll";

export interface UseScrollableTabStripOptions {
  activeTabId?: string | null;
  tabCount?: number;
  scrollRatio?: number;
}

export interface UseScrollableTabStripReturn {
  containerRef: RefObject<HTMLDivElement | null>;
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const state = getTabScrollState(el);
    setCanScrollLeft(state.canScrollLeft);
    setCanScrollRight(state.canScrollRight);
  }, []);

  const scrollByPage = useCallback(
    (direction: "left" | "right") => {
      const el = containerRef.current;
      if (!el) return;
      const offset = (direction === "left" ? -1 : 1) * Math.max(100, Math.floor(el.clientWidth * scrollRatio));
      el.scrollBy({ left: offset, behavior: "smooth" });
    },
    [scrollRatio],
  );

  const scrollTabIntoView = useCallback((tabId: string) => {
    const el = containerRef.current;
    if (!el || !tabId) return;
    try {
      // Find tab by data-tab-id attribute
      const escapedId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(tabId) : tabId;
      const tabEl = el.querySelector<HTMLElement>(`[data-tab-id="${escapedId}"]`);
      if (tabEl) {
        tabEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      }
    } catch {
      // If CSS.escape fails on special characters, fallback to looping childNodes
      const children = Array.from(el.children) as HTMLElement[];
      const found = children.find((c) => c.getAttribute("data-tab-id") === tabId);
      found?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
  }, []);

  // Vertical mouse wheel translated to horizontal scroll (non-passive listener)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
        updateScrollState();
      }
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", handleWheel);
    };
  }, [updateScrollState]);

  // Track size, scroll, and tab count changes
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    updateScrollState();

    const handleScroll = () => {
      updateScrollState();
    };
    el.addEventListener("scroll", handleScroll, { passive: true });

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        updateScrollState();
      });
      resizeObserver.observe(el);
    }

    return () => {
      el.removeEventListener("scroll", handleScroll);
      resizeObserver?.disconnect();
    };
  }, [updateScrollState, tabCount]);

  // Auto-scroll active tab into view whenever activeTabId changes
  useEffect(() => {
    if (activeTabId) {
      scrollTabIntoView(activeTabId);
    }
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

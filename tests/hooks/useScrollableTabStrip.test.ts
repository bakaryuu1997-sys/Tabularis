import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useScrollableTabStrip } from "../../src/hooks/useScrollableTabStrip";

function makeContainer(): HTMLDivElement {
  const el = document.createElement("div");
  Object.defineProperty(el, "clientWidth", { value: 500, configurable: true });
  Object.defineProperty(el, "scrollWidth", { value: 1000, configurable: true });
  Object.defineProperty(el, "scrollLeft", { value: 0, writable: true, configurable: true });
  el.scrollTo = vi.fn() as unknown as typeof el.scrollTo;
  return el;
}

function wheel(deltaY: number): WheelEvent {
  const event = new Event("wheel", { cancelable: true }) as WheelEvent;
  Object.defineProperty(event, "deltaY", { value: deltaY });
  return event;
}

describe("useScrollableTabStrip", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = makeContainer();
  });

  it("starts with both chevrons disabled before the strip is mounted", () => {
    const { result } = renderHook(() => useScrollableTabStrip());
    expect(result.current.canScrollLeft).toBe(false);
    expect(result.current.canScrollRight).toBe(false);
  });

  it("computes the chevron state as soon as the strip mounts", () => {
    const { result } = renderHook(() => useScrollableTabStrip());
    act(() => result.current.containerRef(container));
    expect(result.current.canScrollLeft).toBe(false);
    expect(result.current.canScrollRight).toBe(true);

    container.scrollLeft = 200;
    act(() => result.current.updateScrollState());
    expect(result.current.canScrollLeft).toBe(true);
    expect(result.current.canScrollRight).toBe(true);

    container.scrollLeft = 500;
    act(() => {
      container.dispatchEvent(new Event("scroll"));
    });
    expect(result.current.canScrollLeft).toBe(true);
    expect(result.current.canScrollRight).toBe(false);
  });

  it("scrollByPage scrolls by a share of the visible width", () => {
    const { result } = renderHook(() => useScrollableTabStrip({ scrollRatio: 0.8 }));
    act(() => result.current.containerRef(container));

    act(() => result.current.scrollByPage("right"));
    expect(container.scrollTo).toHaveBeenLastCalledWith({ left: 400, behavior: "smooth" });

    container.scrollLeft = 600;
    act(() => result.current.scrollByPage("left"));
    expect(container.scrollTo).toHaveBeenLastCalledWith({ left: 200, behavior: "smooth" });
  });

  it("scrollTabIntoView scrolls the matching tab into view", () => {
    const tabEl = document.createElement("div");
    tabEl.setAttribute("data-tab-id", "tab-123");
    tabEl.scrollIntoView = vi.fn();
    container.appendChild(tabEl);

    const { result } = renderHook(() => useScrollableTabStrip());
    act(() => result.current.containerRef(container));
    act(() => result.current.scrollTabIntoView("tab-123"));

    expect(tabEl.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  });

  it("turns vertical wheel into horizontal scroll", () => {
    const { result } = renderHook(() => useScrollableTabStrip());
    act(() => result.current.containerRef(container));

    const event = wheel(120);
    act(() => {
      container.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(container.scrollLeft).toBe(120);
  });

  it("attaches the wheel listener when the strip mounts after the first render", () => {
    // The split pane strip only renders once a second tab is pinned.
    const { result, rerender } = renderHook(({ count }) => useScrollableTabStrip({ tabCount: count }), {
      initialProps: { count: 1 },
    });
    rerender({ count: 2 });
    act(() => result.current.containerRef(container));

    act(() => {
      container.dispatchEvent(wheel(80));
    });
    expect(container.scrollLeft).toBe(80);
  });

  it("detaches the wheel listener when the strip unmounts", () => {
    const { result } = renderHook(() => useScrollableTabStrip());
    act(() => result.current.containerRef(container));
    act(() => result.current.containerRef(null));

    const event = wheel(120);
    act(() => {
      container.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
    expect(container.scrollLeft).toBe(0);
  });
});

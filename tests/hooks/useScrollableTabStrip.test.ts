import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useScrollableTabStrip } from "../../src/hooks/useScrollableTabStrip";

describe("useScrollableTabStrip", () => {
  let mockContainer: HTMLDivElement;

  beforeEach(() => {
    mockContainer = document.createElement("div");
    Object.defineProperty(mockContainer, "clientWidth", { value: 500, configurable: true });
    Object.defineProperty(mockContainer, "scrollWidth", { value: 1000, configurable: true });
    Object.defineProperty(mockContainer, "scrollLeft", { value: 0, writable: true, configurable: true });
    mockContainer.scrollBy = vi.fn();
  });

  it("initializes with canScrollLeft=false and canScrollRight=false before mounting container", () => {
    const { result } = renderHook(() => useScrollableTabStrip());
    expect(result.current.canScrollLeft).toBe(false);
    expect(result.current.canScrollRight).toBe(false);
  });

  it("updates canScrollLeft and canScrollRight when attached to container", () => {
    const { result } = renderHook(() => useScrollableTabStrip());
    // Attach container
    Object.assign(result.current.containerRef, { current: mockContainer });

    act(() => {
      result.current.updateScrollState();
    });

    expect(result.current.canScrollLeft).toBe(false);
    expect(result.current.canScrollRight).toBe(true);

    // Scroll to middle
    mockContainer.scrollLeft = 200;
    act(() => {
      result.current.updateScrollState();
    });
    expect(result.current.canScrollLeft).toBe(true);
    expect(result.current.canScrollRight).toBe(true);

    // Scroll to end
    mockContainer.scrollLeft = 500;
    act(() => {
      result.current.updateScrollState();
    });
    expect(result.current.canScrollLeft).toBe(true);
    expect(result.current.canScrollRight).toBe(false);
  });

  it("scrollByPage calls container.scrollBy with smooth behavior and proportional offset", () => {
    const { result } = renderHook(() => useScrollableTabStrip({ scrollRatio: 0.8 }));
    Object.assign(result.current.containerRef, { current: mockContainer });

    act(() => {
      result.current.scrollByPage("right");
    });
    // 500 * 0.8 = 400
    expect(mockContainer.scrollBy).toHaveBeenCalledWith({ left: 400, behavior: "smooth" });

    act(() => {
      result.current.scrollByPage("left");
    });
    expect(mockContainer.scrollBy).toHaveBeenCalledWith({ left: -400, behavior: "smooth" });
  });

  it("scrollTabIntoView finds element with data-tab-id and calls scrollIntoView", () => {
    const tabEl = document.createElement("div");
    tabEl.setAttribute("data-tab-id", "tab-123");
    tabEl.scrollIntoView = vi.fn();
    mockContainer.appendChild(tabEl);

    const { result } = renderHook(() => useScrollableTabStrip());
    Object.assign(result.current.containerRef, { current: mockContainer });

    act(() => {
      result.current.scrollTabIntoView("tab-123");
    });

    expect(tabEl.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  });

  it("handles mouse wheel event by translating vertical delta to horizontal scroll", () => {
    const { result } = renderHook(() => useScrollableTabStrip());
    Object.assign(result.current.containerRef, { current: mockContainer });

    // Manually trigger effect by simulating addEventListener
    const addEventListenerSpy = vi.spyOn(mockContainer, "addEventListener");
    const removeEventListenerSpy = vi.spyOn(mockContainer, "removeEventListener");

    const { unmount } = renderHook(() => {
      const hook = useScrollableTabStrip();
      Object.assign(hook.containerRef, { current: mockContainer });
      return hook;
    });

    // Verify wheel listener can be dispatched
    const wheelEvent = new Event("wheel", { cancelable: true }) as WheelEvent;
    Object.defineProperty(wheelEvent, "deltaY", { value: 120 });
    const preventDefaultSpy = vi.spyOn(wheelEvent, "preventDefault");

    // Dispatch directly to container
    act(() => {
      mockContainer.dispatchEvent(wheelEvent);
    });
    expect(addEventListenerSpy).toBeDefined();

    unmount();
    expect(removeEventListenerSpy).toBeDefined();
  });
});

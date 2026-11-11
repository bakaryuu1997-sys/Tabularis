import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { PresentationProvider } from "../../src/contexts/PresentationProvider";
import { usePresentationMode } from "../../src/hooks/usePresentationMode";

const webview = vi.hoisted(() => ({ setZoom: vi.fn() }));
const settingsState = vi.hoisted(() => ({ settings: {} as Record<string, unknown> }));

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({ setZoom: webview.setZoom }),
}));

vi.mock("../../src/hooks/useSettings", () => ({
  useSettings: () => ({ settings: settingsState.settings }),
}));

const wrapper = ({ children }: { children: ReactNode }) => <PresentationProvider>{children}</PresentationProvider>;

describe("PresentationProvider", () => {
  beforeEach(() => {
    webview.setZoom.mockReset();
    webview.setZoom.mockResolvedValue(undefined);
    settingsState.settings = {};
    document.documentElement.classList.remove("presentation-mode");
  });

  it("starts in normal mode and does not touch the zoom", () => {
    const { result } = renderHook(() => usePresentationMode(), { wrapper });
    expect(result.current.isPresentationMode).toBe(false);
    expect(webview.setZoom).not.toHaveBeenCalled();
    expect(document.documentElement.classList.contains("presentation-mode")).toBe(false);
  });

  it("zooms the window and marks the root element when turned on", () => {
    const { result } = renderHook(() => usePresentationMode(), { wrapper });
    act(() => result.current.togglePresentationMode());
    expect(result.current.isPresentationMode).toBe(true);
    expect(webview.setZoom).toHaveBeenLastCalledWith(1.25);
    expect(document.documentElement.classList.contains("presentation-mode")).toBe(true);
  });

  it("restores the normal zoom and class when turned off", () => {
    const { result } = renderHook(() => usePresentationMode(), { wrapper });
    act(() => result.current.togglePresentationMode());
    act(() => result.current.exitPresentationMode());
    expect(result.current.isPresentationMode).toBe(false);
    expect(webview.setZoom).toHaveBeenLastCalledWith(1);
    expect(document.documentElement.classList.contains("presentation-mode")).toBe(false);
  });

  it("uses the zoom factor from the settings", () => {
    settingsState.settings = { presentationZoom: 1.5 };
    const { result } = renderHook(() => usePresentationMode(), { wrapper });
    act(() => result.current.togglePresentationMode());
    expect(webview.setZoom).toHaveBeenLastCalledWith(1.5);
  });

  it("ignores an unsupported zoom factor in the settings", () => {
    settingsState.settings = { presentationZoom: 7 };
    const { result } = renderHook(() => usePresentationMode(), { wrapper });
    act(() => result.current.togglePresentationMode());
    expect(webview.setZoom).toHaveBeenLastCalledWith(1.25);
  });

  it("toggles on and off with the same call", () => {
    const { result } = renderHook(() => usePresentationMode(), { wrapper });
    act(() => result.current.togglePresentationMode());
    act(() => result.current.togglePresentationMode());
    expect(result.current.isPresentationMode).toBe(false);
    expect(webview.setZoom.mock.calls.map(([z]) => z)).toEqual([1.25, 1]);
  });

  it("still switches modes when the zoom call fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    webview.setZoom.mockRejectedValue(new Error("not permitted"));
    const { result } = renderHook(() => usePresentationMode(), { wrapper });
    await act(async () => result.current.togglePresentationMode());
    expect(result.current.isPresentationMode).toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("puts the zoom back if the provider unmounts while presenting", () => {
    const { result, unmount } = renderHook(() => usePresentationMode(), { wrapper });
    act(() => result.current.togglePresentationMode());
    webview.setZoom.mockClear();
    unmount();
    expect(webview.setZoom).toHaveBeenCalledWith(1);
    expect(document.documentElement.classList.contains("presentation-mode")).toBe(false);
  });

  it("reports normal mode outside any provider", () => {
    const { result } = renderHook(() => usePresentationMode());
    expect(result.current.isPresentationMode).toBe(false);
    expect(() => result.current.togglePresentationMode()).not.toThrow();
  });
});

import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { emit, listen } from "@tauri-apps/api/event";
import {
  PRESENTATION_CHANGED_EVENT,
  PRESENTATION_REQUEST_EVENT,
  PresentationProvider,
} from "../../src/contexts/PresentationProvider";
import { usePresentationMode } from "../../src/hooks/usePresentationMode";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(), emit: vi.fn() }));
vi.mock("@tauri-apps/api/webview", () => ({ getCurrentWebview: () => ({ setZoom: vi.fn().mockResolvedValue(undefined) }) }));
vi.mock("../../src/hooks/useSettings", () => ({ useSettings: () => ({ settings: {} }) }));

const wrapper = ({ children }: { children: ReactNode }) => <PresentationProvider>{children}</PresentationProvider>;

describe("PresentationProvider: other windows", () => {
  const handlers = new Map<string, (event: { payload?: unknown }) => void>();
  const unlisten = vi.fn();

  beforeEach(() => {
    handlers.clear();
    unlisten.mockReset();
    vi.mocked(emit).mockReset();
    vi.mocked(emit).mockResolvedValue(undefined);
    vi.mocked(listen).mockReset();
    vi.mocked(listen).mockImplementation((async (name: string, handler: (event: { payload?: unknown }) => void) => {
      handlers.set(name, handler);
      return unlisten;
    }) as never);
  });

  const emitted = () => vi.mocked(emit).mock.calls.map(([name, payload]) => [name, payload]);

  it("asks the other windows for the state when it opens, without announcing a state of its own", async () => {
    renderHook(() => usePresentationMode(), { wrapper });
    await act(async () => undefined);
    expect(emitted()).toEqual([[PRESENTATION_REQUEST_EVENT, undefined]]);
  });

  it("tells the other windows when the user switches it on and off", async () => {
    const { result } = renderHook(() => usePresentationMode(), { wrapper });
    await act(async () => undefined);
    vi.mocked(emit).mockClear();

    act(() => result.current.togglePresentationMode());
    act(() => result.current.exitPresentationMode());

    expect(emitted()).toEqual([
      [PRESENTATION_CHANGED_EVENT, { enabled: true }],
      [PRESENTATION_CHANGED_EVENT, { enabled: false }],
    ]);
  });

  it("follows a change made in another window without echoing it back", async () => {
    const { result } = renderHook(() => usePresentationMode(), { wrapper });
    await act(async () => undefined);
    vi.mocked(emit).mockClear();

    act(() => handlers.get(PRESENTATION_CHANGED_EVENT)?.({ payload: { enabled: true } }));
    expect(result.current.isPresentationMode).toBe(true);
    expect(vi.mocked(emit)).not.toHaveBeenCalled();

    act(() => handlers.get(PRESENTATION_CHANGED_EVENT)?.({ payload: { enabled: false } }));
    expect(result.current.isPresentationMode).toBe(false);
  });

  it("treats a malformed message as 'off' rather than crashing", async () => {
    const { result } = renderHook(() => usePresentationMode(), { wrapper });
    await act(async () => undefined);
    act(() => handlers.get(PRESENTATION_CHANGED_EVENT)?.({ payload: { enabled: true } }));
    act(() => handlers.get(PRESENTATION_CHANGED_EVENT)?.({}));
    expect(result.current.isPresentationMode).toBe(false);
  });

  it("answers a new window's request only while presenting", async () => {
    const { result } = renderHook(() => usePresentationMode(), { wrapper });
    await act(async () => undefined);

    vi.mocked(emit).mockClear();
    act(() => handlers.get(PRESENTATION_REQUEST_EVENT)?.({}));
    expect(vi.mocked(emit)).not.toHaveBeenCalled();

    act(() => result.current.togglePresentationMode());
    vi.mocked(emit).mockClear();
    act(() => handlers.get(PRESENTATION_REQUEST_EVENT)?.({}));
    expect(emitted()).toEqual([[PRESENTATION_CHANGED_EVENT, { enabled: true }]]);
  });

  it("stops listening when it unmounts", async () => {
    const { unmount } = renderHook(() => usePresentationMode(), { wrapper });
    await act(async () => undefined);
    unmount();
    expect(unlisten).toHaveBeenCalledTimes(2);
  });

  it("keeps working if the event system is unavailable", async () => {
    vi.mocked(emit).mockRejectedValue(new Error("no event system"));
    vi.mocked(listen).mockRejectedValue(new Error("no event system"));
    const { result } = renderHook(() => usePresentationMode(), { wrapper });
    await act(async () => result.current.togglePresentationMode());
    expect(result.current.isPresentationMode).toBe(true);
  });
});

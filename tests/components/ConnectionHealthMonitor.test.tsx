import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ConnectionHealthMonitor } from "../../src/components/ConnectionHealthMonitor";

let eventHandler: ((event: { payload: { connectionId: string; error: string } }) => void) | null = null;
const mockShowAlert = vi.fn();
const mockConnect = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((event: string, handler: any) => {
    if (event === "connection-health-failed") {
      eventHandler = handler;
    }
    return Promise.resolve(() => {});
  }),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("../../src/hooks/useAlert", () => ({
  useAlert: () => ({
    showAlert: mockShowAlert,
  }),
}));

vi.mock("../../src/hooks/useDatabase", () => ({
  useDatabase: () => ({
    connect: mockConnect,
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("ConnectionHealthMonitor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockShowAlert.mockClear();
    mockConnect.mockClear();
    eventHandler = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders null initially", () => {
    const { container } = render(<ConnectionHealthMonitor />);
    expect(container.firstChild).toBeNull();
  });

  it("handles connection-health-failed with backoff and shows reconnecting indicator", async () => {
    mockConnect.mockRejectedValueOnce(new Error("First attempt fail"));
    mockConnect.mockResolvedValueOnce(undefined);

    render(<ConnectionHealthMonitor />);
    expect(eventHandler).not.toBeNull();

    // Trigger failure event
    act(() => {
      eventHandler?.({
        payload: { connectionId: "conn-123", error: "Connection lost" },
      });
    });

    expect(mockShowAlert).toHaveBeenCalledWith(
      expect.stringContaining("Connection lost"),
      expect.objectContaining({ kind: "warning" })
    );

    // Fast-forward 2s for attempt 1
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(mockConnect).toHaveBeenCalledWith("conn-123");
    // Visible reconnect indicator was shown
    expect(screen.getByRole("status")).toBeInTheDocument();

    // Fast-forward 5s for attempt 2 (which resolves)
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(mockConnect).toHaveBeenCalledTimes(2);
    // After success, indicator disappears
    expect(screen.queryByRole("status")).toBeNull();
  });
});

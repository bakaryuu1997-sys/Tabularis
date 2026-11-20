import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ConnectionHealthMonitor } from "../../src/components/ConnectionHealthMonitor";

type HealthEvent = { payload: { connectionId: string; error: string } };
let eventHandler: ((event: HealthEvent) => void) | null = null;
const mockShowAlert = vi.fn();
const mockConnect = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((event: string, handler: (event: HealthEvent) => void) => {
    if (event === "connection-health-failed") {
      eventHandler = handler;
    }
    return Promise.resolve(() => {});
  }),
}));

vi.mock("../../src/hooks/useAlert", () => ({
  useAlert: () => ({ showAlert: mockShowAlert }),
}));

vi.mock("../../src/hooks/useDatabase", () => ({
  useDatabase: () => ({ connect: mockConnect }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const fail = (connectionId = "conn-1") =>
  act(async () => {
    eventHandler?.({ payload: { connectionId, error: "Connection lost" } });
  });

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

describe("ConnectionHealthMonitor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockShowAlert.mockReset();
    mockConnect.mockReset();
    eventHandler = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing while all connections are healthy", () => {
    const { container } = render(<ConnectionHealthMonitor />);
    expect(container.firstChild).toBeNull();
  });

  it("reconnects immediately and hides the indicator on success", async () => {
    mockConnect.mockResolvedValueOnce(undefined);
    render(<ConnectionHealthMonitor />);

    await fail();

    expect(mockShowAlert).toHaveBeenCalledWith(
      expect.stringContaining("Connection lost"),
      expect.objectContaining({ kind: "warning" }),
    );
    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockConnect).toHaveBeenCalledWith("conn-1");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("retries with backoff and shows progress", async () => {
    mockConnect.mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce(undefined);
    render(<ConnectionHealthMonitor />);

    await fail();
    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toContain("(1/4)");

    await advance(1999);
    expect(mockConnect).toHaveBeenCalledTimes(1);

    await advance(1);
    expect(mockConnect).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("gives up after the last attempt without an extra wait", async () => {
    mockConnect.mockRejectedValue(new Error("down"));
    render(<ConnectionHealthMonitor />);

    await fail();
    await advance(2000 + 5000 + 15000);

    expect(mockConnect).toHaveBeenCalledTimes(4);
    expect(mockShowAlert).toHaveBeenLastCalledWith(
      "healthCheck.reconnectFailed",
      expect.objectContaining({ kind: "error" }),
    );
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("a new failure for the same connection cancels the previous loop", async () => {
    mockConnect.mockRejectedValue(new Error("down"));
    render(<ConnectionHealthMonitor />);

    await fail();
    await fail();
    expect(mockConnect).toHaveBeenCalledTimes(2);

    // Only the second loop keeps retrying.
    await advance(2000);
    expect(mockConnect).toHaveBeenCalledTimes(3);
  });
});

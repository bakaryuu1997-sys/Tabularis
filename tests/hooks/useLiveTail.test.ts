import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { useLiveTail, type LiveTailTab } from "../../src/hooks/useLiveTail";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const driver = { id: "postgres", identifier_quote: '"' } as never;

const tableTab = (overrides: Partial<LiveTailTab> = {}): LiveTailTab => ({
  id: "t1",
  type: "table",
  activeTable: "orders",
  pkColumns: ["id"],
  schema: "public",
  isLoading: false,
  result: { columns: ["id", "name"], rows: [[1, "a"]] },
  ...overrides,
});

// The hook compares `result.rows` by identity, exactly like React state in the app, so tabs must be stable.
const STABLE_TAB = tableTab();
const LOADING_TAB = tableTab({ isLoading: true });

const queries = () => vi.mocked(invoke).mock.calls.map(([, args]) => (args as { query: string }).query);

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("useLiveTail (keyset strategy)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(invoke).mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("probes with a tiny keyset query and only refreshes when rows arrive", async () => {
    const refresh = vi.fn();
    vi.mocked(invoke)
      .mockResolvedValueOnce({ rows: [[10]] }) // MAX(pk)
      .mockResolvedValueOnce({ rows: [] }) // tick 1: nothing new
      .mockResolvedValueOnce({ rows: [[11], [12]] }); // tick 2: two new rows

    const { result } = renderHook(() =>
      useLiveTail({ enabled: true, intervalSeconds: 2, connectionId: "c1", driver, tab: STABLE_TAB, refresh }),
    );
    expect(result.current.strategy).toBe("keyset");

    await advance(0);
    expect(queries()[0]).toBe('SELECT MAX("id") AS tail_max FROM "public"."orders"');

    await advance(2000);
    expect(queries()[1]).toBe('SELECT "id" FROM "public"."orders" WHERE "id" > 10 ORDER BY "id" ASC');
    expect(refresh).not.toHaveBeenCalled();
    expect(result.current.newRowCount).toBe(0);

    await advance(2000);
    expect(queries()[2]).toContain('WHERE "id" > 10');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(result.current.newRowCount).toBe(2);

    act(() => result.current.clearNewRows());
    expect(result.current.newRowCount).toBe(0);
  });

  it("advances the baseline so rows are never counted twice", async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce({ rows: [[5]] })
      .mockResolvedValueOnce({ rows: [[6]] })
      .mockResolvedValueOnce({ rows: [] });
    renderHook(() =>
      useLiveTail({ enabled: true, intervalSeconds: 2, connectionId: "c1", driver, tab: STABLE_TAB, refresh: vi.fn() }),
    );
    await advance(0);
    await advance(2000);
    await advance(2000);
    expect(queries()[2]).toContain('WHERE "id" > 6');
  });

  it("tails an empty table from the first row", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ rows: [[null]] }).mockResolvedValueOnce({ rows: [[1]] });
    const { result } = renderHook(() =>
      useLiveTail({ enabled: true, intervalSeconds: 2, connectionId: "c1", driver, tab: STABLE_TAB, refresh: vi.fn() }),
    );
    await advance(0);
    await advance(2000);
    expect(queries()[1]).not.toContain("WHERE");
    expect(result.current.newRowCount).toBe(1);
  });

  it("falls back to snapshot polling when the key is not an integer", async () => {
    const refresh = vi.fn();
    vi.mocked(invoke).mockResolvedValue({ rows: [["8f14e45f-uuid"]] });
    const { result } = renderHook(() =>
      useLiveTail({ enabled: true, intervalSeconds: 2, connectionId: "c1", driver, tab: STABLE_TAB, refresh }),
    );
    await advance(0);
    expect(result.current.strategy).toBe("snapshot");
    await advance(2000);
    expect(refresh).toHaveBeenCalled();
  });

  it("does nothing while disabled", async () => {
    renderHook(() =>
      useLiveTail({ enabled: false, intervalSeconds: 2, connectionId: "c1", driver, tab: STABLE_TAB, refresh: vi.fn() }),
    );
    await advance(10_000);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("stops polling when unmounted", async () => {
    vi.mocked(invoke).mockResolvedValue({ rows: [[1]] });
    const { unmount } = renderHook(() =>
      useLiveTail({ enabled: true, intervalSeconds: 2, connectionId: "c1", driver, tab: STABLE_TAB, refresh: vi.fn() }),
    );
    await advance(0);
    unmount();
    const calls = vi.mocked(invoke).mock.calls.length;
    await advance(20_000);
    expect(vi.mocked(invoke).mock.calls.length).toBe(calls);
  });

  it("backs off after errors and stops after repeated failures", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("connection lost"));
    const { result } = renderHook(() =>
      useLiveTail({ enabled: true, intervalSeconds: 2, connectionId: "c1", driver, tab: STABLE_TAB, refresh: vi.fn() }),
    );
    await advance(0); // failure 1 -> next in 4s
    await advance(3999);
    expect(invoke).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(invoke).toHaveBeenCalledTimes(2); // failure 2 -> next in 8s
    await advance(8000); // failure 3
    await advance(16000); // failure 4
    await advance(32000); // failure 5 -> stops
    expect(result.current.status).toBe("error");
    expect(result.current.error).toContain("connection lost");
    const calls = vi.mocked(invoke).mock.calls.length;
    await advance(120_000);
    expect(vi.mocked(invoke).mock.calls.length).toBe(calls);
  });

  it("skips ticks while the tab is still loading", async () => {
    vi.mocked(invoke).mockResolvedValue({ rows: [[1]] });
    const { result } = renderHook(() =>
      useLiveTail({
        enabled: true,
        intervalSeconds: 2,
        connectionId: "c1",
        driver,
        tab: LOADING_TAB,
        refresh: vi.fn(),
      }),
    );
    await advance(0);
    expect(invoke).not.toHaveBeenCalled();
    expect(result.current.status).toBe("paused");
  });
});

describe("useLiveTail (snapshot strategy)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(invoke).mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("re-runs the query each interval and counts only truly new rows", async () => {
    const refresh = vi.fn();
    const console_ = (rows: unknown[][]): LiveTailTab => ({
      id: "c1",
      type: "console",
      pkColumns: ["id"],
      result: { columns: ["id", "v"], rows },
    });
    const { result, rerender } = renderHook(
      ({ tab }: { tab: LiveTailTab }) =>
        useLiveTail({ enabled: true, intervalSeconds: 2, connectionId: "c1", driver, tab, refresh }),
      { initialProps: { tab: console_([[1, "a"], [2, "b"]]) } },
    );
    expect(result.current.strategy).toBe("snapshot");

    await advance(2000);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(invoke).not.toHaveBeenCalled();

    // An edited row (id 1) and a new row (id 3): only the new one counts.
    rerender({ tab: console_([[1, "changed"], [2, "b"], [3, "c"]]) });
    expect(result.current.newRowCount).toBe(1);
  });
});

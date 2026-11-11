import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { usePluginQuery } from "../../src/hooks/usePluginApi";
import { DatabaseContext } from "../../src/contexts/DatabaseContext";

const wrapper =
  (value: Record<string, unknown>) =>
  ({ children }: { children: ReactNode }) => (
    <DatabaseContext.Provider value={value as never}>{children}</DatabaseContext.Provider>
  );

describe("usePluginQuery", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  it("sends the query through the read-only plugin command, never execute_query", async () => {
    vi.mocked(invoke).mockResolvedValue({ columns: ["n"], rows: [[1]] });
    const { result } = renderHook(() => usePluginQuery(), {
      wrapper: wrapper({ activeConnectionId: "c1", activeSchema: "public" }),
    });

    let rows: unknown;
    await act(async () => {
      rows = await result.current.executeQuery("SELECT 1");
    });

    expect(rows).toEqual({ columns: ["n"], rows: [[1]] });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("execute_plugin_query", {
      connectionId: "c1",
      query: "SELECT 1",
      schema: "public",
    });
  });

  it("surfaces the backend's refusal of a write as the hook's error", async () => {
    vi.mocked(invoke).mockRejectedValue("Plugins can only run read-only queries (SELECT, ...): not allowed");
    const { result } = renderHook(() => usePluginQuery(), {
      wrapper: wrapper({ activeConnectionId: "c1" }),
    });

    await act(async () => {
      await expect(result.current.executeQuery("DELETE FROM t")).rejects.toThrow(/read-only queries/);
    });
    expect(result.current.error).toMatch(/read-only queries/);
  });

  it("fails without an active connection and does not call the backend", async () => {
    const { result } = renderHook(() => usePluginQuery(), { wrapper: wrapper({ activeConnectionId: null }) });
    await act(async () => {
      await expect(result.current.executeQuery("SELECT 1")).rejects.toThrow("No active connection");
    });
    expect(invoke).not.toHaveBeenCalled();
  });
});

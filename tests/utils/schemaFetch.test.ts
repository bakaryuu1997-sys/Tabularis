import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  COLUMN_FETCH_CONCURRENCY,
  loadSchemaColumns,
  mapLimit,
} from "../../src/utils/schemaFetch";
import type { TableColumn } from "../../src/utils/sqlGenerator";

const col = (name: string): TableColumn => ({
  name,
  data_type: "int",
  is_pk: false,
  is_nullable: true,
  is_auto_increment: false,
  default_value: null,
});

describe("mapLimit", () => {
  it("keeps result order and never exceeds the limit", async () => {
    let running = 0;
    let peak = 0;
    const result = await mapLimit([5, 1, 4, 2, 3, 6, 7], 3, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, n));
      running--;
      return n * 2;
    });
    expect(result).toEqual([10, 2, 8, 4, 6, 12, 14]);
    expect(peak).toBe(3);
  });

  it("handles an empty list and a limit larger than the list", async () => {
    expect(await mapLimit([], 8, async (n: number) => n)).toEqual([]);
    expect(await mapLimit([1, 2], 50, async (n) => n + 1)).toEqual([2, 3]);
  });

  it("treats an invalid limit as 1", async () => {
    let peak = 0;
    let running = 0;
    await mapLimit([1, 2, 3], 0, async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 1));
      running--;
    });
    expect(peak).toBe(1);
  });

  it("stops starting new work after a failure and rethrows it", async () => {
    const started: number[] = [];
    await expect(
      mapLimit([1, 2, 3, 4, 5, 6], 1, async (n) => {
        started.push(n);
        if (n === 2) throw new Error("boom");
        return n;
      }),
    ).rejects.toThrow("boom");
    expect(started).toEqual([1, 2]);
  });
});

describe("loadSchemaColumns", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("uses a single snapshot call instead of one call per table", async () => {
    vi.mocked(invoke).mockResolvedValueOnce([
      { name: "users", columns: [col("id")], foreign_keys: [] },
      { name: "orders", columns: [col("id"), col("user_id")], foreign_keys: [] },
    ]);

    const result = await loadSchemaColumns("conn-1", "public");

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("get_schema_snapshot", {
      connectionId: "conn-1",
      schema: "public",
    });
    expect(result.tables).toEqual([{ name: "users" }, { name: "orders" }]);
    expect(result.columns.orders.map((c) => c.name)).toEqual(["id", "user_id"]);
  });

  it("omits the schema argument when none is selected", async () => {
    vi.mocked(invoke).mockResolvedValueOnce([]);
    await loadSchemaColumns("conn-1", "");
    expect(invoke).toHaveBeenCalledWith("get_schema_snapshot", { connectionId: "conn-1" });
  });

  it("falls back to per-table get_columns, with bounded concurrency, when the snapshot fails", async () => {
    const names = Array.from({ length: 30 }, (_, i) => `t${i}`);
    let running = 0;
    let peak = 0;
    vi.mocked(invoke).mockImplementation(async (cmd, args) => {
      if (cmd === "get_schema_snapshot") throw new Error("method not found");
      if (cmd === "get_tables") return names.map((name) => ({ name }));
      if (cmd === "get_columns") {
        running++;
        peak = Math.max(peak, running);
        await new Promise((r) => setTimeout(r, 2));
        running--;
        return [col(`${(args as { tableName: string }).tableName}_id`)];
      }
      throw new Error(`unexpected ${String(cmd)}`);
    });

    const result = await loadSchemaColumns("conn-1");

    expect(result.tables).toHaveLength(30);
    expect(result.columns.t7.map((c) => c.name)).toEqual(["t7_id"]);
    expect(peak).toBeLessThanOrEqual(COLUMN_FETCH_CONCURRENCY);
    expect(peak).toBeGreaterThan(1);
  });

  it("fails instead of treating an unreadable table as having no columns", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd, args) => {
      if (cmd === "get_schema_snapshot") throw new Error("method not found");
      if (cmd === "get_tables") return [{ name: "ok" }, { name: "locked" }];
      if ((args as { tableName: string }).tableName === "locked") throw new Error("permission denied");
      return [col("id")];
    });

    await expect(loadSchemaColumns("conn-1")).rejects.toThrow("Could not read columns of: locked");
  });

  it("shortens the list of failing tables in the error", async () => {
    const names = Array.from({ length: 9 }, (_, i) => `t${i}`);
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === "get_schema_snapshot") throw new Error("nope");
      if (cmd === "get_tables") return names.map((name) => ({ name }));
      throw new Error("denied");
    });

    await expect(loadSchemaColumns("conn-1")).rejects.toThrow(/\(\+4 more\)$/);
  });
});

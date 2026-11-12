import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { loadTableSpecData } from "../../src/utils/tableSpecData";

const col = (name: string) => ({ name, data_type: "integer", is_pk: false, is_nullable: true, is_auto_increment: false });

type Handler = (args: Record<string, unknown>) => unknown;

const backend = (handlers: Record<string, Handler>) =>
  vi.mocked(invoke).mockImplementation((async (cmd: string, args: Record<string, unknown>) => {
    const handler = handlers[cmd];
    if (!handler) throw new Error(`unexpected ${cmd}`);
    return handler(args ?? {});
  }) as never);

const snapshot = [
  { name: "orders", columns: [col("id")], foreign_keys: [{ name: "fk", column_name: "user_id", ref_table: "users", ref_column: "id" }] },
  { name: "users", columns: [col("id"), col("name")], foreign_keys: [] },
];

describe("loadTableSpecData", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("combines structure, comments and indexes, with tables in name order", async () => {
    backend({
      get_schema_snapshot: () => snapshot,
      get_schema_comments: () => ({ tables: { users: "顧客" }, columns: { users: { name: "氏名" } } }),
      get_indexes: (a) => [{ name: `idx_${a.tableName}`, column_name: "id", is_unique: false, is_primary: false }],
    });
    const data = await loadTableSpecData({ connectionId: "c1", schema: "public", includeIndexes: true });
    expect(data.tables.map((t) => t.name)).toEqual(["orders", "users"]);
    expect(data.tables[0].foreignKeys).toHaveLength(1);
    expect(data.tables[1].indexes[0].name).toBe("idx_users");
    expect(data.comments.tables.users).toBe("顧客");
    expect(data.noComments).toBe(false);
    expect(data.indexWarnings).toEqual([]);
  });

  it("keeps only the requested tables", async () => {
    backend({ get_schema_snapshot: () => snapshot, get_schema_comments: () => ({ tables: {}, columns: {} }) });
    const data = await loadTableSpecData({ connectionId: "c1", tableNames: ["users"], includeIndexes: false });
    expect(data.tables.map((t) => t.name)).toEqual(["users"]);
  });

  it("does not ask for indexes when they are not wanted", async () => {
    backend({ get_schema_snapshot: () => snapshot, get_schema_comments: () => ({ tables: {}, columns: {} }) });
    await loadTableSpecData({ connectionId: "c1", includeIndexes: false });
    expect(vi.mocked(invoke).mock.calls.some(([cmd]) => cmd === "get_indexes")).toBe(false);
  });

  it("passes the schema and database to the backend only when set", async () => {
    backend({ get_schema_snapshot: () => [], get_schema_comments: () => ({ tables: {}, columns: {} }) });
    await loadTableSpecData({ connectionId: "c1", schema: "", includeIndexes: false });
    expect(vi.mocked(invoke).mock.calls.find(([cmd]) => cmd === "get_schema_snapshot")?.[1]).toEqual({ connectionId: "c1" });
    vi.mocked(invoke).mockClear();
    await loadTableSpecData({ connectionId: "c1", schema: "s", database: "d", includeIndexes: false });
    expect(vi.mocked(invoke).mock.calls.find(([cmd]) => cmd === "get_schema_comments")?.[1]).toEqual({
      connectionId: "c1",
      schema: "s",
      database: "d",
    });
  });

  it("still produces a document when comments cannot be read, and says there are none", async () => {
    backend({
      get_schema_snapshot: () => snapshot,
      get_schema_comments: () => {
        throw new Error("not supported");
      },
    });
    const data = await loadTableSpecData({ connectionId: "c1", includeIndexes: false });
    expect(data.tables).toHaveLength(2);
    expect(data.noComments).toBe(true);
  });

  it("reports tables whose indexes could not be read instead of hiding it", async () => {
    backend({
      get_schema_snapshot: () => snapshot,
      get_schema_comments: () => ({ tables: {}, columns: {} }),
      get_indexes: (a) => {
        if (a.tableName === "orders") throw new Error("denied");
        return [];
      },
    });
    const data = await loadTableSpecData({ connectionId: "c1", includeIndexes: true });
    expect(data.indexWarnings).toEqual(["orders"]);
    expect(data.tables).toHaveLength(2);
  });

  it("falls back to per-table reads when the snapshot command is missing", async () => {
    backend({
      get_schema_snapshot: () => {
        throw new Error("method not found");
      },
      get_tables: () => [{ name: "b" }, { name: "a" }],
      get_columns: (a) => [col(`${a.tableName}_id`)],
      get_foreign_keys: (a) => (a.tableName === "a" ? [{ name: "fk", column_name: "x", ref_table: "b", ref_column: "id" }] : []),
      get_schema_comments: () => ({ tables: {}, columns: {} }),
    });
    const data = await loadTableSpecData({ connectionId: "c1", includeIndexes: false });
    expect(data.tables.map((t) => t.name)).toEqual(["a", "b"]);
    expect(data.tables[0].columns[0].name).toBe("a_id");
    expect(data.tables[0].foreignKeys).toHaveLength(1);
  });

  it("reports progress up to the number of tables", async () => {
    backend({ get_schema_snapshot: () => snapshot, get_schema_comments: () => ({ tables: {}, columns: {} }) });
    const onProgress = vi.fn();
    await loadTableSpecData({ connectionId: "c1", includeIndexes: false, onProgress });
    expect(onProgress).toHaveBeenCalledWith(0, 2);
    expect(onProgress).toHaveBeenLastCalledWith(2, 2);
  });
});

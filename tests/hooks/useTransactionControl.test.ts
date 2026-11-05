import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { beginTransactionSql, useTransactionControl } from "../../src/hooks/useTransactionControl";

const setup = (overrides: Partial<Parameters<typeof useTransactionControl>[0]> = {}) => {
  const runQuery = vi.fn().mockResolvedValue(undefined);
  const showAlert = vi.fn();
  const options = { connectionId: "c1", driver: "postgres", runQuery, showAlert, t: (k: string) => k, ...overrides };
  return { runQuery, showAlert, ...renderHook(() => useTransactionControl(options)) };
};

describe("beginTransactionSql", () => {
  it.each([
    ["postgres", "BEGIN;"],
    ["sqlite", "BEGIN;"],
    ["mysql", "START TRANSACTION;"],
    ["clickhouse", "START TRANSACTION;"],
    [null, "START TRANSACTION;"],
  ])("uses the right statement for %s", (driver, sql) => {
    expect(beginTransactionSql(driver)).toBe(sql);
  });
});

describe("useTransactionControl", () => {
  it("starts in auto mode with no open transaction", () => {
    const { result } = setup();
    expect(result.current.transactionMode).toBe("auto");
    expect(result.current.isTransactionActive).toBe(false);
  });

  it("opens a transaction with the driver's statement and tells the user", async () => {
    const { result, runQuery, showAlert } = setup({ driver: "mysql" });
    await act(async () => result.current.startTransaction());
    expect(runQuery).toHaveBeenCalledWith("START TRANSACTION;", 1);
    expect(result.current.isTransactionActive).toBe(true);
    expect(showAlert).toHaveBeenCalledWith("editor.transactionStarted", { title: "Transaction", kind: "info" });
  });

  it("commits and rolls back, closing the transaction each time", async () => {
    const { result, runQuery, showAlert } = setup();
    await act(async () => result.current.startTransaction());
    await act(async () => result.current.commitTransaction());
    expect(runQuery).toHaveBeenLastCalledWith("COMMIT;", 1);
    expect(result.current.isTransactionActive).toBe(false);
    expect(showAlert).toHaveBeenLastCalledWith("editor.transactionCommitted", { title: "Transaction", kind: "info" });

    await act(async () => result.current.startTransaction());
    await act(async () => result.current.rollbackTransaction());
    expect(runQuery).toHaveBeenLastCalledWith("ROLLBACK;", 1);
    expect(result.current.isTransactionActive).toBe(false);
    expect(showAlert).toHaveBeenLastCalledWith("editor.transactionRolledBack", { title: "Transaction", kind: "info" });
  });

  it("keeps the transaction open and reports an error when COMMIT fails", async () => {
    const { result, runQuery, showAlert } = setup();
    await act(async () => result.current.startTransaction());
    runQuery.mockRejectedValueOnce(new Error("deadlock detected"));
    await act(async () => result.current.commitTransaction());
    expect(result.current.isTransactionActive).toBe(true);
    expect(showAlert).toHaveBeenLastCalledWith(expect.stringContaining("deadlock detected"), {
      title: "Commit Error",
      kind: "error",
    });
  });

  it("does not become active when BEGIN fails", async () => {
    const { result, runQuery, showAlert } = setup();
    runQuery.mockRejectedValueOnce(new Error("no connection"));
    await act(async () => result.current.startTransaction());
    expect(result.current.isTransactionActive).toBe(false);
    expect(showAlert).toHaveBeenCalledWith(expect.stringContaining("no connection"), {
      title: "Transaction Error",
      kind: "error",
    });
  });

  it("does nothing without a connection", async () => {
    const { result, runQuery } = setup({ connectionId: null });
    await act(async () => result.current.startTransaction());
    await act(async () => result.current.commitTransaction());
    await act(async () => result.current.rollbackTransaction());
    expect(runQuery).not.toHaveBeenCalled();
  });

  it("toggles between auto and manual mode", () => {
    const { result } = setup();
    act(() => result.current.setTransactionMode((m) => (m === "auto" ? "manual" : "auto")));
    expect(result.current.transactionMode).toBe("manual");
  });
});

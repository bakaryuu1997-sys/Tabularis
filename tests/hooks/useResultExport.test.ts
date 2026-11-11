import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useResultExport } from "../../src/hooks/useResultExport";
import { exportQueryResultToExcel } from "../../src/utils/excelExport";
import type { Tab } from "../../src/types/editor";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("../../src/utils/excelExport", () => ({ exportQueryResultToExcel: vi.fn() }));

const consoleTab = (overrides: Partial<Tab> = {}): Tab =>
  ({
    id: "t1",
    title: "Report",
    type: "console",
    query: "SELECT * FROM orders",
    result: { columns: ["id"], rows: [[1]] },
    connectionId: "c1",
    ...overrides,
  }) as Tab;

const CHOSEN = { token: "tok-1", file_name: "result.csv" };

/** Fakes the two backend commands of an export: the save dialog and the export itself. */
const mockBackend = ({
  chosen = CHOSEN as typeof CHOSEN | null,
  outcome = { replaced_characters: 0 } as { replaced_characters: number } | undefined,
  exportError = undefined as Error | undefined,
} = {}) =>
  vi.mocked(invoke).mockImplementation(async (cmd: string) => {
    if (cmd === "choose_export_file") return chosen;
    if (cmd === "export_query_to_file") {
      if (exportError) throw exportError;
      return outcome;
    }
    return undefined;
  });

const exportCall = () => vi.mocked(invoke).mock.calls.find(([cmd]) => cmd === "export_query_to_file");

const baseOptions = (tab: Tab | null) => ({
  activeTab: tab,
  connectionId: "c1",
  capabilities: null,
  driver: "postgres",
  activeSchema: null,
  csvDelimiter: ";",
  csvPreset: "utf8-bom",
  showAlert: vi.fn(),
  t: (key: string) => key,
});

describe("useResultExport", () => {
  let emitProgress: (rows: number) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listen).mockImplementation(async (_event, handler) => {
      emitProgress = (rows) => (handler as (e: { payload: { rows_processed: number } }) => void)({ payload: { rows_processed: rows } });
      return () => undefined;
    });
  });

  it("exports the tab query to the file chosen in the backend dialog and reports completion", async () => {
    mockBackend();
    const { result } = renderHook(() => useResultExport(baseOptions(consoleTab())));

    await act(async () => {
      await result.current.exportCsv();
    });

    expect(invoke).toHaveBeenCalledWith("choose_export_file", {
      defaultFileName: expect.stringMatching(/\.csv$/),
      format: "csv",
    });
    // The page sends the one-time token, never a file path.
    expect(exportCall()?.[1]).toEqual({
      connectionId: "c1",
      query: "SELECT * FROM orders",
      destinationToken: "tok-1",
      format: "csv",
      csvDelimiter: ";",
      csvPreset: "utf8-bom",
    });
    expect(exportCall()?.[1]).not.toHaveProperty("filePath");
    expect(result.current.exportState).toMatchObject({ isOpen: true, status: "completed", fileName: "result.csv" });
    expect(result.current.exportState.warningMessage).toBeUndefined();
  });

  it("sends neither delimiter nor CSV preset for JSON", async () => {
    mockBackend({ chosen: { token: "tok-2", file_name: "result.json" } });
    const { result } = renderHook(() => useResultExport(baseOptions(consoleTab())));
    await act(async () => {
      await result.current.exportJson();
    });
    expect(exportCall()?.[1]).toMatchObject({
      format: "json",
      csvDelimiter: undefined,
      csvPreset: undefined,
    });
  });

  it("passes the Shift_JIS preset through", async () => {
    mockBackend();
    const { result } = renderHook(() =>
      useResultExport({ ...baseOptions(consoleTab()), csvPreset: "shift_jis" }),
    );
    await act(async () => {
      await result.current.exportCsv();
    });
    expect(exportCall()?.[1]).toMatchObject({ csvPreset: "shift_jis" });
  });

  it("leaves the preset undefined when none is configured (the backend then writes plain UTF-8)", async () => {
    mockBackend();
    const { result } = renderHook(() =>
      useResultExport({ ...baseOptions(consoleTab()), csvPreset: undefined }),
    );
    await act(async () => {
      await result.current.exportCsv();
    });
    expect(exportCall()?.[1]).toMatchObject({ csvPreset: undefined });
  });

  it("warns when the encoding replaced characters it could not represent", async () => {
    mockBackend({ outcome: { replaced_characters: 3 } });
    const { result } = renderHook(() => useResultExport(baseOptions(consoleTab())));
    await act(async () => {
      await result.current.exportCsv();
    });
    expect(result.current.exportState.status).toBe("completed");
    expect(result.current.exportState.warningMessage).toBe("editor.exportReplacedCharacters");
  });

  it("does nothing when the save dialog is cancelled", async () => {
    mockBackend({ chosen: null });
    const { result } = renderHook(() => useResultExport(baseOptions(consoleTab())));
    await act(async () => {
      await result.current.exportCsv();
    });
    expect(exportCall()).toBeUndefined();
    expect(result.current.exportState.isOpen).toBe(false);
  });

  it("does nothing for an empty query or without a connection", async () => {
    const empty = renderHook(() => useResultExport(baseOptions(consoleTab({ query: "   " }))));
    await act(async () => {
      await empty.result.current.exportCsv();
    });
    const noConn = renderHook(() => useResultExport({ ...baseOptions(consoleTab()), connectionId: null }));
    await act(async () => {
      await noConn.result.current.exportCsv();
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("surfaces backend failures in the progress dialog", async () => {
    mockBackend({ exportError: new Error("disk full") });
    const { result } = renderHook(() => useResultExport(baseOptions(consoleTab())));
    await act(async () => {
      await result.current.exportCsv();
    });
    expect(result.current.exportState.status).toBe("error");
    expect(result.current.exportState.errorMessage).toContain("disk full");
  });

  it("scopes multi-database exports to the active database", async () => {
    mockBackend();
    const options = {
      ...baseOptions(consoleTab()),
      capabilities: { file_based: false, folder_based: false, schemas: false } as never,
      activeSchema: "sales",
    };
    const { result } = renderHook(() => useResultExport(options));
    await act(async () => {
      await result.current.exportCsv();
    });
    expect(exportCall()?.[1]).toMatchObject({ database: "sales" });
  });

  it("sends no database parameter for schema-based drivers", async () => {
    mockBackend();
    const options = {
      ...baseOptions(consoleTab()),
      capabilities: { file_based: false, folder_based: false, schemas: true } as never,
      activeSchema: "sales",
    };
    const { result } = renderHook(() => useResultExport(options));
    await act(async () => {
      await result.current.exportCsv();
    });
    expect(exportCall()?.[1]).not.toHaveProperty("database");
  });

  it("tracks progress events and closes the dialog on cancel", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    const { result } = renderHook(() => useResultExport(baseOptions(consoleTab())));
    await waitFor(() => expect(listen).toHaveBeenCalled());
    act(() => emitProgress(250));
    expect(result.current.exportState.rowsProcessed).toBe(250);

    await act(async () => {
      await result.current.cancelExport();
    });
    expect(invoke).toHaveBeenCalledWith("cancel_export", { connectionId: "c1" });
    expect(result.current.exportState.isOpen).toBe(false);
  });

  it("exports to Excel only when there are rows, and confirms with an alert", async () => {
    vi.mocked(exportQueryResultToExcel).mockResolvedValue("/tmp/r.xlsx");
    const options = baseOptions(consoleTab());
    const { result } = renderHook(() => useResultExport(options));
    await act(async () => {
      await result.current.exportExcel();
    });
    expect(exportQueryResultToExcel).toHaveBeenCalledWith(
      expect.objectContaining({ columns: ["id"], rows: [[1]], sheetName: "Report" }),
    );
    expect(options.showAlert).toHaveBeenCalledWith("common.saved", { kind: "info" });

    vi.mocked(exportQueryResultToExcel).mockClear();
    const empty = renderHook(() =>
      useResultExport(baseOptions(consoleTab({ result: { columns: ["id"], rows: [] } as never }))),
    );
    await act(async () => {
      await empty.result.current.exportExcel();
    });
    expect(exportQueryResultToExcel).not.toHaveBeenCalled();
  });

  it("reports Excel errors to the user", async () => {
    vi.mocked(exportQueryResultToExcel).mockRejectedValue(new Error("write failed"));
    const options = baseOptions(consoleTab());
    const { result } = renderHook(() => useResultExport(options));
    await act(async () => {
      await result.current.exportExcel();
    });
    expect(options.showAlert).toHaveBeenCalledWith(expect.stringContaining("write failed"), { kind: "error" });
  });
});

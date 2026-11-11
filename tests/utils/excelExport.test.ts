import { describe, it, expect, vi, beforeEach } from "vitest";
import { exportQueryResultToExcel } from "../../src/utils/excelExport";
import { invoke } from "@tauri-apps/api/core";
import * as XLSX from "xlsx";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("exportQueryResultToExcel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null if the user cancels the save dialog", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(null);

    const result = await exportQueryResultToExcel({
      columns: ["id", "name"],
      rows: [[1, "Nguyễn Văn A"]],
    });

    expect(result).toBeNull();
  });

  it("creates Excel file with correct data and UTF-8 characters", async () => {
    vi.mocked(invoke).mockResolvedValueOnce("C:\\exports\\customers.xlsx");

    const columns = ["Mã KH", "Họ Tên", "Doanh Thu", "Trạng Thái"];
    const rows = [
      ["KH001", "Trần Thị Bích Ngọc", 15000000, true],
      ["KH002", "Lê Hoàng Long", 22500000, false],
    ];

    const result = await exportQueryResultToExcel({
      columns,
      rows,
      sheetName: "Khách hàng",
    });

    expect(result).toBe("C:\\exports\\customers.xlsx");
    expect(invoke).toHaveBeenCalledTimes(1);

    const [cmd, args] = vi.mocked(invoke).mock.calls[0];
    // The destination is picked by the backend's own dialog, never passed in by the page.
    expect(cmd).toBe("save_binary_file_with_dialog");
    expect(args).toEqual({
      defaultFileName: expect.stringMatching(/\.xlsx$/),
      filterName: "Excel Spreadsheet (*.xlsx)",
      extensions: ["xlsx"],
      base64Data: expect.any(String),
    });
    expect(args).not.toHaveProperty("path");

    // Verify written base64 data can be parsed back with SheetJS
    const parsedWb = XLSX.read((args as { base64Data: string }).base64Data, { type: "base64" });
    expect(parsedWb.SheetNames).toContain("Khách hàng");

    const parsedWs = parsedWb.Sheets["Khách hàng"];
    const parsedData = XLSX.utils.sheet_to_json(parsedWs, { header: 1 });
    expect(parsedData[0]).toEqual(columns);
    expect(parsedData[1]).toEqual(["KH001", "Trần Thị Bích Ngọc", 15000000, true]);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { exportQueryResultToExcel } from "../../src/utils/excelExport";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import * as XLSX from "xlsx";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("exportQueryResultToExcel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null if user cancels the save dialog", async () => {
    vi.mocked(save).mockResolvedValueOnce(null);

    const result = await exportQueryResultToExcel({
      columns: ["id", "name"],
      rows: [[1, "Nguyễn Văn A"]],
    });

    expect(result).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("creates Excel file with correct data and UTF-8 characters", async () => {
    vi.mocked(save).mockResolvedValueOnce("C:\\exports\\customers.xlsx");
    vi.mocked(invoke).mockResolvedValueOnce(undefined);

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
    expect(cmd).toBe("write_binary_file");
    expect(args).toEqual({
      path: "C:\\exports\\customers.xlsx",
      base64Data: expect.any(String),
    });

    // Verify written base64 data can be parsed back with SheetJS
    const parsedWb = XLSX.read((args as { base64Data: string }).base64Data, { type: "base64" });
    expect(parsedWb.SheetNames).toContain("Khách hàng");

    const parsedWs = parsedWb.Sheets["Khách hàng"];
    const parsedData = XLSX.utils.sheet_to_json(parsedWs, { header: 1 });
    expect(parsedData[0]).toEqual(columns);
    expect(parsedData[1]).toEqual(["KH001", "Trần Thị Bích Ngọc", 15000000, true]);
  });
});

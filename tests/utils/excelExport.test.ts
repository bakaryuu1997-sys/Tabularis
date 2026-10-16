import { describe, it, expect, vi, beforeEach } from "vitest";
import { exportQueryResultToExcel } from "../../src/utils/excelExport";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import * as XLSX from "xlsx";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  writeFile: vi.fn(),
  writeTextFile: vi.fn(),
  readTextFile: vi.fn(),
  stat: vi.fn(),
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
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("creates Excel file with correct data and UTF-8 characters", async () => {
    vi.mocked(save).mockResolvedValueOnce("C:\\exports\\customers.xlsx");
    vi.mocked(writeFile).mockResolvedValueOnce();

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
    expect(writeFile).toHaveBeenCalledTimes(1);

    const [writtenPath, bytes] = vi.mocked(writeFile).mock.calls[0];
    expect(writtenPath).toBe("C:\\exports\\customers.xlsx");
    expect(bytes).toBeInstanceOf(Uint8Array);

    // Verify written bytes can be parsed back with SheetJS
    const parsedWb = XLSX.read(bytes, { type: "array" });
    expect(parsedWb.SheetNames).toContain("Khách hàng");

    const parsedWs = parsedWb.Sheets["Khách hàng"];
    const parsedData = XLSX.utils.sheet_to_json(parsedWs, { header: 1 });
    expect(parsedData[0]).toEqual(columns);
    expect(parsedData[1]).toEqual(["KH001", "Trần Thị Bích Ngọc", 15000000, true]);
  });
});

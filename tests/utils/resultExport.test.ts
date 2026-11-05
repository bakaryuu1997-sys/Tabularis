import { describe, it, expect } from "vitest";
import {
  buildExcelFileName,
  buildExportFileName,
  buildSheetName,
  displayFileName,
} from "../../src/utils/resultExport";

describe("result export file names", () => {
  it("builds an Excel file name from the tab title", () => {
    expect(buildExcelFileName("Top customers", 123)).toBe("Top_customers_123.xlsx");
  });

  it("keeps Latin and Vietnamese letters and replaces unsafe characters", () => {
    expect(buildExcelFileName("Khách hàng: 2026/Q1", 5)).toBe("Khách_hàng__2026_Q1_5.xlsx");
    expect(buildExcelFileName("a\\b*c?", 1)).toBe("a_b_c__1.xlsx");
  });

  it("falls back to a generic name for untitled tabs", () => {
    expect(buildExcelFileName("", 9)).toBe("result_9.xlsx");
    expect(buildExcelFileName(undefined, 9)).toBe("result_9.xlsx");
  });

  it("limits sheet names to Excel's 31 characters", () => {
    expect(buildSheetName("x".repeat(50))).toHaveLength(31);
    expect(buildSheetName("Orders")).toBe("Orders");
    expect(buildSheetName("")).toBe("Results");
  });

  it("builds the CSV and JSON default names", () => {
    expect(buildExportFileName("csv", 7)).toBe("result_7.csv");
    expect(buildExportFileName("json", 7)).toBe("result_7.json");
  });

  it("shows only the file name of a path, on both separators", () => {
    expect(displayFileName("/home/me/out/result.csv")).toBe("result.csv");
    expect(displayFileName("C:\\Users\\me\\result.json")).toBe("result.json");
    expect(displayFileName("plain.csv")).toBe("plain.csv");
  });
});

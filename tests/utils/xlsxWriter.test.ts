import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  buildXlsx,
  columnLabel,
  escapeXml,
  sanitizeSheetName,
  XLSX_MAX_COLUMNS,
} from "../../src/utils/xlsxWriter";

function readBack(bytes: Uint8Array, sheetName: string) {
  const wb = XLSX.read(bytes, { type: "array" });
  return { wb, ws: wb.Sheets[sheetName] };
}

describe("columnLabel", () => {
  it("converts indexes to A1 labels", () => {
    expect(columnLabel(0)).toBe("A");
    expect(columnLabel(25)).toBe("Z");
    expect(columnLabel(26)).toBe("AA");
    expect(columnLabel(701)).toBe("ZZ");
    expect(columnLabel(702)).toBe("AAA");
  });
});

describe("sanitizeSheetName", () => {
  it("removes forbidden characters and limits length", () => {
    expect(sanitizeSheetName("a/b:c*d?e[f]g\\h")).toBe("a_b_c_d_e_f_g_h");
    expect(sanitizeSheetName("x".repeat(40))).toHaveLength(31);
  });
  it("never returns an empty name", () => {
    expect(sanitizeSheetName("   ")).toBe("Sheet1");
  });
});

describe("escapeXml", () => {
  it("escapes markup and strips illegal control characters", () => {
    expect(escapeXml('<a href="x">&</a>')).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
    expect(escapeXml("a\u0000b\u0008c")).toBe("abc");
  });
});

describe("buildXlsx", () => {
  it("produces a workbook that SheetJS can read back with the same values", () => {
    const bytes = buildXlsx({
      name: "Khách hàng",
      columns: ["id", "name", "ok", "ratio"],
      rows: [
        [1, "Trần Thị Bích Ngọc", true, 0.5],
        [2, "日本語", false, -3],
      ],
    });
    const { wb, ws } = readBack(bytes, "Khách hàng");
    expect(wb.SheetNames).toEqual(["Khách hàng"]);
    expect(XLSX.utils.sheet_to_json(ws, { header: 1 })).toEqual([
      ["id", "name", "ok", "ratio"],
      [1, "Trần Thị Bích Ngọc", true, 0.5],
      [2, "日本語", false, -3],
    ]);
  });

  it("stores formula-looking strings as text, never as formulas", () => {
    const bytes = buildXlsx({ name: "S", columns: ["v"], rows: [["=1+1"], ["@SUM(A1)"]] });
    const { ws } = readBack(bytes, "S");
    expect(ws["A2"].t).toBe("s");
    expect(ws["A2"].v).toBe("=1+1");
    expect(ws["A2"].f).toBeUndefined();
    expect(ws["A3"].v).toBe("@SUM(A1)");
  });

  it("leaves null cells empty and keeps surrounding whitespace", () => {
    const bytes = buildXlsx({ name: "S", columns: ["a", "b"], rows: [[null, "  x  "]] });
    const { ws } = readBack(bytes, "S");
    expect(ws["A2"]).toBeUndefined();
    expect(ws["B2"].v).toBe("  x  ");
  });

  it("writes non-finite numbers as text", () => {
    const bytes = buildXlsx({ name: "S", columns: ["n"], rows: [[Infinity], [NaN]] });
    const { ws } = readBack(bytes, "S");
    expect(ws["A2"].v).toBe("Infinity");
    expect(ws["A3"].v).toBe("NaN");
  });

  it("rejects worksheets that exceed Excel limits", () => {
    expect(() =>
      buildXlsx({
        name: "S",
        columns: Array.from({ length: XLSX_MAX_COLUMNS + 1 }, (_, i) => `c${i}`),
        rows: [],
      }),
    ).toThrow(/Too many columns/);
  });

  it("handles tens of thousands of rows", () => {
    const rows = Array.from({ length: 20_000 }, (_, i) => [i, `row ${i}`]);
    const { ws } = readBack(buildXlsx({ name: "Big", columns: ["i", "t"], rows }), "Big");
    expect(ws["A20001"].v).toBe(19_999);
    expect(ws["B20001"].v).toBe("row 19999");
  });
});

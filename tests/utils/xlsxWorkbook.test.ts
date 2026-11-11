import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { unzipSync, strFromU8 } from "fflate";
import { buildXlsxWorkbook, uniqueSheetNames, XLSX_MAX_COLUMNS } from "../../src/utils/xlsxWriter";

const parts = (bytes: Uint8Array) => {
  const files = unzipSync(bytes);
  return Object.fromEntries(Object.entries(files).map(([name, data]) => [name, strFromU8(data)]));
};

describe("uniqueSheetNames", () => {
  it("keeps distinct valid names as they are", () => {
    expect(uniqueSheetNames(["a", "b"])).toEqual(["a", "b"]);
  });

  it("makes names unique ignoring case, appending a counter", () => {
    expect(uniqueSheetNames(["Users", "users", "USERS"])).toEqual(["Users", "users (2)", "USERS (3)"]);
  });

  it("shortens the base so the suffix still fits in 31 characters", () => {
    const long = "x".repeat(40);
    const [first, second] = uniqueSheetNames([long, long]);
    expect(first).toHaveLength(31);
    expect(second).toHaveLength(31);
    expect(second.endsWith(" (2)")).toBe(true);
    expect(first).not.toBe(second);
  });

  it("replaces forbidden characters and never returns an empty name", () => {
    expect(uniqueSheetNames(["a:b", "", "  "])).toEqual(["a_b", "Sheet1", "Sheet1 (2)"]);
  });
});

describe("buildXlsxWorkbook", () => {
  it("writes every sheet exactly as given, with styled cells", () => {
    const bytes = buildXlsxWorkbook([
      { name: "One", rows: [[{ value: "Title", style: "title" }], ["a", 1, true, null], []] },
      { name: "Two", rows: [[{ value: "H", style: "header" }, { value: "x", style: "cell" }]] },
    ]);
    const wb = XLSX.read(bytes, { type: "array" });
    expect(wb.SheetNames).toEqual(["One", "Two"]);
    const one = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets.One, { header: 1, defval: "" });
    expect(one[0][0]).toBe("Title");
    expect(one[1].slice(0, 3)).toEqual(["a", 1, true]);
    expect(XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets.Two, { header: 1 })[0]).toEqual(["H", "x"]);
  });

  it("registers one worksheet part and relationship per sheet", () => {
    const files = parts(buildXlsxWorkbook([{ name: "A", rows: [["x"]] }, { name: "B", rows: [["y"]] }, { name: "C", rows: [["z"]] }]));
    for (const i of [1, 2, 3]) {
      expect(files[`xl/worksheets/sheet${i}.xml`]).toContain("<sheetData>");
      expect(files["[Content_Types].xml"]).toContain(`/xl/worksheets/sheet${i}.xml`);
      expect(files["xl/_rels/workbook.xml.rels"]).toContain(`worksheets/sheet${i}.xml`);
    }
    expect(files["xl/_rels/workbook.xml.rels"]).toContain('Id="rId4"');
    expect(files["xl/_rels/workbook.xml.rels"]).toContain("styles.xml");
  });

  it("writes an internal hyperlink to another sheet, using the final sheet name", () => {
    const files = parts(
      buildXlsxWorkbook([
        { name: "Index", rows: [[{ value: "go", linkToSheet: "Users" }, { value: "go2", linkToSheet: "users" }]] },
        { name: "Users", rows: [["a"]] },
        { name: "users", rows: [["b"]] },
      ]),
    );
    const xml = files["xl/worksheets/sheet1.xml"];
    expect(xml).toContain('<hyperlink ref="A1" location="\'Users\'!A1"/>');
    expect(xml).toContain('<hyperlink ref="B1" location="\'users (2)\'!A1"/>');
  });

  it("escapes quotes and markup in a link target", () => {
    const files = parts(
      buildXlsxWorkbook([
        { name: "Index", rows: [[{ value: "go", linkToSheet: "it's & <b>" }]] },
        { name: "it's & <b>", rows: [["x"]] },
      ]),
    );
    expect(files["xl/worksheets/sheet1.xml"]).toContain("location=\"'it''s &amp; &lt;b&gt;'!A1\"");
  });

  it("ignores a link to a sheet that does not exist", () => {
    const files = parts(buildXlsxWorkbook([{ name: "A", rows: [[{ value: "x", linkToSheet: "Missing" }]] }]));
    expect(files["xl/worksheets/sheet1.xml"]).not.toContain("<hyperlinks>");
  });

  it("freezes the requested number of top rows", () => {
    const files = parts(buildXlsxWorkbook([{ name: "A", rows: [["h"], ["x"]], freezeRows: 1 }, { name: "B", rows: [["h"]] }]));
    expect(files["xl/worksheets/sheet1.xml"]).toContain('ySplit="1"');
    expect(files["xl/worksheets/sheet2.xml"]).not.toContain("<pane");
  });

  it("applies the column widths and falls back to 12", () => {
    const files = parts(buildXlsxWorkbook([{ name: "A", rows: [["a", "b"]], columnWidths: [30] }]));
    expect(files["xl/worksheets/sheet1.xml"]).toContain('min="1" max="1" width="30"');
    expect(files["xl/worksheets/sheet1.xml"]).toContain('min="2" max="2" width="12"');
  });

  it("keeps text that looks like a formula as text, and removes characters XML cannot hold", () => {
    const bytes = buildXlsxWorkbook([{ name: "A", rows: [["=1+1", "bad\u0000char"]] }]);
    const sheet = XLSX.read(bytes, { type: "array" }).Sheets.A;
    expect(sheet.A1.t).toBe("s");
    expect(sheet.A1.v).toBe("=1+1");
    expect(sheet.B1.v).toBe("badchar");
  });

  it("describes the styles used by the free-form cells", () => {
    const styles = parts(buildXlsxWorkbook([{ name: "A", rows: [["x"]] }]))["xl/styles.xml"];
    expect(styles).toContain('<cellXfs count="5">');
    expect(styles).toContain('<fills count="3">');
    expect(styles).toContain('<borders count="2">');
  });

  it("refuses an empty workbook, too many sheets and too many columns", () => {
    expect(() => buildXlsxWorkbook([])).toThrow("at least one sheet");
    const many = Array.from({ length: 256 }, (_, i) => ({ name: `s${i}`, rows: [["x"]] }));
    expect(() => buildXlsxWorkbook(many)).toThrow(/Too many sheets/);
    expect(() => buildXlsxWorkbook([{ name: "A", rows: [new Array(XLSX_MAX_COLUMNS + 1).fill("x")] }])).toThrow(/Too many columns/);
  });
});

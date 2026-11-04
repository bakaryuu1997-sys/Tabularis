import { zipSync, strToU8 } from "fflate";

/**
 * Minimal, write-only XLSX (SpreadsheetML) generator.
 *
 * It intentionally has no parsing code, so untrusted spreadsheets are never read.
 * Strings are stored as inline strings, which Excel always treats as text. A cell
 * starting with "=" is therefore never evaluated as a formula.
 */

export type XlsxCell = string | number | boolean | null | undefined;

export interface XlsxSheetInput {
  name: string;
  columns: string[];
  rows: XlsxCell[][];
  /** Column widths in character units. Defaults to 12 for every column. */
  columnWidths?: number[];
}

/** Excel hard limits for a single worksheet. */
export const XLSX_MAX_ROWS = 1_048_576;
export const XLSX_MAX_COLUMNS = 16_384;

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

// Characters that are illegal in XML 1.0 documents.
// eslint-disable-next-line no-control-regex
const INVALID_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export function escapeXml(value: string): string {
  return value
    .replace(INVALID_XML_CHARS, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Converts a zero-based column index to an A1-style column label (0 -> A, 26 -> AA). */
export function columnLabel(index: number): string {
  let label = "";
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

/** Excel sheet names: max 31 chars and none of [ ] : * ? / \ . Never empty. */
export function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(/[[\]:*?/\\]/g, "_").replace(/^'+|'+$/g, "").trim();
  return (cleaned || "Sheet1").slice(0, 31);
}

function renderCell(ref: string, value: XlsxCell, style?: number): string {
  if (value === null || value === undefined) return "";
  const styleAttr = style ? ` s="${style}"` : "";
  if (typeof value === "number") {
    if (Number.isFinite(value)) return `<c r="${ref}"${styleAttr}><v>${value}</v></c>`;
    return `<c r="${ref}"${styleAttr} t="inlineStr"><is><t>${escapeXml(String(value))}</t></is></c>`;
  }
  if (typeof value === "boolean") {
    return `<c r="${ref}"${styleAttr} t="b"><v>${value ? 1 : 0}</v></c>`;
  }
  return `<c r="${ref}"${styleAttr} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function renderSheet(sheet: XlsxSheetInput): string {
  const colCount = sheet.columns.length;
  if (colCount > XLSX_MAX_COLUMNS) {
    throw new Error(`Too many columns for XLSX: ${colCount} (max ${XLSX_MAX_COLUMNS})`);
  }
  if (sheet.rows.length + 1 > XLSX_MAX_ROWS) {
    throw new Error(`Too many rows for XLSX: ${sheet.rows.length} (max ${XLSX_MAX_ROWS - 1})`);
  }

  const cols = sheet.columns
    .map((_, i) => {
      const width = sheet.columnWidths?.[i] ?? 12;
      return `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`;
    })
    .join("");

  const parts: string[] = [];
  parts.push(
    `<row r="1">${sheet.columns.map((c, i) => renderCell(`${columnLabel(i)}1`, c, 1)).join("")}</row>`,
  );
  for (let r = 0; r < sheet.rows.length; r++) {
    const rowNumber = r + 2;
    const row = sheet.rows[r];
    let cells = "";
    for (let c = 0; c < colCount; c++) {
      cells += renderCell(`${columnLabel(c)}${rowNumber}`, row[c]);
    }
    parts.push(`<row r="${rowNumber}">${cells}</row>`);
  }

  return (
    XML_HEADER +
    `<worksheet xmlns="${MAIN_NS}"><sheetViews><sheetView workbookViewId="0">` +
    `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols>${cols}</cols><sheetData>${parts.join("")}</sheetData></worksheet>`
  );
}

const CONTENT_TYPES =
  XML_HEADER +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  "</Types>";

const ROOT_RELS =
  XML_HEADER +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  "</Relationships>";

const WORKBOOK_RELS =
  XML_HEADER +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  "</Relationships>";

// Style 0 = default, style 1 = bold header.
const STYLES =
  XML_HEADER +
  `<styleSheet xmlns="${MAIN_NS}">` +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
  "</styleSheet>";

/** Builds a single-sheet XLSX workbook and returns the raw bytes of the .xlsx (zip) file. */
export function buildXlsx(sheet: XlsxSheetInput): Uint8Array {
  const workbook =
    XML_HEADER +
    `<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}"><sheets>` +
    `<sheet name="${escapeXml(sanitizeSheetName(sheet.name))}" sheetId="1" r:id="rId1"/>` +
    "</sheets></workbook>";

  return zipSync({
    "[Content_Types].xml": strToU8(CONTENT_TYPES),
    "_rels/.rels": strToU8(ROOT_RELS),
    "xl/workbook.xml": strToU8(workbook),
    "xl/_rels/workbook.xml.rels": strToU8(WORKBOOK_RELS),
    "xl/styles.xml": strToU8(STYLES),
    "xl/worksheets/sheet1.xml": strToU8(renderSheet(sheet)),
  });
}

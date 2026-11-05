/** File-name helpers for exporting a result grid. Kept pure so they can be unit tested. */

/** Characters allowed in a generated file name: ASCII word characters, dashes and Latin / Vietnamese letters. */
const UNSAFE_FILE_NAME_CHARS = /[^a-zA-Z0-9_\-\u00C0-\u024F\u1EA0-\u1EF9]/g;

/** `<title>_<timestamp>.xlsx`, or `result_<timestamp>.xlsx` for an untitled tab. */
export function buildExcelFileName(title: string | undefined | null, now: number = Date.now()): string {
  return title
    ? `${title.replace(UNSAFE_FILE_NAME_CHARS, "_")}_${now}.xlsx`
    : `result_${now}.xlsx`;
}

/** Excel limits sheet names to 31 characters. */
export function buildSheetName(title: string | undefined | null): string {
  return title ? title.slice(0, 31) : "Results";
}

/** Default file name offered in the save dialog for CSV / JSON exports. */
export function buildExportFileName(format: "csv" | "json", now: number = Date.now()): string {
  return `result_${now}.${format}`;
}

/** Only the file name (not the folder) is shown in the progress dialog. */
export function displayFileName(filePath: string): string {
  return filePath.split(/[/\\]/).pop() || filePath;
}

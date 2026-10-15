import type { TableColumn, ForeignKey } from "../types/editor";

export interface ColumnDetailInfo {
  isPk: boolean;
  fk?: ForeignKey;
  dataType?: string;
  tooltip: string;
}

export function describeDataTypeValidation(dataType: string, maxLen?: number): string {
  if (!dataType) return "";
  const dt = dataType.toLowerCase();
  if (maxLen && maxLen > 0) {
    return `Chuỗi ký tự (Tối đa ${maxLen} ký tự)`;
  }
  if (dt.includes("varchar") || dt.includes("char") || dt.includes("text")) {
    const match = dt.match(/\((\d+)\)/);
    if (match) {
      return `Chuỗi ký tự (Tối đa ${match[1]} ký tự)`;
    }
    return "Chuỗi ký tự (Text/String)";
  }
  if (dt.includes("tinyint(1)") || dt.includes("bool") || dt.includes("boolean")) {
    return "Kiểu Logic (Boolean / 0 hoặc 1)";
  }
  if (dt.includes("bigint")) {
    return "Số nguyên lớn 64-bit (BIGINT)";
  }
  if (dt.includes("smallint") || dt.includes("tinyint")) {
    return "Số nguyên nhỏ (SMALLINT/TINYINT)";
  }
  if (dt.includes("int")) {
    return "Số nguyên 32-bit (INTEGER)";
  }
  if (dt.includes("decimal") || dt.includes("numeric")) {
    return "Số thập phân chính xác cao (DECIMAL)";
  }
  if (dt.includes("float") || dt.includes("double") || dt.includes("real")) {
    return "Số thực dấu phẩy động (FLOAT/DOUBLE)";
  }
  if (dt.includes("datetime") || dt.includes("timestamp")) {
    return "Ngày & Giờ (DATETIME/TIMESTAMP)";
  }
  if (dt.includes("date")) {
    return "Ngày tháng (DATE: YYYY-MM-DD)";
  }
  if (dt.includes("time")) {
    return "Thời gian (TIME: HH:MM:SS)";
  }
  if (dt.includes("json")) {
    return "Cấu trúc dữ liệu JSON";
  }
  if (dt.includes("blob") || dt.includes("bytea") || dt.includes("binary")) {
    return "Dữ liệu nhị phân (BLOB/Binary)";
  }
  if (dt.includes("uuid")) {
    return "Mã định danh duy nhất (UUID)";
  }
  return `Kiểu dữ liệu: ${dataType.toUpperCase()}`;
}

export function buildColumnTooltip(
  colName: string,
  meta?: TableColumn,
  isPk?: boolean,
  fk?: ForeignKey,
  sortPrompt?: string,
): string {
  const lines: string[] = [];
  const typeStr = meta?.data_type ? ` [${meta.data_type.toUpperCase()}]` : "";
  lines.push(`${colName}${typeStr}`);

  if (isPk) {
    lines.push("🔑 Khóa chính (Primary Key)");
  }
  if (fk) {
    lines.push(`🔗 Khóa ngoại ➔ Tham chiếu tới: ${fk.ref_table}.${fk.ref_column}`);
  }

  if (meta) {
    if (meta.is_nullable === false) {
      lines.push("• Ràng buộc: Bắt buộc (NOT NULL)");
    } else if (meta.is_nullable === true) {
      lines.push("• Ràng buộc: Cho phép NULL");
    }

    if (meta.is_auto_increment) {
      lines.push("• Tự động tăng (AUTO_INCREMENT)");
    }

    if (meta.default_value !== undefined && meta.default_value !== null && meta.default_value !== "") {
      lines.push(`• Mặc định: ${meta.default_value}`);
    }

    const valDesc = describeDataTypeValidation(meta.data_type, meta.character_maximum_length);
    if (valDesc) {
      lines.push(`• Quy cách: ${valDesc}`);
    }
  }

  if (sortPrompt) {
    lines.push(`\n(${sortPrompt})`);
  }

  return lines.join("\n");
}

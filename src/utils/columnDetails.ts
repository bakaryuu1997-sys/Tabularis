import type { TableColumn, ForeignKey } from "../types/editor";
import { translate } from "../i18n/translate";

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
    return translate("columnDetails.types.maxChars", { max: maxLen });
  }
  if (dt.includes("varchar") || dt.includes("char") || dt.includes("text")) {
    const match = dt.match(/\((\d+)\)/);
    if (match) {
      return translate("columnDetails.types.maxChars", { max: match[1] });
    }
    return translate("columnDetails.types.text");
  }
  if (dt.includes("tinyint(1)") || dt.includes("bool") || dt.includes("boolean")) {
    return translate("columnDetails.types.boolean");
  }
  if (dt.includes("bigint")) {
    return translate("columnDetails.types.bigint");
  }
  if (dt.includes("smallint") || dt.includes("tinyint")) {
    return translate("columnDetails.types.smallint");
  }
  if (dt.includes("int")) {
    return translate("columnDetails.types.integer");
  }
  if (dt.includes("decimal") || dt.includes("numeric")) {
    return translate("columnDetails.types.decimal");
  }
  if (dt.includes("float") || dt.includes("double") || dt.includes("real")) {
    return translate("columnDetails.types.float");
  }
  if (dt.includes("datetime") || dt.includes("timestamp")) {
    return translate("columnDetails.types.datetime");
  }
  if (dt.includes("date")) {
    return translate("columnDetails.types.date");
  }
  if (dt.includes("time")) {
    return translate("columnDetails.types.time");
  }
  if (dt.includes("json")) {
    return translate("columnDetails.types.json");
  }
  if (dt.includes("blob") || dt.includes("bytea") || dt.includes("binary")) {
    return translate("columnDetails.types.blob");
  }
  if (dt.includes("uuid")) {
    return translate("columnDetails.types.uuid");
  }
  return translate("columnDetails.types.other", { type: dataType.toUpperCase() });
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
    lines.push(translate("columnDetails.primaryKey"));
  }
  if (fk) {
    lines.push(translate("columnDetails.foreignKey", { table: fk.ref_table, column: fk.ref_column }));
  }

  if (meta) {
    if (meta.is_nullable === false) {
      lines.push(translate("columnDetails.notNull"));
    } else if (meta.is_nullable === true) {
      lines.push(translate("columnDetails.nullable"));
    }

    if (meta.is_auto_increment) {
      lines.push(translate("columnDetails.autoIncrement"));
    }

    if (meta.default_value !== undefined && meta.default_value !== null && meta.default_value !== "") {
      lines.push(translate("columnDetails.defaultValue", { value: meta.default_value }));
    }

    const valDesc = describeDataTypeValidation(meta.data_type, meta.character_maximum_length);
    if (valDesc) {
      lines.push(translate("columnDetails.spec", { description: valDesc }));
    }
  }

  if (sortPrompt) {
    lines.push(`\n(${sortPrompt})`);
  }

  return lines.join("\n");
}

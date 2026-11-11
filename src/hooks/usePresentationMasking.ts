import { useContext, useMemo } from "react";
import { SettingsContext } from "../contexts/SettingsContext";
import {
  isSensitiveColumn,
  maskRecord,
  maskRows,
  maskSensitiveValue,
  maskSqlLiterals,
  parseExtraMaskedColumns,
} from "../utils/dataMasking";
import { usePresentationMode } from "./usePresentationMode";

/**
 * Masking helpers for places outside the data grid that show row values or SQL text (row editor, history).
 * Every helper returns its input unchanged unless presentation mode is on. Reads the settings context directly,
 * so it also works where no settings provider is mounted.
 */
export function usePresentationMasking() {
  const { isPresentationMode } = usePresentationMode();
  const settingsContext = useContext(SettingsContext);
  const profile = settingsContext?.settings.maskingProfile ?? "smart";
  const extraSetting = settingsContext?.settings.maskingExtraColumns;
  const extraColumns = useMemo(() => parseExtraMaskedColumns(extraSetting), [extraSetting]);

  return useMemo(
    () => ({
      isPresentationMode,
      /** True when this column's values must be hidden right now. */
      isMasked: (columnName: string) => isPresentationMode && isSensitiveColumn(columnName, extraColumns),
      /** The text to show for one value of a sensitive column. */
      maskValue: (columnName: string, value: unknown) => maskSensitiveValue(value, columnName, profile),
      /** A copy of the record with sensitive values masked, or the record itself when not presenting. */
      maskRecord: (record: Record<string, unknown>) =>
        isPresentationMode ? maskRecord(record, profile, extraColumns) : record,
      /** Rows (arrays in the order of `columns`) with sensitive columns masked, or the rows themselves when not presenting. */
      maskRows: (rows: unknown[][], columns: readonly string[]) =>
        isPresentationMode ? maskRows(rows, columns, profile, extraColumns) : rows,
      /** SQL with its literal values hidden, or the SQL itself when not presenting. */
      maskSql: (sql: string) => (isPresentationMode ? maskSqlLiterals(sql) : sql),
    }),
    [isPresentationMode, profile, extraColumns],
  );
}

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import type { ExportStatus } from "../components/modals/ExportProgressModal";
import type { Tab } from "../types/editor";
import type { DriverCapabilities } from "../types/plugins";
import { isMultiDatabaseCapable } from "../utils/database";
import { reconstructTableQuery } from "../utils/editor";
import { exportQueryResultToExcel } from "../utils/excelExport";
import {
  buildExcelFileName,
  buildExportFileName,
  buildSheetName,
  displayFileName,
} from "../utils/resultExport";

export interface ExportState {
  isOpen: boolean;
  status: ExportStatus;
  rowsProcessed: number;
  fileName: string;
  errorMessage?: string;
}

const INITIAL_STATE: ExportState = {
  isOpen: false,
  status: "exporting",
  rowsProcessed: 0,
  fileName: "",
};

type ShowAlert = (message: string, options?: { title?: string; kind?: "info" | "warning" | "error" }) => unknown;

export interface UseResultExportOptions {
  activeTab: Tab | null | undefined;
  connectionId: string | null | undefined;
  capabilities: DriverCapabilities | null | undefined;
  driver: string | null | undefined;
  activeSchema: string | null | undefined;
  csvDelimiter: string;
  showAlert: ShowAlert;
  t: (key: string) => string;
}

/**
 * Exporting the active result to CSV, JSON or Excel, including the progress dialog state and the
 * `export_progress` event subscription.
 */
export function useResultExport({
  activeTab,
  connectionId,
  capabilities,
  driver,
  activeSchema,
  csvDelimiter,
  showAlert,
  t,
}: UseResultExportOptions) {
  const [exportState, setExportState] = useState<ExportState>(INITIAL_STATE);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  useEffect(() => {
    const unlisten = listen<{ rows_processed: number }>("export_progress", (event) => {
      setExportState((prev) => ({ ...prev, rowsProcessed: event.payload.rows_processed }));
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const cancelExport = useCallback(async () => {
    if (!connectionId) return;
    try {
      await invoke("cancel_export", { connectionId });
      setExportState((prev) => ({ ...prev, isOpen: false }));
    } catch (e) {
      console.error("Failed to cancel export", e);
    }
  }, [connectionId]);

  const closeExportModal = useCallback(() => {
    setExportState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const exportToFile = async (format: "csv" | "json") => {
    if (!activeTab || !connectionId) return;

    const effectiveSchema = capabilities?.schemas === true ? activeTab.schema : undefined;
    const tabForQuery = { ...activeTab, schema: effectiveSchema };
    const query =
      activeTab.type === "table" && activeTab.activeTable
        ? reconstructTableQuery(tabForQuery, driver ?? undefined)
        : activeTab.query;

    if (!query || !query.trim()) return;

    try {
      const filePath = await save({
        filters: [{ name: format.toUpperCase(), extensions: [format] }],
        defaultPath: buildExportFileName(format),
      });

      if (!filePath) return;

      setExportState({
        isOpen: true,
        status: "exporting",
        rowsProcessed: 0,
        fileName: displayFileName(filePath),
      });
      setExportMenuOpen(false);

      // On multi-database connections (e.g. MySQL) scope the export to the selected database so the
      // query runs against the database the user is viewing rather than the connection's primary one.
      // The tab may not carry its own schema (e.g. a console query), so fall back to the active
      // database, mirroring how execute_query resolves the schema.
      const targetDatabase = activeTab.schema ?? activeSchema ?? undefined;
      const databaseParam =
        isMultiDatabaseCapable(capabilities) && targetDatabase ? { database: targetDatabase } : {};

      await invoke("export_query_to_file", {
        connectionId,
        query,
        filePath,
        format,
        csvDelimiter: format === "csv" ? csvDelimiter : undefined,
        ...databaseParam,
      });

      setExportState((prev) => ({ ...prev, status: "completed" }));
    } catch (e) {
      setExportState((prev) => ({ ...prev, status: "error", errorMessage: String(e) }));
    }
  };

  const exportCsv = () => exportToFile("csv");
  const exportJson = () => exportToFile("json");

  const exportExcel = async () => {
    if (!activeTab?.result) return;
    const { columns, rows } = activeTab.result;
    if (!columns.length || !rows.length) return;

    setExportMenuOpen(false);
    try {
      const savedPath = await exportQueryResultToExcel({
        columns,
        rows,
        defaultFileName: buildExcelFileName(activeTab.title),
        sheetName: buildSheetName(activeTab.title),
      });

      if (savedPath) showAlert(t("common.saved"), { kind: "info" });
    } catch (err) {
      console.error("Export Excel error:", err);
      showAlert(String(err), { kind: "error" });
    }
  };

  return {
    exportState,
    exportMenuOpen,
    setExportMenuOpen,
    cancelExport,
    closeExportModal,
    exportCsv,
    exportJson,
    exportExcel,
  };
}

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import {
  Square,
  Play,
  ChevronDown,
  Save,
  Download,
  FileSpreadsheet,
  FileText,
  FileJson,
  Database,
} from "lucide-react";
import type { Tab } from "../../types/editor";
import { statementLabel } from "../../utils/sql";
import { extractQueryParams } from "../../utils/queryParameters";
import {
  getRunShortcutLabel,
  getRunAriaShortcut,
  getActiveDatabaseLabel,
} from "../../utils/editorToolbar";

export interface EditorToolbarProps {
  isNotebookTab: boolean;
  isTableTab: boolean;
  activeTab: Tab;
  activeConnectionId?: string | null;
  isMac: boolean;
  stopQuery: () => void;
  onRun: () => void;
  onRunDropdownToggle: () => void;
  isRunDropdownOpen: boolean;
  onCloseRunDropdown: () => void;
  dropdownQueries: string[];
  onRunQuery: (query: string, pageNum?: number) => void;
  onSaveQuery: (sql: string) => void;
  onEditParams: () => void;
  exportMenuOpen: boolean;
  onToggleExportMenu: () => void;
  onCloseExportMenu: () => void;
  onExportExcel: () => void;
  onExportCSV: () => void;
  onExportJSON: () => void;
  isMultiDb: boolean;
  selectedDatabases: string[];
  onSelectDatabase: (db: string) => void;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  isNotebookTab,
  isTableTab,
  activeTab,
  activeConnectionId,
  isMac,
  stopQuery,
  onRun,
  onRunDropdownToggle,
  isRunDropdownOpen,
  onCloseRunDropdown,
  dropdownQueries,
  onRunQuery,
  onSaveQuery,
  onEditParams,
  exportMenuOpen,
  onToggleExportMenu,
  onCloseExportMenu,
  onExportExcel,
  onExportCSV,
  onExportJSON,
  isMultiDb,
  selectedDatabases,
  onSelectDatabase,
}) => {
  const { t } = useTranslation();
  const [isDbDropdownOpen, setIsDbDropdownOpen] = useState(false);

  if (isNotebookTab) {
    return null;
  }

  const activeDbLabel = getActiveDatabaseLabel(
    activeTab.schema,
    selectedDatabases,
  );

  return (
    <div className="flex items-center py-2 pl-2 pr-3 border-b border-default bg-elevated gap-2 h-[50px]">
      {!activeTab.readOnly && activeTab.isLoading ? (
        <button
          onClick={stopQuery}
          className="flex items-center gap-2 px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white rounded text-sm font-medium"
        >
          <Square size={16} fill="currentColor" /> {t("editor.stop")}
        </button>
      ) : !activeTab.readOnly ? (
        <div className="flex items-center rounded bg-green-700 relative">
          <button
            onClick={onRun}
            disabled={!activeConnectionId}
            aria-label={`${t("editor.run")} (${getRunShortcutLabel(isMac)})`}
            aria-keyshortcuts={getRunAriaShortcut(isMac)}
            title={`${t("editor.run")} (${getRunShortcutLabel(isMac)})`}
            className={clsx(
              "flex items-center gap-2 px-3 py-1.5 text-white text-sm font-medium disabled:opacity-50 hover:bg-green-600",
              isTableTab ? "rounded" : "rounded-l",
            )}
          >
            <Play size={16} fill="currentColor" /> {t("editor.run")}
          </button>
          {!isTableTab && (
            <>
              <div className="h-5 w-[1px] bg-green-800"></div>
              <button
                onClick={onRunDropdownToggle}
                disabled={!activeConnectionId}
                className="px-1.5 py-1.5 text-white rounded-r hover:bg-green-600 disabled:opacity-50"
              >
                <ChevronDown size={14} />
              </button>

              {isRunDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={onCloseRunDropdown}
                  />
                  <div className="absolute top-full left-0 mt-1 w-80 bg-surface-secondary border border-strong rounded shadow-xl z-50 flex flex-col py-1 max-h-80 overflow-y-auto">
                    {dropdownQueries.length === 0 ? (
                      <div className="px-4 py-2 text-xs text-muted italic">
                        {t("editor.noValidQueries")}
                      </div>
                    ) : (
                      dropdownQueries.map((q, i) => {
                        const label = statementLabel(q);
                        return (
                          <div
                            key={i}
                            className="flex items-center border-b border-strong/50 last:border-0 hover:bg-surface-tertiary/50 transition-colors group"
                          >
                            <button
                              onClick={() => {
                                onRunQuery(q, 1);
                                onCloseRunDropdown();
                              }}
                              className="text-left px-4 py-2 text-xs font-mono text-secondary hover:text-white flex-1 truncate"
                              title={q}
                            >
                              {label}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onCloseRunDropdown();
                                onSaveQuery(q);
                              }}
                              className="p-2 text-muted hover:text-white hover:bg-surface transition-colors mr-1 rounded shrink-0 opacity-0 group-hover:opacity-100"
                              title={t("editor.saveThisQuery")}
                            >
                              <Save size={14} />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      ) : null}

      {/* Params Button */}
      {!isTableTab && (
        <button
          onClick={onEditParams}
          disabled={
            !activeTab?.query ||
            extractQueryParams(activeTab.query).length === 0
          }
          className="flex items-center gap-2 px-3 py-1.5 bg-surface-secondary hover:bg-surface text-primary rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed border border-strong"
          title={t("editor.queryParameters")}
        >
          <span className="font-mono text-xs font-bold border border-muted text-secondary rounded px-1.5 py-0.5">
            P
          </span>
          {t("editor.parameters")}
        </button>
      )}

      <div className="relative ml-auto">
        <button
          onClick={onToggleExportMenu}
          disabled={!activeTab.result || activeTab.result.rows.length === 0}
          aria-haspopup="menu"
          aria-expanded={exportMenuOpen}
          className={clsx(
            "flex items-center gap-2 px-3 py-1.5 rounded text-sm font-medium border transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
            exportMenuOpen
              ? "bg-blue-500/15 border-blue-500/40 text-blue-400"
              : "bg-surface-secondary enabled:hover:bg-blue-500/15 enabled:hover:border-blue-500/40 enabled:hover:text-blue-400 text-primary border-strong",
          )}
        >
          <Download size={16} />
          {t("editor.export")}
          <ChevronDown
            size={14}
            className={clsx(
              "transition-transform opacity-70",
              exportMenuOpen && "rotate-180",
            )}
          />
        </button>
        {exportMenuOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={onCloseExportMenu}
            />
            <div
              role="menu"
              className="absolute top-full right-0 mt-1 w-44 bg-elevated border border-strong rounded-md shadow-xl z-50 flex flex-col py-1 overflow-hidden"
            >
              <button
                role="menuitem"
                onClick={onExportExcel}
                className="flex items-center gap-2.5 text-left px-3 py-2 text-sm text-secondary hover:bg-blue-500/15 hover:text-blue-400 transition-colors"
              >
                <FileSpreadsheet
                  size={14}
                  className="shrink-0 text-emerald-400 opacity-90"
                />
                <span className="flex-1 font-medium">Excel</span>
                <span className="text-xs text-muted">.xlsx</span>
              </button>
              <button
                role="menuitem"
                onClick={onExportCSV}
                className="flex items-center gap-2.5 text-left px-3 py-2 text-sm text-secondary hover:bg-blue-500/15 hover:text-blue-400 transition-colors"
              >
                <FileText size={14} className="shrink-0 opacity-80" />
                <span className="flex-1">CSV</span>
                <span className="text-xs text-muted">.csv</span>
              </button>
              <button
                role="menuitem"
                onClick={onExportJSON}
                className="flex items-center gap-2.5 text-left px-3 py-2 text-sm text-secondary hover:bg-blue-500/15 hover:text-blue-400 transition-colors"
              >
                <FileJson size={14} className="shrink-0 opacity-80" />
                <span className="flex-1">JSON</span>
                <span className="text-xs text-muted">.json</span>
              </button>
            </div>
          </>
        )}
      </div>

      {!isTableTab && isMultiDb && activeTab.type !== "query_builder" ? (
        <div className="relative ml-2">
          <button
            onClick={() => setIsDbDropdownOpen((v) => !v)}
            className="flex items-center gap-1.5 px-2 py-1 bg-surface-secondary border border-strong rounded text-xs text-primary hover:bg-surface transition-colors h-[30px]"
            title={t("editor.activeDatabase")}
          >
            <Database size={12} className="text-muted shrink-0" />
            <span className="max-w-[120px] truncate">{activeDbLabel}</span>
            <ChevronDown size={12} className="text-muted shrink-0" />
          </button>
          {isDbDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsDbDropdownOpen(false)}
              />
              <div className="absolute top-full right-0 mt-1 min-w-[140px] max-h-[280px] overflow-y-auto bg-surface-secondary border border-strong rounded shadow-xl z-50 flex flex-col py-1">
                {selectedDatabases.map((db) => (
                  <button
                    key={db}
                    onClick={() => {
                      onSelectDatabase(db);
                      setIsDbDropdownOpen(false);
                    }}
                    className={clsx(
                      "text-left px-3 py-1.5 text-xs hover:bg-surface transition-colors flex items-center gap-2",
                      activeDbLabel === db
                        ? "text-white font-medium"
                        : "text-secondary",
                    )}
                  >
                    <Database size={11} className="text-muted shrink-0" />
                    {db}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <span className="text-xs text-muted ml-2">
          {activeConnectionId
            ? t("editor.connected")
            : t("editor.disconnected")}
        </span>
      )}
    </div>
  );
};

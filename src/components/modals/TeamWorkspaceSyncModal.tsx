import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  Share2,
  Download,
  Upload,
  Lock,
  Unlock,
  Check,
  Copy,
  GitBranch,
  Database,
  FileCode,
  ShieldCheck,
  } from "lucide-react";
import { useDatabase } from "../../hooks/useDatabase";
import { useSavedQueries } from "../../hooks/useSavedQueries";
import { invoke } from "@tauri-apps/api/core";
import { useAlert } from "../../hooks/useAlert";
import { copyTextToClipboard } from "../../utils/clipboard";
import { GitSyncPanel } from "./team-sync/GitSyncPanel";
import {
  exportTeamWorkspaceBundle,
  parseAndReconcileWorkspaceBundle,
  type WorkspaceImportResult,
} from "../../utils/teamWorkspaceSync";

export interface TeamWorkspaceSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TeamWorkspaceSyncModal: React.FC<TeamWorkspaceSyncModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();
  const { showAlert } = useAlert();
  const { connections: savedConnections, loadConnections } = useDatabase();
  const { queries: savedQueries, saveQuery } = useSavedQueries();

  const [activeTab, setActiveTab] = useState<"export" | "import" | "git">("export");

  // Export State
  const [encryptEnabled, setEncryptEnabled] = useState(true);
  const [passphrase, setPassphrase] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [exportedJson, setExportedJson] = useState<string | null>(null);

  // Import State
  const [importJson, setImportJson] = useState("");
  const [importPassphrase, setImportPassphrase] = useState("");
  const [conflictMode, setConflictMode] = useState<"merge_new" | "overwrite">("merge_new");
  const [importResult, setImportResult] = useState<WorkspaceImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  if (!isOpen) return null;

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const json = await exportTeamWorkspaceBundle(savedConnections, savedQueries, {
        includePasswords: encryptEnabled && passphrase.trim().length > 0,
        passphrase: encryptEnabled ? passphrase.trim() : undefined,
      });
      setExportedJson(json);
      showAlert(t("teamSync.exportSuccess"), { kind: "info" });
    } catch (err) {
      showAlert(`${t("teamSync.exportFailed")} ${String(err)}`, { kind: "error" });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadFile = () => {
    if (!exportedJson) return;
    const blob = new Blob([exportedJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tabularis-workspace.json";
    a.click();
    URL.revokeObjectURL(url);
    showAlert(t("teamSync.downloaded"), { kind: "info" });
  };

  const handleCopyJson = async () => {
    if (!exportedJson) return;
    try {
      await copyTextToClipboard(exportedJson);
      showAlert(t("common.copied"), { kind: "info" });
    } catch {
      showAlert(t("common.error"), { kind: "error" });
    }
  };

  const handleAnalyzeImport = async () => {
    if (!importJson.trim()) {
      showAlert(t("teamSync.emptyImport"), { kind: "warning" });
      return;
    }

    setIsImporting(true);
    try {
      const result = await parseAndReconcileWorkspaceBundle(
        importJson.trim(),
        savedConnections,
        savedQueries,
        importPassphrase.trim() || undefined,
        conflictMode
      );
      setImportResult(result);
      if (!result.valid) {
        showAlert(
          result.errorCode
            ? t(`teamSync.errors.${result.errorCode}`)
            : t("teamSync.importInvalid"),
          { kind: "error" },
        );
      }
    } catch (err) {
      showAlert(`${t("teamSync.importError")} ${String(err)}`, { kind: "error" });
    } finally {
      setIsImporting(false);
    }
  };

  const handleApplyImport = async () => {
    if (!importResult || !importResult.valid) return;

    setIsImporting(true);
    try {
      let connCount = 0;
      let queryCount = 0;

      for (const conn of importResult.importedConnections) {
        try {
          await invoke("save_connection", {
            name: conn.name,
            params: conn.params,
          });
          connCount++;
        } catch {
          // ignore duplicate errors
        }
      }
      await loadConnections();

      for (const q of importResult.importedQueries) {
        try {
          await saveQuery(q.name, q.sql, q.database);
          queryCount++;
        } catch {
          // ignore duplicate errors
        }
      }

      showAlert(
        t("teamSync.applySuccess", { connections: connCount, queries: queryCount }),
        { kind: "info" }
      );
      onClose();
    } catch (err) {
      showAlert(`${t("teamSync.applyFailed")} ${String(err)}`, { kind: "error" });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative flex flex-col w-full max-w-3xl max-h-[85vh] bg-surface border border-default rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-default bg-base/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-primary">
                {t("teamSync.title")}
              </h2>
              <p className="text-xs text-muted">
                {t("teamSync.subtitle")}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-surface-secondary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center px-6 border-b border-default bg-base/30 text-xs">
          <button
            onClick={() => setActiveTab("export")}
            className={`flex items-center gap-1.5 py-3 px-4 border-b-2 font-medium transition-colors ${
              activeTab === "export"
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-primary"
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            {t("teamSync.tabExport")}
          </button>
          <button
            onClick={() => setActiveTab("import")}
            className={`flex items-center gap-1.5 py-3 px-4 border-b-2 font-medium transition-colors ${
              activeTab === "import"
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-primary"
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            {t("teamSync.tabImport")}
          </button>
          <button
            onClick={() => setActiveTab("git")}
            className={`flex items-center gap-1.5 py-3 px-4 border-b-2 font-medium transition-colors ${
              activeTab === "git"
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-primary"
            }`}
          >
            <GitBranch className="w-3.5 h-3.5" />
            {t("teamSync.tabGit")}
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === "export" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-surface-secondary border border-default flex items-center gap-3">
                  <Database className="w-4 h-4 text-blue-400" />
                  <div className="text-xs">
                    <span className="text-muted block">{t("teamSync.labelConnections")}</span>
                    <span className="font-semibold text-primary">{t("teamSync.connectionCount", { count: savedConnections.length })}</span>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-surface-secondary border border-default flex items-center gap-3">
                  <FileCode className="w-4 h-4 text-emerald-400" />
                  <div className="text-xs">
                    <span className="text-muted block">{t("teamSync.labelQueries")}</span>
                    <span className="font-semibold text-primary">{t("teamSync.queryCount", { count: savedQueries.length })}</span>
                  </div>
                </div>
              </div>

              {/* Encryption controls */}
              <div className="p-4 rounded-lg bg-surface-secondary border border-default space-y-3">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={encryptEnabled}
                    onChange={(e) => setEncryptEnabled(e.target.checked)}
                    className="rounded border-default text-primary focus:ring-0"
                  />
                  <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    {t("teamSync.encryptOption")}
                  </span>
                </label>

                {encryptEnabled ? (
                  <div className="space-y-1.5 pl-6">
                    <div className="flex items-center gap-2">
                      <Lock className="w-3.5 h-3.5 text-muted" />
                      <input
                        type="password"
                        value={passphrase}
                        onChange={(e) => setPassphrase(e.target.value)}
                        placeholder={t("teamSync.passphrasePlaceholder")}
                        className="flex-1 px-3 py-1.5 rounded bg-base border border-default text-xs text-primary focus:outline-none focus:border-primary"
                      />
                    </div>
                    <p className="text-[11px] text-muted">
                      {t("teamSync.encryptionNote")}
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-amber-400/90 pl-6">
                    <Unlock className="w-3.5 h-3.5" />
                    <span>{t("teamSync.passwordsStripped")}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleExport}
                  disabled={isExporting}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-xs hover:opacity-90 transition-all flex items-center gap-2"
                >
                  <Download className="w-3.5 h-3.5" />
                  {isExporting ? t("teamSync.exporting") : t("teamSync.createBundle")}
                </button>

                {exportedJson && (
                  <>
                    <button
                      onClick={handleDownloadFile}
                      className="px-4 py-2 rounded-lg bg-surface-secondary hover:bg-surface border border-default text-xs font-medium text-primary transition-colors flex items-center gap-2"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-400" />
                      {t("teamSync.downloadJson")}
                    </button>
                    <button
                      onClick={handleCopyJson}
                      className="px-4 py-2 rounded-lg bg-surface-secondary hover:bg-surface border border-default text-xs font-medium text-primary transition-colors flex items-center gap-2"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {t("teamSync.copyJson")}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {activeTab === "import" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-primary block">
                  {t("teamSync.pasteLabel")}
                </label>
                <textarea
                  value={importJson}
                  onChange={(e) => setImportJson(e.target.value)}
                  placeholder={t("teamSync.pastePlaceholder")}
                  rows={6}
                  className="w-full p-3 rounded-lg bg-base border border-default font-mono text-xs text-primary focus:outline-none focus:border-primary resize-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-primary block">
                    {t("teamSync.decryptLabel")}
                  </label>
                  <input
                    type="password"
                    value={importPassphrase}
                    onChange={(e) => setImportPassphrase(e.target.value)}
                    placeholder={t("teamSync.decryptPlaceholder")}
                    className="w-full px-3 py-1.5 rounded bg-base border border-default text-xs text-primary focus:outline-none focus:border-primary"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-primary block">
                    {t("teamSync.conflictLabel")}
                  </label>
                  <select
                    value={conflictMode}
                    onChange={(e) => setConflictMode(e.target.value as "merge_new" | "overwrite")}
                    className="w-full px-3 py-1.5 rounded bg-base border border-default text-xs text-primary focus:outline-none focus:border-primary"
                  >
                    <option value="merge_new">{t("teamSync.conflictMerge")}</option>
                    <option value="overwrite">{t("teamSync.conflictOverwrite")}</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleAnalyzeImport}
                  disabled={isImporting}
                  className="px-4 py-2 rounded-lg bg-surface-secondary hover:bg-surface border border-default text-xs font-medium text-primary transition-colors"
                >
                  {isImporting ? t("teamSync.analyzing") : t("teamSync.checkBundle")}
                </button>
              </div>

              {/* Import Results Summary */}
              {importResult && importResult.valid && (
                <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                    <Check className="w-4 h-4" />
                    {t("teamSync.bundleValid")}
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs text-muted">
                    <div>
                      <span className="block font-medium text-primary">
                        + {t("teamSync.newConnections", { count: importResult.stats.addedConnections })}
                      </span>
                      {importResult.stats.skippedConnections > 0 && (
                        <span>({t("teamSync.skippedDuplicates", { count: importResult.stats.skippedConnections })})</span>
                      )}
                    </div>

                    <div>
                      <span className="block font-medium text-primary">
                        + {t("teamSync.newQueries", { count: importResult.stats.addedQueries })}
                      </span>
                      {importResult.stats.skippedQueries > 0 && (
                        <span>({t("teamSync.skippedDuplicates", { count: importResult.stats.skippedQueries })})</span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={handleApplyImport}
                    disabled={isImporting}
                    className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition-colors shadow-sm"
                  >
                    {t("teamSync.applyNow")}
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === "git" && (
            <GitSyncPanel
              connections={savedConnections}
              queries={savedQueries}
              onBundleLoaded={(json) => {
                setImportJson(json);
                setImportResult(null);
                setActiveTab("import");
              }}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-3 border-t border-default bg-base/50">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-surface-secondary hover:bg-surface border border-default text-xs font-medium text-primary transition-colors"
          >
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
};

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { emit, listen } from "@tauri-apps/api/event";
import { Play, Minimize2 } from "lucide-react";
import { MultiResultPanel } from "../components/ui/MultiResultPanel";
import { ResultEntryContent } from "../components/ui/ResultEntryContent";
import {
  RESULTS_SYNC_EVENT,
  RESULTS_ACTION_EVENT,
  RESULTS_READY_EVENT,
  hasMultiResults,
  singleResultToEntry,
  type ResultsSyncPayload,
  type ResultsWindowAction,
} from "../utils/resultsWindowSync";

/**
 * Detached query-results window, bound to a single editor tab (its id comes from
 * the `?tab=` query param). It renders that tab's results (pushed from the main
 * window via {@link RESULTS_SYNC_EVENT}, filtered by `tabId`) and forwards user
 * actions back, tagged with its `tabId`. The main window owns all query/DB
 * logic; this window holds no query state of its own.
 */
export const ResultsWindowPage = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const tabId = searchParams.get("tab") ?? "";
  const [payload, setPayload] = useState<ResultsSyncPayload | null>(null);

  // Receive result snapshots for this tab from the main window.
  useEffect(() => {
    if (!tabId) return;
    const unlistenPromise = listen<ResultsSyncPayload>(
      RESULTS_SYNC_EVENT,
      (event) => {
        if (event.payload.tabId === tabId) setPayload(event.payload);
      },
    );
    // Ask the main window to send this tab's current state now that we're mounted.
    emit(RESULTS_READY_EVENT, { tabId });
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [tabId]);

  const send = useCallback(
    (action: ResultsWindowAction) => {
      emit(RESULTS_ACTION_EVENT, { tabId, action });
    },
    [tabId],
  );

  if (!payload) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-elevated text-muted text-sm">
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div className="w-screen h-screen flex flex-col bg-elevated text-primary overflow-hidden">
      {/* Top Header Bar */}
      <div className="h-8 min-h-[32px] bg-surface border-b border-default flex items-center justify-between px-3 text-xs select-none">
        <div className="flex items-center gap-2 font-medium truncate text-secondary">
          <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />
          <span className="truncate">{payload.tabTitle || t("common.untitled", "Untitled")}</span>
          {payload.driver && (
            <span className="px-1.5 py-0.5 text-[10px] rounded bg-surface-secondary text-muted uppercase font-mono">
              {payload.driver}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {payload.query && (
            <button
              onClick={() => send({ type: "run-query", query: payload.query })}
              disabled={payload.isLoading}
              className="flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-accent text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
              title={t("editor.runQuery", "Run Query")}
            >
              <Play size={11} fill="currentColor" />
              <span>{t("common.run", "Run")}</span>
            </button>
          )}
          <button
            onClick={() => send({ type: "reattach" })}
            className="flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-surface-secondary hover:bg-surface-tertiary text-secondary hover:text-primary border border-default transition-colors"
            title={t("editor.results.reattach", "Reattach to Main Window")}
          >
            <Minimize2 size={11} />
            <span>{t("editor.results.reattach", "Reattach")}</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
        {hasMultiResults(payload) ? (
          <MultiResultPanel
            results={payload.results!}
            activeResultId={payload.activeResultId}
            tabId={payload.tabId}
            connectionId={payload.connectionId}
            copyFormat={payload.copyFormat}
            csvDelimiter={payload.csvDelimiter}
            csvIncludeHeaders={payload.csvIncludeHeaders}
            onSelectResult={(entryId) => send({ type: "select-result", entryId })}
            onRerunEntry={(entryId) => send({ type: "rerun-entry", entryId })}
            onPageChange={(entryId, page) =>
              send({ type: "page-change", entryId, page })
            }
            onCloseEntry={(entryId) => send({ type: "close-entry", entryId })}
            onCloseOtherEntries={(entryId) =>
              send({ type: "close-other-entries", entryId })
            }
            onCloseEntriesToRight={(entryId) =>
              send({ type: "close-entries-to-right", entryId })
            }
            onCloseEntriesToLeft={(entryId) =>
              send({ type: "close-entries-to-left", entryId })
            }
            onCloseAllEntries={() => send({ type: "close-all-entries" })}
            onRenameEntry={(entryId, label) =>
              send({ type: "rename-entry", entryId, label })
            }
          />
        ) : payload.result || payload.error || payload.isLoading ? (
          <ResultEntryContent
            entry={singleResultToEntry(payload)}
            connectionId={payload.connectionId}
            copyFormat={payload.copyFormat}
            csvDelimiter={payload.csvDelimiter}
            csvIncludeHeaders={payload.csvIncludeHeaders}
            onPageChange={(page) =>
              send({ type: "run-query-page", query: payload.query, page })
            }
          />
        ) : (
          <div className="flex items-center justify-center h-full text-surface-tertiary text-sm">
            {t("editor.executePrompt")}
          </div>
        )}
      </div>
    </div>
  );
};

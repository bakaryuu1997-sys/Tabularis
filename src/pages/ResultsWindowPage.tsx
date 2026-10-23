import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { emit, listen } from "@tauri-apps/api/event";
import {
  Play,
  Minimize2,
  Zap,
  Terminal,
  Table as TableIcon,
  Columns2,
  Loader2,
  Clock,
  Rows3,
} from "lucide-react";
import { MultiResultPanel } from "../components/ui/MultiResultPanel";
import { ResultEntryContent } from "../components/ui/ResultEntryContent";
import { SqlEditorWrapper } from "../components/ui/SqlEditorWrapper";
import { SqlTemplatesModal } from "../components/modals/SqlTemplatesModal";
import { splitStatements, findStatementAtOffset } from "../utils/sqlSplitter";
import { useSqlAutocompleteRegistration } from "../hooks/useSqlAutocompleteRegistration";
import { validateSqlSchema } from "../utils/autocomplete";
import {
  RESULTS_SYNC_EVENT,
  RESULTS_ACTION_EVENT,
  RESULTS_READY_EVENT,
  hasMultiResults,
  singleResultToEntry,
  type ResultsSyncPayload,
  type ResultsWindowAction,
} from "../utils/resultsWindowSync";
import type { SqlDialect } from "../utils/sql";

export type DetachedViewMode = "both" | "editor" | "results";

/**
 * Detached SQL Console & Results window, bound to an editor tab.
 * Allows writing SQL in Monaco Editor (with syntax highlighting, autocomplete,
 * Ctrl+Enter execution, and Ctrl+J templates) while simultaneously viewing
 * live DataGrid query results below it in real-time.
 */
export const ResultsWindowPage = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const tabId = searchParams.get("tab") ?? "";
  const [payload, setPayload] = useState<ResultsSyncPayload | null>(null);

  // Local query state to enable active typing in the detached console
  const [query, setQuery] = useState("");
  const queryRef = useRef("");
  queryRef.current = query;
  const isQueryInitializedRef = useRef(false);

  // View mode: both (console + results), editor only, or results only
  const [viewMode, setViewMode] = useState<DetachedViewMode>("both");

  // Vertical split height percentage for editor when viewMode is "both"
  const [editorHeightPercent, setEditorHeightPercent] = useState<number>(40);
  const isDraggingRef = useRef(false);

  // SQL Templates Modal (Ctrl+J)
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);

  // Editor and Monaco references
  const editorRef = useRef<any>(null);
  const [monacoInstance, setMonacoInstance] = useState<any>(null);

  // Driver dialect
  const driverDialect = (payload?.driver as SqlDialect) || "postgres";

  // Debounced query sync to main window
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Register SQL autocomplete and hover for detached window
  useSqlAutocompleteRegistration(payload?.connectionId ?? null, {
    monaco: monacoInstance,
    schema: payload?.schema,
    tables: payload?.tables,
    enabled: true,
  });

  // Validate schema on query changes in detached window
  useEffect(() => {
    if (!monacoInstance || !editorRef.current || !payload?.tables) return;
    const model = editorRef.current.getModel();
    if (!model) return;

    const timer = setTimeout(() => {
      validateSqlSchema(monacoInstance, model, payload.tables || [], {
        connectionId: payload?.connectionId,
        schema: payload?.schema,
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [monacoInstance, query, payload?.tables, payload?.connectionId, payload?.schema]);

  // Forward actions back to main window
  const send = useCallback(
    (action: ResultsWindowAction) => {
      emit(RESULTS_ACTION_EVENT, { tabId, action });
    },
    [tabId],
  );

  // Receive result snapshots for this tab from the main window.
  useEffect(() => {
    if (!tabId) return;
    const unlistenPromise = listen<ResultsSyncPayload>(
      RESULTS_SYNC_EVENT,
      (event) => {
        if (event.payload.tabId === tabId) {
          setPayload(event.payload);
          // Only initialize local query once, or if it changed externally from main window
          if (!isQueryInitializedRef.current) {
            setQuery(event.payload.query || "");
            isQueryInitializedRef.current = true;
          }
        }
      },
    );
    // Ask the main window to send this tab's current state now that we're mounted.
    emit(RESULTS_READY_EVENT, { tabId });
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [tabId]);

  const handleQueryChange = useCallback(
    (newQuery: string) => {
      setQuery(newQuery);
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      syncTimeoutRef.current = setTimeout(() => {
        send({ type: "update-query", query: newQuery });
      }, 300);
    },
    [send],
  );

  const handleRunQuery = useCallback(() => {
    const editor = editorRef.current;
    if (editor) {
      const model = editor.getModel();
      const selection = editor.getSelection();
      const selectedText = selection && !selection.isEmpty() && model
        ? model.getValueInRange(selection)?.trim()
        : "";

      // 1. If text is highlighted / selected (bôi đen), run ONLY the highlighted text!
      if (selectedText) {
        send({ type: "run-query", query: selectedText });
        return;
      }

      // 2. No text highlighted: check cursor position and split statements
      const fullText = editor.getValue()?.trim();
      if (!fullText) return;

      const statements = splitStatements(fullText, driverDialect);
      if (statements.length <= 1) {
        send({ type: "run-query", query: statements[0]?.text || fullText });
        return;
      }

      const position = editor.getPosition();
      if (position && model) {
        const offset = model.getOffsetAt(position);
        const stmtAtCursor = findStatementAtOffset(statements, offset);
        if (stmtAtCursor && stmtAtCursor.text.trim()) {
          send({ type: "run-query", query: stmtAtCursor.text.trim() });
          return;
        }
      }

      send({ type: "run-query", query: statements[0]?.text || fullText });
      return;
    }

    // Fallback when editor ref is not yet available
    const q = queryRef.current.trim();
    if (!q) return;
    send({ type: "run-query", query: q });
  }, [send, driverDialect]);

  // Global keyboard shortcuts: Ctrl+Enter to run, Ctrl+J for SQL templates
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleRunQuery();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "j" || e.key === "J")) {
        e.preventDefault();
        setIsTemplatesOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleRunQuery]);

  // Resize divider drag handler
  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const windowHeight = window.innerHeight;
      const headerHeight = 36;
      const availableHeight = windowHeight - headerHeight;
      const newHeight = moveEvent.clientY - headerHeight;
      const percent = Math.min(Math.max((newHeight / availableHeight) * 100, 15), 85);
      setEditorHeightPercent(percent);
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }, []);

  const handleInsertTemplate = useCallback(
    (templateSql: string) => {
      setQuery((prev) => {
        const next = prev.trim() ? `${prev.trim()}\n\n${templateSql}` : templateSql;
        send({ type: "update-query", query: next });
        return next;
      });
      setIsTemplatesOpen(false);
    },
    [send],
  );

  if (!payload) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-elevated text-muted text-sm gap-2">
        <Loader2 className="animate-spin text-accent" size={24} />
        <span>{t("common.loading", "Đang tải dữ liệu cửa sổ riêng...")}</span>
      </div>
    );
  }

  const rowCount =
    payload.result?.rows?.length ??
    (payload.results && payload.results.length > 0
      ? payload.results[0].result?.rows?.length
      : null);

  return (
    <div className="w-screen h-screen flex flex-col bg-elevated text-primary overflow-hidden select-text">
      {/* Top Header Bar */}
      <div className="h-9 min-h-[36px] bg-surface border-b border-default flex items-center justify-between px-3 text-xs select-none shadow-sm">
        {/* Left: Tab Title & Status */}
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full bg-accent flex-shrink-0 animate-pulse" />
          <span className="font-semibold truncate text-primary">
            {payload.tabTitle || t("common.untitled", "SQL Console")}
          </span>
          {payload.driver && (
            <span className="px-2 py-0.5 text-[10px] rounded-full bg-surface-secondary text-accent border border-accent/20 uppercase font-mono font-bold tracking-wider">
              {payload.driver}
            </span>
          )}
          {payload.isLoading ? (
            <span className="flex items-center gap-1 text-[11px] text-amber-400 font-medium bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
              <Loader2 size={11} className="animate-spin" />
              <span>{t("common.running", "Đang chạy...")}</span>
            </span>
          ) : (
            <>
              {payload.executionTime !== null && payload.executionTime !== undefined && (
                <span className="hidden sm:flex items-center gap-1 text-[10px] text-muted font-mono">
                  <Clock size={11} />
                  <span>{payload.executionTime.toFixed(1)}ms</span>
                </span>
              )}
              {rowCount !== null && rowCount !== undefined && (
                <span className="hidden sm:flex items-center gap-1 text-[10px] text-muted font-mono">
                  <Rows3 size={11} />
                  <span>{rowCount} dòng</span>
                </span>
              )}
            </>
          )}
        </div>

        {/* Right: Actions & View Modes */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Run Query Button */}
          <button
            onClick={handleRunQuery}
            disabled={payload.isLoading || !query.trim()}
            className="flex items-center gap-1.5 px-3 py-1 text-xs rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-sm transition-all disabled:opacity-50 disabled:pointer-events-none"
            title="Chạy truy vấn (Ctrl + Enter)"
          >
            {payload.isLoading ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Play size={12} fill="currentColor" />
            )}
            <span>{t("common.run", "Chạy (Ctrl+Enter)")}</span>
          </button>

          {/* SQL Templates (Ctrl+J) Button */}
          <button
            onClick={() => setIsTemplatesOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-surface-secondary hover:bg-surface-tertiary text-secondary hover:text-primary border border-default transition-colors"
            title="Mẫu SQL & Snippets dựng sẵn (Ctrl + J)"
          >
            <Zap size={12} className="text-amber-400" />
            <span className="hidden md:inline">Mẫu SQL</span>
          </button>

          {/* View Mode Switcher */}
          <div className="flex items-center bg-surface-secondary border border-default rounded p-0.5 text-xs">
            <button
              onClick={() => setViewMode("both")}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors ${
                viewMode === "both"
                  ? "bg-accent text-white font-medium"
                  : "text-secondary hover:text-primary"
              }`}
              title="Hiện cả Console & Kết quả"
            >
              <Columns2 size={12} />
              <span className="hidden lg:inline">Cả hai</span>
            </button>
            <button
              onClick={() => setViewMode("editor")}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors ${
                viewMode === "editor"
                  ? "bg-accent text-white font-medium"
                  : "text-secondary hover:text-primary"
              }`}
              title="Chỉ hiện Console SQL"
            >
              <Terminal size={12} />
              <span className="hidden lg:inline">Console</span>
            </button>
            <button
              onClick={() => setViewMode("results")}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors ${
                viewMode === "results"
                  ? "bg-accent text-white font-medium"
                  : "text-secondary hover:text-primary"
              }`}
              title="Chỉ hiện Bảng Kết quả"
            >
              <TableIcon size={12} />
              <span className="hidden lg:inline">Kết quả</span>
            </button>
          </div>

          {/* Reattach to Main Window */}
          <button
            onClick={() => send({ type: "reattach" })}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-surface-secondary hover:bg-surface-tertiary text-secondary hover:text-primary border border-default transition-colors ml-1"
            title="Gắn lại vào cửa sổ chính (Reattach)"
          >
            <Minimize2 size={12} />
            <span className="hidden sm:inline">Gắn lại</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden min-h-0 flex flex-col relative">
        {/* SQL Console Editor (Shown in 'both' or 'editor' mode) */}
        {(viewMode === "both" || viewMode === "editor") && (
          <div
            style={{
              height: viewMode === "both" ? `${editorHeightPercent}%` : "100%",
            }}
            className="w-full flex flex-col bg-base overflow-hidden relative border-b border-default"
          >
            <SqlEditorWrapper
              initialValue={query}
              onChange={handleQueryChange}
              onRun={handleRunQuery}
              connectionId={payload?.connectionId}
              tables={payload?.tables || []}
              schema={payload?.schema}
              onMount={(editor, monaco) => {
                editorRef.current = editor;
                setMonacoInstance(monaco);
              }}
              dialect={driverDialect}
              height="100%"
              editorKey={`detached-${tabId}`}
              options={{
                lineNumbers: "on",
                minimap: { enabled: false },
                fontSize: 13,
                wordWrap: "on",
                automaticLayout: true,
                padding: { top: 10, bottom: 10 },
              }}
            />
          </div>
        )}

        {/* Draggable Divider (Only in 'both' mode) */}
        {viewMode === "both" && (
          <div
            onMouseDown={handleDividerMouseDown}
            className="h-1.5 w-full bg-surface-secondary hover:bg-accent/40 active:bg-accent cursor-row-resize flex items-center justify-center transition-colors group z-20"
            title="Kéo thả để điều chỉnh tỷ lệ Console và Kết quả"
          >
            <div className="w-12 h-0.5 bg-muted/40 group-hover:bg-accent rounded-full transition-colors" />
          </div>
        )}

        {/* Results Panel Area (Shown in 'both' or 'results' mode) */}
        {(viewMode === "both" || viewMode === "results") && (
          <div
            style={{
              height:
                viewMode === "both"
                  ? `${100 - editorHeightPercent}%`
                  : "100%",
            }}
            className="w-full overflow-hidden min-h-0 flex flex-col bg-elevated"
          >
            {hasMultiResults(payload) ? (
              <MultiResultPanel
                results={payload.results!}
                activeResultId={payload.activeResultId}
                tabId={payload.tabId}
                connectionId={payload.connectionId}
                copyFormat={payload.copyFormat}
                csvDelimiter={payload.csvDelimiter}
                csvIncludeHeaders={payload.csvIncludeHeaders}
                onSelectResult={(entryId) =>
                  send({ type: "select-result", entryId })
                }
                onRerunEntry={(entryId) =>
                  send({ type: "rerun-entry", entryId })
                }
                onPageChange={(entryId, page) =>
                  send({ type: "page-change", entryId, page })
                }
                onCloseEntry={(entryId) =>
                  send({ type: "close-entry", entryId })
                }
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
                  send({
                    type: "run-query-page",
                    query: queryRef.current,
                    page,
                  })
                }
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-surface-tertiary text-sm gap-2">
                <Terminal size={32} className="opacity-30 mb-1" />
                <p>{t("editor.executePrompt", "Nhập câu truy vấn SQL ở trên và nhấn Chạy (Ctrl+Enter) để xem kết quả")}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* SQL Templates Modal */}
      {isTemplatesOpen && (
        <SqlTemplatesModal
          isOpen={isTemplatesOpen}
          onClose={() => setIsTemplatesOpen(false)}
          onInsert={handleInsertTemplate}
          activeTable={payload.activeTable}
        />
      )}
    </div>
  );
};

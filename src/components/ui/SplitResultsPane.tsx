import { useState, type ComponentProps, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  Table2,
  Terminal,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Save,
  Columns2,
  Rows2,
  RotateCcw,
} from "lucide-react";
import type { Tab } from "../../types/editor";
import type { QueryResultEntry } from "../../types/editor";
import { ResultEntryContent } from "./ResultEntryContent";
import { DataGrid } from "./DataGrid";
import {
  buildSyncPayload,
  hasMultiResults,
  singleResultToEntry,
  type CopyFormat,
} from "../../utils/resultsWindowSync";
import type { SplitOrientation } from "../../utils/splitView";
import {
  TAB_DRAG_MIME,
  dropPositionFromPointer,
  resolveTabDrop,
  tabDrag,
  type DropPosition,
  type TabDropAction,
} from "../../utils/tabDnd";

/** DataGrid props (minus the data itself) prepared by the parent with the split
 * tab's metadata and edit handlers already bound to the split tab's id. */
export type SplitEditGridProps = Omit<
  ComponentProps<typeof DataGrid>,
  "columns" | "data"
>;

interface SplitResultsPaneProps {
  tab: Tab;
  /** All tabs pinned into the split pane (for the switcher strip). */
  pinnedTabs?: Tab[];
  /** Id of the pinned tab currently shown. */
  activeSplitTabId?: string;
  /** Switch which pinned tab is shown. */
  onSelectPinned?: (id: string) => void;
  /** Unpin a specific tab from the strip. */
  onUnpin?: (id: string) => void;
  /**
   * A tab was dropped on this pane: on a pinned-tab chip (reorder, or pin next to it) or anywhere on the
   * pane (pin at the end). Called with an already resolved action.
   */
  onDropTab?: (action: TabDropAction) => void;
  connectionId: string | null;
  copyFormat: CopyFormat;
  csvDelimiter: string;
  csvIncludeHeaders: boolean;
  /** Re-run the pinned tab at the given page (routes through the main query path). */
  onPageChange: (page: number) => void;
  /** Unpin / close the split pane. */
  onClose: () => void;
  /** Make the pinned tab the active (main) tab. */
  onFocusTab: () => void;
  /** Swap the pinned (right) tab with the active (left) tab. */
  onSwap: () => void;
  /** When provided, the pane renders an editable grid (single-result tabs only). */
  editGridProps?: SplitEditGridProps;
  /** Commit the split tab's pending changes directly (without swapping). */
  onSave?: () => void;
  /** Current split orientation. */
  orientation?: SplitOrientation;
  /** Toggle between side-by-side and stacked layout. */
  onToggleOrientation?: () => void;
  /** Render SQL editor when pinned tab is a console tab. */
  renderEditor?: (tab: Tab) => ReactNode;
}

function countPending(tab: Tab): number {
  return (
    Object.keys(tab.pendingChanges || {}).length +
    Object.keys(tab.pendingDeletions || {}).length +
    Object.keys(tab.pendingInsertions || {}).length
  );
}

/**
 * A read-only "reference" pane docked to the right of the workspace that mirrors
 * another tab's result grid, so a table can stay visible while the main pane is
 * used to write SQL. It reuses the same renderer as the detached results window
 * ({@link ResultEntryContent}) but is fed directly from tab state instead of
 * cross-window events.
 */
export function SplitResultsPane({
  tab,
  pinnedTabs,
  activeSplitTabId,
  onSelectPinned,
  onUnpin,
  onDropTab,
  connectionId,
  copyFormat,
  csvDelimiter,
  csvIncludeHeaders,
  onPageChange,
  onClose,
  onFocusTab,
  onSwap,
  editGridProps,
  onSave,
  orientation = "horizontal",
  onToggleOrientation,
  renderEditor,
}: SplitResultsPaneProps) {
  const { t } = useTranslation();
  const [consoleViewMode, setConsoleViewMode] = useState<"sql" | "results">("sql");
  // Where a dragged tab would land on the chip strip, and whether the pane itself is a drop target.
  const [chipDropMark, setChipDropMark] = useState<{ id: string; position: DropPosition } | null>(null);
  const [paneDragOver, setPaneDragOver] = useState(false);
  const acceptsTabDrop = !!onDropTab;

  const payload = buildSyncPayload(tab, {
    connectionId,
    copyFormat,
    csvDelimiter,
    csvIncludeHeaders,
  });

  let entry: QueryResultEntry | null = null;
  if (hasMultiResults(payload)) {
    entry =
      payload.results!.find((r) => r.id === payload.activeResultId) ??
      payload.results![0];
  } else if (payload.result || payload.error || payload.isLoading) {
    entry = singleResultToEntry(payload);
  }

  // Editable mode: single-result table tab with a result and bound edit props.
  const editable =
    !!editGridProps &&
    !hasMultiResults(payload) &&
    !!tab.result &&
    tab.result.columns.length > 0;
  const pagination = tab.result?.pagination;
  const pendingCount = countPending(tab);

  return (
    <div
      className={`flex flex-col h-full w-full flex-1 min-w-0 bg-base ${
        orientation === "vertical" ? "border-t border-default" : "border-l border-default"
      } ${paneDragOver ? "ring-2 ring-inset ring-blue-500/60" : ""}`}
      onDragOver={
        acceptsTabDrop
          ? (e) => {
              if (!tabDrag.payload) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setPaneDragOver(true);
            }
          : undefined
      }
      onDragLeave={
        acceptsTabDrop
          ? (e) => {
              // Ignore leave events fired when moving between children of the pane.
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaneDragOver(false);
            }
          : undefined
      }
      onDrop={
        acceptsTabDrop
          ? (e) => {
              e.preventDefault();
              setPaneDragOver(false);
              setChipDropMark(null);
              const action = resolveTabDrop(tabDrag.payload, "right", null, "after");
              if (action.kind !== "none") onDropTab?.(action);
              tabDrag.clear();
            }
          : undefined
      }
    >
      {/* Header */}
      <div className="h-9 shrink-0 flex items-center gap-2 px-2 bg-elevated border-b border-default">
        {tab.type === "console" ? (
          <Terminal size={13} className="text-muted shrink-0" />
        ) : (
          <Table2 size={13} className="text-muted shrink-0" />
        )}
        <button
          onClick={onFocusTab}
          title={t("editor.split.focusTab")}
          className="text-xs text-secondary font-medium truncate hover:text-primary transition-colors min-w-0"
        >
          {tab.title}
        </button>
        <div className="flex-1" />
        {tab.type === "console" && renderEditor && (
          <div className="flex items-center rounded bg-surface-secondary p-0.5 text-[10px] font-medium mr-1 shrink-0">
            <button
              onClick={() => setConsoleViewMode("sql")}
              className={`px-1.5 py-0.5 rounded transition-colors ${
                consoleViewMode === "sql"
                  ? "bg-elevated text-primary shadow-xs font-semibold"
                  : "text-muted hover:text-secondary"
              }`}
            >
              SQL
            </button>
            <button
              onClick={() => setConsoleViewMode("results")}
              className={`px-1.5 py-0.5 rounded transition-colors ${
                consoleViewMode === "results"
                  ? "bg-elevated text-primary shadow-xs font-semibold"
                  : "text-muted hover:text-secondary"
              }`}
            >
              {t("editor.resultsTitle")}
            </button>
          </div>
        )}
        {pendingCount > 0 && (
          <button
            onClick={onSave ?? onSwap}
            title={onSave ? t("editor.split.save") : t("editor.split.saveHint")}
            className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition-colors shrink-0"
          >
            {onSave && <Save size={11} />}
            {t("editor.split.unsaved", { count: pendingCount })}
          </button>
        )}
        {onToggleOrientation && (
          <button
            onClick={onToggleOrientation}
            title={
              orientation === "vertical"
                ? t("editor.split.switchToHorizontal", "Switch to horizontal split (side-by-side)")
                : t("editor.split.switchToVertical", "Switch to vertical split (stacked)")
            }
            className="text-muted hover:text-secondary transition-colors p-1 hover:bg-surface-secondary rounded shrink-0"
          >
            {orientation === "vertical" ? <Columns2 size={14} /> : <Rows2 size={14} />}
          </button>
        )}
        <button
          onClick={onSwap}
          title={t("editor.split.swap")}
          className="text-muted hover:text-secondary transition-colors p-1 hover:bg-surface-secondary rounded shrink-0"
        >
          <ArrowLeftRight size={14} />
        </button>
        <button
          onClick={onClose}
          title={t("editor.split.close")}
          className="text-muted hover:text-secondary transition-colors p-1 hover:bg-surface-secondary rounded shrink-0"
        >
          <X size={14} />
        </button>
      </div>

      {/* Pinned-tab switcher strip (only when more than one tab is pinned) */}
      {pinnedTabs && pinnedTabs.length > 1 && (
        <div className="shrink-0 flex items-stretch gap-0.5 px-1 py-1 bg-base border-b border-default overflow-x-auto no-scrollbar">
          {pinnedTabs.map((p) => {
            const isActive = p.id === (activeSplitTabId ?? tab.id);
            return (
              <div
                key={p.id}
                draggable={acceptsTabDrop}
                onDragStart={(e) => {
                  tabDrag.start({ tabId: p.id, origin: "right" });
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData(TAB_DRAG_MIME, p.id);
                }}
                onDragEnd={() => {
                  tabDrag.clear();
                  setChipDropMark(null);
                  setPaneDragOver(false);
                }}
                onDragOver={(e) => {
                  if (!acceptsTabDrop || !tabDrag.payload) return;
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = "move";
                  setChipDropMark({
                    id: p.id,
                    position: dropPositionFromPointer(e.clientX, e.currentTarget.getBoundingClientRect()),
                  });
                }}
                onDragLeave={() => setChipDropMark((m) => (m?.id === p.id ? null : m))}
                onDrop={(e) => {
                  if (!acceptsTabDrop) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const position = dropPositionFromPointer(e.clientX, e.currentTarget.getBoundingClientRect());
                  setChipDropMark(null);
                  setPaneDragOver(false);
                  const action = resolveTabDrop(tabDrag.payload, "right", p.id, position);
                  if (action.kind !== "none") onDropTab?.(action);
                  tabDrag.clear();
                }}
                className={`group/chip relative flex items-center gap-1 pl-2 pr-1 py-0.5 rounded text-xs cursor-pointer whitespace-nowrap transition-colors ${
                  isActive
                    ? "bg-blue-600/20 text-blue-200 border border-blue-500/40"
                    : "text-muted hover:text-secondary hover:bg-surface-secondary border border-transparent"
                }`}
                onClick={() => onSelectPinned?.(p.id)}
              >
                {chipDropMark?.id === p.id && (
                  <span
                    className={`absolute top-0 bottom-0 w-0.5 bg-blue-400 rounded ${
                      chipDropMark.position === "before" ? "-left-0.5" : "-right-0.5"
                    }`}
                  />
                )}
                <span className="truncate max-w-[120px]">{p.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUnpin?.(p.id);
                  }}
                  title={t("editor.split.close")}
                  className="opacity-0 group-hover/chip:opacity-100 hover:text-secondary transition-opacity"
                >
                  <X size={11} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {tab.type === "console" && renderEditor && consoleViewMode === "sql" ? (
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {renderEditor(tab)}
          </div>
        ) : editable ? (
          <>
            <div className="flex-1 min-h-0 w-full overflow-hidden flex flex-col">
              <DataGrid
                columns={tab.result!.columns}
                data={tab.result!.rows}
                {...editGridProps!}
              />
            </div>
            {pagination && (
              <div className="h-7 shrink-0 flex items-center justify-end gap-1 px-2 bg-elevated border-t border-default text-xs text-muted w-full">
                <span className="mr-auto">
                  {t("editor.rowsRetrieved", { count: tab.result!.rows.length })}
                  {tab.result!.columns.length > 0 && (
                    <span>
                      {" · "}
                      {t("editor.columnsCount", {
                        count: tab.result!.columns.length,
                      })}
                    </span>
                  )}
                </span>
                <button
                  disabled={pagination.page <= 1 || tab.isLoading}
                  onClick={() => onPageChange(pagination.page - 1)}
                  className="p-0.5 rounded hover:bg-surface-secondary disabled:opacity-30 disabled:cursor-not-allowed"
                  title={t("editor.previousPage", { defaultValue: "Previous" })}
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="font-mono px-1">{pagination.page}</span>
                <button
                  disabled={!pagination.has_more || tab.isLoading}
                  onClick={() => onPageChange(pagination.page + 1)}
                  className="p-0.5 rounded hover:bg-surface-secondary disabled:opacity-30 disabled:cursor-not-allowed"
                  title={t("editor.nextPage", { defaultValue: "Next" })}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </>
        ) : entry ? (
          <div className="flex-1 min-h-0 w-full overflow-hidden flex flex-col">
            <ResultEntryContent
              entry={entry}
              connectionId={connectionId}
              copyFormat={copyFormat}
              csvDelimiter={csvDelimiter}
              csvIncludeHeaders={csvIncludeHeaders}
              onPageChange={onPageChange}
            />
          </div>
        ) : tab.type === "table" ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-surface-tertiary px-4 text-center">
            <div className="p-2.5 bg-surface-secondary/50 rounded-xl border border-default/50">
              <Table2 size={24} className="text-blue-400/80" />
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-primary font-medium">
                {tab.activeTable ? (
                  <>{t("editor.split.tableLabel")} <span className="font-mono text-blue-400 font-semibold">{tab.activeTable}</span></>
                ) : (
                  t("editor.split.empty")
                )}
              </p>
              <p className="text-[11px] text-muted max-w-[240px]">
                {t("editor.tableLoadHint")}
              </p>
            </div>
            <button
              onClick={() => onPageChange(1)}
              disabled={tab.isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium shadow-sm transition-all disabled:opacity-50"
            >
              <RotateCcw size={12} className={tab.isLoading ? "animate-spin" : ""} />
              <span>{t("editor.loadTableData")}</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-surface-tertiary text-sm px-4 text-center">
            {t("editor.split.empty")}
          </div>
        )}
      </div>
    </div>
  );
}

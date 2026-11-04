import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { reconstructTableQuery } from "../utils/editor";
import { onRunSql } from "../utils/aiRunBus";
import { serializePkKey, buildPkMap } from "../utils/dataGrid";
import { isMultiDatabaseCapable } from "../utils/database";
import { isReadonly } from "../utils/driverCapabilities";
import {
  generateTempId,
  initializeNewRow,
  validatePendingInsertion,
  insertionToBackendData,
} from "../utils/pendingInsertions";
import { AiQueryModal } from "../components/modals/AiQueryModal";
import { AiExplainModal } from "../components/modals/AiExplainModal";
import { AiDropdownButton } from "../components/ui/AiDropdownButton";
import { VisualExplainModal } from "../components/modals/VisualExplainModal";
import {
  Play,
  Plus,
  Minus,
  Download,
  Square,
  ChevronDown,
  ChevronUp,
  Save,
  X,
  Database,
  Table as TableIcon,
  FileCode,
  Network,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowLeftToLine,
  ArrowRightToLine,
  XCircle,
  Trash2,
  Check,
  Undo2,
  BookOpen,
  Pencil,
  Hash,
  Loader2,
  Copy,
  FileText,
  FileSpreadsheet,
  FileJson,
  Zap,
  Maximize2,
  Minimize2,
  ExternalLink,
  History,
  RotateCcw,
  PanelRight,
  CheckCircle2,
  Columns2,
  Rows2,
  Wand2,
  Eye,
  EyeOff,
  Radio,
} from "lucide-react";
import { exportQueryResultToExcel } from "../utils/excelExport";
import { invoke } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
import { TableToolbar } from "../components/ui/TableToolbar";
import { buildHighlightStorageKey } from "../utils/highlightRules";
import { DataGrid } from "../components/ui/DataGrid";
import { MultiResultPanel } from "../components/ui/MultiResultPanel";
import { SplitResultsPane } from "../components/ui/SplitResultsPane";
import {
  resolveSplitTab,
  resolvePinnedTabs,
  resolveLeftTabs,
  togglePinnedTab,
  splitRatioFromClientX,
  splitRatioFromClientY,
  toggleSplitOrientation,
  loadSplitState,
  saveSplitState,
  type SplitOrientation,
} from "../utils/splitView";
import { ErrorDisplay } from "../components/ui/ErrorDisplay";
import { NewRowModal } from "../components/modals/NewRowModal";
import { ProductionSafetyModal } from "../components/modals/ProductionSafetyModal";
import { MockDataModal } from "../components/modals/MockDataModal";
import { SchemaDiffModal } from "../components/modals/SchemaDiffModal";
import { VisualExplainDiffModal } from "../components/modals/VisualExplainDiffModal";
import { TeamWorkspaceSyncModal } from "../components/modals/TeamWorkspaceSyncModal";
import { detectRowDeltas } from "../utils/liveTableTail";
import type { ExplainPlan } from "../types/explain";
import { SqlTemplatesModal } from "../components/modals/SqlTemplatesModal";
import { QueryHistoryModal } from "../components/modals/QueryHistoryModal";
import { useDangerousQueryGuard } from "../hooks/useDangerousQueryGuard";
import { QuerySelectionModal } from "../components/modals/QuerySelectionModal";
import { ExplainSelectionModal } from "../components/modals/ExplainSelectionModal";
import { TabSwitcherModal } from "../components/modals/TabSwitcherModal";
import { QueryModal } from "../components/modals/QueryModal";
import { QueryParamsModal } from "../components/modals/QueryParamsModal";
import { ErrorModal } from "../components/modals/ErrorModal";
import { VisualQueryBuilder } from "../components/ui/VisualQueryBuilder";
import { ContextMenu } from "../components/ui/ContextMenu";
import {
  ExportProgressModal,
  type ExportStatus,
} from "../components/modals/ExportProgressModal";
import { splitQueries, extractTableName, getExplainableQueries, statementLabel } from "../utils/sql";
import { splitStatements, findStatementAtOffset } from "../utils/sqlSplitter";
import { validateSqlSchema } from "../utils/autocomplete";
import {
  createResultEntries,
  updateResultEntry,
  removeResultEntry,
  removeOtherEntries,
  removeEntriesToRight,
  removeEntriesToLeft,
} from "../utils/multiResult";
import {
  extractQueryParams,
  interpolateQueryParams,
} from "../utils/queryParameters";
import { formatDuration } from "../utils/formatTime";
import {
  buildSyncPayload,
  applyAction,
  RESULTS_SYNC_EVENT,
  RESULTS_ACTION_EVENT,
  RESULTS_READY_EVENT,
  RESULTS_CLOSED_EVENT,
  type ResultsWindowActionHandlers,
  type ResultsReadyPayload,
  type ResultsActionEnvelope,
  type ResultsClosedPayload,
} from "../utils/resultsWindowSync";
import { SqlEditorWrapper } from "../components/ui/SqlEditorWrapper";
import { canRenameTab } from "../utils/tabRename";
import { NotebookView } from "../components/notebook/NotebookView";
import { useSqlAutocompleteRegistration } from "../hooks/useSqlAutocompleteRegistration";
import { createNotebook, renameNotebook } from "../utils/notebookStore";
import { type OnMount, type Monaco } from "@monaco-editor/react";
import { save, ask } from "@tauri-apps/plugin-dialog";
import { resolveSafeModeLevel, evaluateSafeMode } from "../utils/sqlSafety";
import { useAlert } from "../hooks/useAlert";
import { useDatabase } from "../hooks/useDatabase";
import { useDrivers } from "../hooks/useDrivers";
import { getConnectionAccent } from "../utils/driverUI";
import { useSavedQueries } from "../hooks/useSavedQueries";
import { useQueryHistory } from "../hooks/useQueryHistory";
import { useSettings } from "../hooks/useSettings";
import { useEditor } from "../hooks/useEditor";
import { useConnectionLayoutContext } from "../hooks/useConnectionLayoutContext";
import { useKeybindings } from "../hooks/useKeybindings";
import type {
  BatchStatementResult,
  QueryResult,
  Tab,
  PendingInsertion,
  TableColumn,
  ForeignKey,
} from "../types/editor";
import { buildForeignKeyFilterClause } from "../utils/foreignKeys";
import {
  buildCellValueFilterClause,
  combineFilterClauses,
  type CellValueFilterOperator,
} from "../utils/cellValueFilter";
import { formatSqlIdentifier } from "../utils/identifiers";
import { RelatedRecordsPanel } from "../components/ui/RelatedRecordsPanel";
import {
  getTabScrollState,
  getAdjacentTabIndex,
  resolveNextTabId,
  isFocusedPane,
} from "../utils/tabScroll";
import clsx from "clsx";

interface EditorState {
  initialQuery?: string;
  tableName?: string;
  queryName?: string;
  preventAutoRun?: boolean;
  readOnly?: boolean;
  materialized?: boolean;
  schema?: string;
  targetConnectionId?: string;
  title?: string;
  splitRight?: boolean;
}

interface ExportProgress {
  rows_processed: number;
}

const CHEVRON_SELECT_STYLE: React.CSSProperties = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right center",
};

export const Editor = () => {
  const { t } = useTranslation();
  const {
    activeConnectionId,
    connections,
    views,
    materializedViews,
    activeDriver,
    activeSchema,
    activeCapabilities,
    selectedDatabases,
    activeConnectionName,
    activeDatabaseName,
    tables,
  } = useDatabase();
  const { allDrivers } = useDrivers();
  const { explorerConnectionId } = useConnectionLayoutContext();
  const { settings } = useSettings();
  const { saveQuery } = useSavedQueries();
  const { addEntry: addHistoryEntry } = useQueryHistory();
  const {
    tabs,
    activeTab,
    activeTabId,
    updateTab,
    updateResultEntry: patchResultEntry,
    addTab,
    setActiveTabId,
    closeTab,
    closeAllTabs,
    closeOtherTabs,
    closeTabsToLeft,
    closeTabsToRight,
    reopenClosedTab,
    canReopenClosedTab,
  } = useEditor();
  const location = useLocation();
  const { matchesShortcut, isMac } = useKeybindings();
  const { showAlert } = useAlert();
  const navigate = useNavigate();

  const driverReadonly = isReadonly(activeCapabilities);
  const activeDialect = activeCapabilities?.sql_dialect;

  const activeConnectionObj = useMemo(() => {
    return connections.find((c) => c.id === activeConnectionId);
  }, [connections, activeConnectionId]);

  const effectiveSafeModeLevel = useMemo(() => {
    return resolveSafeModeLevel(activeConnectionObj?.safe_mode, activeConnectionObj?.appearance?.safeMode);
  }, [activeConnectionObj]);

  const isSafeModeReadonly = effectiveSafeModeLevel === "readonly";

  const [tabContextMenu, setTabContextMenu] = useState<{
    x: number;
    y: number;
    tabId: string;
  } | null>(null);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabTitle, setEditingTabTitle] = useState("");

  const [errorModal, setErrorModal] = useState<{
    isOpen: boolean;
    message: string;
  }>({ isOpen: false, message: "" });

  const [exportState, setExportState] = useState<{
    isOpen: boolean;
    status: ExportStatus;
    rowsProcessed: number;
    fileName: string;
    errorMessage?: string;
  }>({
    isOpen: false,
    status: "exporting",
    rowsProcessed: 0,
    fileName: "",
  });

  const [activeFkQuery, setActiveFkQuery] = useState<{
    fk: ForeignKey;
    value: unknown;
    sourceColumnType?: string;
  } | null>(null);

  useEffect(() => {
    setActiveFkQuery(null);
  }, [activeTabId]);

  useEffect(() => {
    const unlisten = listen<ExportProgress>("export_progress", (event) => {
      setExportState((prev) => ({
        ...prev,
        rowsProcessed: event.payload.rows_processed,
      }));
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const handleTabContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setTabContextMenu({ x: e.clientX, y: e.clientY, tabId });
  };

  const startTabRename = useCallback((tabId: string) => {
    const tab = tabsRef.current.find((t) => t.id === tabId);
    if (!tab) return;
    setEditingTabId(tabId);
    setEditingTabTitle(tab.title);
  }, []);

  const commitTabRename = useCallback(() => {
    const tabId = editingTabId;
    if (!tabId) return;
    setEditingTabId(null);
    const title = editingTabTitle.trim();
    const tab = tabsRef.current.find((t) => t.id === tabId);
    if (!tab || !title || title === tab.title) return;
    updateTab(tabId, { title });
    // Persist the rename to the notebook file too (covers background tabs whose
    // NotebookView isn't mounted to sync the title automatically).
    if (tab.type === "notebook" && tab.notebookId && tab.connectionId) {
      renameNotebook(tab.notebookId, tab.connectionId, title).catch((e) =>
        console.error("Failed to rename notebook:", e),
      );
    }
  }, [editingTabId, editingTabTitle, updateTab]);

  const handleConvertToConsole = useCallback(
    (tabId: string) => {
      const tab = tabsRef.current.find((t) => t.id === tabId);
      if (!tab) return;

      const effectiveSchema =
        activeCapabilities?.schemas === true ? tab.schema : undefined;
      const tabForQuery = { ...tab, schema: effectiveSchema };
      const query =
        tab.type === "table" && tab.activeTable
          ? reconstructTableQuery(tabForQuery, activeDriver ?? undefined)
          : tab.query;

      addTab({
        type: "console",
        title: `Console - ${tab.title}`,
        query: query,
        connectionId: tab.connectionId,
      });
    },
    [addTab, activeDriver, activeCapabilities?.schemas],
  );

  const [saveQueryModal, setSaveQueryModal] = useState<{
    isOpen: boolean;
    sql: string;
  }>({ isOpen: false, sql: "" });

  const [queryParamsModal, setQueryParamsModal] = useState<{
    isOpen: boolean;
    sql: string;
    parameters: string[];
    pendingPageNum: number;
    pendingTabId?: string;
    mode: "run" | "save";
    pendingMultiQueries?: string[];
  }>({
    isOpen: false,
    sql: "",
    parameters: [],
    pendingPageNum: 1,
    mode: "save",
  });

  const [showNewRowModal, setShowNewRowModal] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [editorHeight, setEditorHeight] = useState(300);
  const editorHeightRef = useRef(300);
  const [isResultsCollapsed, setIsResultsCollapsed] = useState(false);

  // Split view: one or more tabs pinned into a resizable right-hand pane (with a
  // tab strip to switch between them) so tables stay visible while the main pane
  // is used to write SQL. splitRatio is the LEFT (main) pane's width fraction.
  // Restored from storage; stale ids are ignored by resolvePinnedTabs.
  const [splitTabIds, setSplitTabIds] = useState<string[]>(
    () => loadSplitState().splitTabIds,
  );
  const [activeSplitTabId, setActiveSplitTabId] = useState<string | null>(
    () => loadSplitState().activeSplitTabId,
  );
  const [splitRatio, setSplitRatio] = useState(
    () => loadSplitState().splitRatio,
  );
  const [splitOrientation, setSplitOrientation] = useState<SplitOrientation>(
    () => loadSplitState().splitOrientation ?? "horizontal",
  );
  const workspaceRef = useRef<HTMLDivElement>(null);

  // The tab pinned into the right-hand split pane (null if none / it was closed).
  const pinnedTabs = resolvePinnedTabs(tabs, splitTabIds);
  const splitTab =
    resolveSplitTab(tabs, activeSplitTabId) ??
    (pinnedTabs.length > 0 ? pinnedTabs[pinnedTabs.length - 1] : null);





  // Tabs displayed on the left pane: all tabs excluding those currently pinned/split to the right pane
  const leftTabs = useMemo(() => {
    return resolveLeftTabs(tabs, splitTabIds);
  }, [tabs, splitTabIds]);

  useEffect(() => {
    saveSplitState({
      splitTabIds,
      activeSplitTabId,
      splitRatio,
      splitOrientation,
    });
  }, [splitTabIds, activeSplitTabId, splitRatio, splitOrientation]);

  // Ensure the left pane does not stay on a tab that has been moved to the right
  useEffect(() => {
    if (activeTabId && splitTabIds.includes(activeTabId)) {
      const remainingLeft = tabs.filter((t) => !splitTabIds.includes(t.id));
      if (remainingLeft.length > 0) {
        setActiveTabId(remainingLeft[0].id);
      }
    }
  }, [activeTabId, splitTabIds, tabs, setActiveTabId]);

  // Pin/unpin a tab into the split pane (toggles), updating the active pin.
  const togglePin = useCallback(
    (tabId: string) => {
      const isCurrentlyPinned = splitTabIds.includes(tabId);
      const res = togglePinnedTab(splitTabIds, activeSplitTabId, tabId);
      setSplitTabIds(res.splitTabIds);
      setActiveSplitTabId(res.activeSplitTabId);

      // If moving a tab to the right pane, ensure the left pane activates another remaining tab
      if (!isCurrentlyPinned) {
        const remainingLeft = tabsRef.current.filter(
          (t) => !res.splitTabIds.includes(t.id),
        );
        if (remainingLeft.length > 0) {
          if (
            activeTabIdRef.current === tabId ||
            res.splitTabIds.includes(activeTabIdRef.current || "")
          ) {
            const idx = tabsRef.current.findIndex((t) => t.id === tabId);
            const nextTab =
              remainingLeft[Math.min(Math.max(0, idx), remainingLeft.length - 1)];
            setActiveTabId(nextTab.id);
          }
        } else {
          // All tabs were moved to the right; create a fresh console tab for the left pane
          addTab({ type: "console" });
        }
      }
    },
    [splitTabIds, activeSplitTabId, setActiveTabId, addTab],
  );
  // Ids of tabs whose results are detached into their own separate windows (one
  // window per tab). Each window keeps showing its tab even when the user
  // switches tabs in the main window.
  const [detachedTabIds, setDetachedTabIds] = useState<Set<string>>(
    () => new Set(),
  );
  // Mirror of detachedTabIds for use inside callbacks/refs without re-creating
  // them or reading stale closures. Kept in sync alongside tabsRef below.
  const detachedTabIdsRef = useRef(detachedTabIds);
  const isDragging = useRef(false);
  const rafRef = useRef<number | null>(null);
  const editorsRef = useRef<Record<string, Parameters<OnMount>[0]>>({});
  const [monacoInstance, setMonacoInstance] = useState<Monaco | null>(null);

  const [selectableQueries, setSelectableQueries] = useState<string[]>([]);
  const [isQuerySelectionModalOpen, setIsQuerySelectionModalOpen] =
    useState(false);
  const {
    pending: dangerousQuery,
    guardQuery: guardDangerousQuery,
    resolve: resolveDangerousQuery,
  } = useDangerousQueryGuard();
  const [isTabSwitcherOpen, setIsTabSwitcherOpen] = useState(false);
  const [isRunDropdownOpen, setIsRunDropdownOpen] = useState(false);
  const [isDbDropdownOpen, setIsDbDropdownOpen] = useState(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isAiExplainModalOpen, setIsAiExplainModalOpen] = useState(false);
  const [isVisualExplainOpen, setIsVisualExplainOpen] = useState(false);
  const [visualExplainQuery, setVisualExplainQuery] = useState<string | null>(null);
  const [isExplainSelectionOpen, setIsExplainSelectionOpen] = useState(false);
  const [explainSelectableQueries, setExplainSelectableQueries] = useState<{ query: string; index: number }[]>([]);
  const [isSqlTemplatesOpen, setIsSqlTemplatesOpen] = useState(false);
  const [isQueryHistoryOpen, setIsQueryHistoryOpen] = useState(false);
  const [isMaskingEnabled, setIsMaskingEnabled] = useState(false);
  const [mockDataModal, setMockDataModal] = useState<{ isOpen: boolean; tableName: string; schema?: string } | null>(null);
  const [isSchemaDiffOpen, setIsSchemaDiffOpen] = useState(false);
  const [isTeamSyncOpen, setIsTeamSyncOpen] = useState(false);
  const [isExplainDiffOpen, setIsExplainDiffOpen] = useState(false);
  const [explainDiffPlan, setExplainDiffPlan] = useState<ExplainPlan | null>(null);
  const [isLiveTailActive, setIsLiveTailActive] = useState(false);
  const [liveTailInterval, setLiveTailInterval] = useState(3);
  const [liveTailNewRowCount, setLiveTailNewRowCount] = useState(0);
  const lastSeenRowsRef = useRef<unknown[][] | null>(null);

  const handleOpenExplainDiff = useCallback(async (overrideQuery?: string) => {
    const queryToExplain = overrideQuery || activeTab?.query;
    if (!queryToExplain || !activeConnectionId) return;

    try {
      const plan = await invoke<ExplainPlan>("explain_query_plan", {
        connectionId: activeConnectionId,
        query: queryToExplain,
        analyze: false,
        schema: activeTab?.schema ?? activeSchema ?? null,
      });
      setExplainDiffPlan(plan);
      setIsExplainDiffOpen(true);
    } catch (err) {
      showAlert(`${t("explainDiff.analyzeFailed")} ${String(err)}`, { kind: "warning" });
    }
  }, [activeTab?.query, activeTab?.schema, activeSchema, activeConnectionId, showAlert, t]);

  useEffect(() => {
    if (!isLiveTailActive || !activeTab || !activeConnectionId) return;

    const intervalMs = liveTailInterval * 1000;
    const timer = setInterval(() => {
      if (!activeTab.isLoading) {
        runQueryRef.current(activeTab.query, 1, activeTab.id);
      }
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isLiveTailActive, liveTailInterval, activeTab?.id, activeTab?.query, activeTab?.isLoading, activeConnectionId]);

  useEffect(() => {
    if (!isLiveTailActive || !activeTab?.result?.rows) return;
    const currentRows = activeTab.result.rows;
    const prevRows = lastSeenRowsRef.current;
    if (prevRows && prevRows.length > 0) {
      const delta = detectRowDeltas(prevRows, currentRows);
      if (delta.newRowCount > 0) {
        setLiveTailNewRowCount((prev) => prev + delta.newRowCount);
      }
    }
    lastSeenRowsRef.current = currentRows;
  }, [isLiveTailActive, activeTab?.result?.rows]);

  const [transactionMode, setTransactionMode] = useState<"auto" | "manual">("auto");
  const [isTransactionActive, setIsTransactionActive] = useState(false);
  const [isEditingPage, setIsEditingPage] = useState(false);
  const [tempPage, setTempPage] = useState("1");
  const [isCountLoading, setIsCountLoading] = useState(false);
  const [applyToAll, setApplyToAll] = useState(false);
  const [copyFormat, setCopyFormat] = useState<"csv" | "json" | "sql-insert" | "markdown" | "typescript">(
    settings.copyFormat ?? "csv",
  );
  const [csvDelimiter, setCsvDelimiter] = useState(
    settings.csvDelimiter ?? ",",
  );
  const [csvIncludeHeaders, setCsvIncludeHeaders] = useState(
    settings.csvIncludeHeaders ?? true,
  );

  const activeTabType = activeTab?.type;
  const activeTabQuery = activeTab?.query;
  const isTableTab = activeTab?.type === "table";
  const isNotebookTab = activeTab?.type === "notebook";
  const isMultiDb =
    isMultiDatabaseCapable(activeCapabilities) && selectedDatabases.length > 1;
  const isEditorOpen =
    !isTableTab && (activeTab?.isEditorOpen ?? activeTab?.type !== "table");

  const { effectiveTables } = useSqlAutocompleteRegistration(activeConnectionId, {
    monaco: monacoInstance,
    schema: activeSchema,
    enabled: !isNotebookTab,
  });

  // Validate schema on query changes in active editor
  useEffect(() => {
    if (!monacoInstance || !activeTabId || !editorsRef.current[activeTabId]) return;
    const editor = editorsRef.current[activeTabId];
    const model = editor.getModel();
    if (!model) return;

    const timer = setTimeout(() => {
      validateSqlSchema(monacoInstance, model, effectiveTables, {
        connectionId: activeConnectionId,
        schema: activeSchema,
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [monacoInstance, activeTabId, activeTabQuery, effectiveTables, activeConnectionId, activeSchema]);

  const handleCloseTab = useCallback(
    (tabId: string) => {
      delete editorsRef.current[tabId];
      if (splitTabIds.includes(tabId)) {
        setSplitTabIds((prev) => prev.filter((id) => id !== tabId));
      }
      closeTab(tabId);
    },
    [closeTab, splitTabIds],
  );

  // Update window title when the active tab changes
  useEffect(() => {
    const updateTitle = async () => {
      try {
        let title = "tabularis";
        if (activeConnectionName && activeDatabaseName) {
          const schemaSuffix =
            activeSchema && activeCapabilities?.schemas === true
              ? `/${activeSchema}`
              : "";
          let dbDisplay: string;
          if (isMultiDb) {
            dbDisplay =
              activeTab?.schema ?? selectedDatabases[0] ?? activeDatabaseName;
          } else {
            dbDisplay = activeDatabaseName;
          }
          title = `tabularis - ${activeConnectionName} (${dbDisplay}${schemaSuffix})`;
        }
        await invoke("set_window_title", { title });
      } catch (e) {
        console.error("Failed to update window title", e);
      }
    };
    updateTitle();
  }, [
    activeTabId,
    activeTab?.schema,
    activeConnectionName,
    activeDatabaseName,
    activeSchema,
    activeCapabilities,
    isMultiDb,
    selectedDatabases,
  ]);

  // Define updateActiveTab first to be used in handleQueryChange
  const updateActiveTab = useCallback(
    (partial: Partial<Tab>) => {
      if (activeTabId) updateTab(activeTabId, partial);
    },
    [activeTabId, updateTab],
  );

  // Placeholder Logic - memoized to avoid recalculation on every render

  const placeholders = useMemo(
    () => ({
      column: activeTab?.result?.columns?.[0] || "id",
      sort: activeTab?.result?.columns?.[0] || "created_at",
    }),
    [activeTab?.result?.columns],
  );

  const dropdownQueries = useMemo(() => {
    if (activeTabType === "query_builder" && activeTabQuery) {
      return [activeTabQuery];
    }
    return selectableQueries;
  }, [activeTabType, activeTabQuery, selectableQueries]);

  const tabsRef = useRef<Tab[]>([]);
  const activeTabIdRef = useRef<string | null>(null);
  // Last executed SQL per tab — used to preserve the loaded row count across
  // pagination of the SAME query while resetting it when the query changes.
  const lastRunQueryRef = useRef<Record<string, string>>({});
  // Stable refs for functions used inside Monaco actions (which capture closures at mount time)
  const runQueryRef = useRef<typeof runQuery>(null!);
  const runMultipleQueriesRef = useRef<typeof runMultipleQueries>(null!);
  const openExplainForQueryRef = useRef<(query: string) => void>(null!);
  const activeDialectRef = useRef<typeof activeDialect>(undefined);
  const tabScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const el = tabScrollRef.current;
    if (!el || !activeTabId) return;
    const idx = leftTabs.findIndex((t) => t.id === activeTabId);
    if (idx === -1) return;
    const tabEl = el.children[idx] as HTMLElement | undefined;
    tabEl?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [activeTabId, leftTabs]);

  const updateScrollArrows = useCallback(() => {
    const el = tabScrollRef.current;
    if (!el) return;
    const { canScrollLeft, canScrollRight } = getTabScrollState(el);
    setCanScrollLeft(canScrollLeft);
    setCanScrollRight(canScrollRight);
  }, []);

  const scrollTabs = useCallback(
    (direction: "left" | "right") => {
      const currentIndex = leftTabs.findIndex((t) => t.id === activeTabId);
      const targetIndex = getAdjacentTabIndex(
        currentIndex,
        leftTabs.length,
        direction,
      );
      if (targetIndex === null) return;
      const targetTab = leftTabs[targetIndex];
      setActiveTabId(targetTab.id);
      const el = tabScrollRef.current;
      if (!el) return;
      const tabEl = el.children[targetIndex] as HTMLElement | undefined;
      tabEl?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    },
    [leftTabs, activeTabId, setActiveTabId],
  );
  const processingRef = useRef<string | null>(null);
  const pendingExecutionsRef = useRef<
    Record<string, { sql: string; page: number }>
  >({});

  const selectionHasPending = useMemo(() => {
    if (!activeTab) return false;
    const {
      pendingChanges,
      pendingDeletions,
      pendingInsertions,
      selectedRows,
      result,
      pkColumns,
    } = activeTab;
    const hasGlobalPending =
      (pendingChanges && Object.keys(pendingChanges).length > 0) ||
      (pendingDeletions && Object.keys(pendingDeletions).length > 0) ||
      (pendingInsertions && Object.keys(pendingInsertions).length > 0);

    if (!selectedRows || selectedRows.length === 0) return hasGlobalPending;

    const existingRowCount = result?.rows.length || 0;

    return selectedRows.some((rowIndex) => {
      // Check if this is an insertion row (displayIndex >= existingRowCount)
      if (rowIndex >= existingRowCount) {
        // This is an insertion row
        return pendingInsertions && Object.keys(pendingInsertions).length > 0;
      }

      // This is an existing row - check for changes/deletions
      if (!result || !pkColumns || pkColumns.length === 0) return false;
      const pkIndices = pkColumns.map((c) => result.columns.indexOf(c));
      if (pkIndices.some((i) => i === -1)) return false;

      const row = result.rows[rowIndex];
      if (!row) return false;
      const pkKey = serializePkKey(buildPkMap(pkColumns, row, pkIndices));
      return (
        (pendingChanges && pendingChanges[pkKey]) ||
        (pendingDeletions && pendingDeletions[pkKey])
      );
    });
  }, [activeTab]);

  const hasPendingChanges = useMemo(() => {
    return (
      (activeTab?.pendingChanges &&
        Object.keys(activeTab.pendingChanges).length > 0) ||
      (activeTab?.pendingDeletions &&
        Object.keys(activeTab.pendingDeletions).length > 0) ||
      (activeTab?.pendingInsertions &&
        Object.keys(activeTab.pendingInsertions).length > 0)
    );
  }, [
    activeTab?.pendingChanges,
    activeTab?.pendingDeletions,
    activeTab?.pendingInsertions,
  ]);

  useEffect(() => {
    tabsRef.current = tabs;
    activeTabIdRef.current = activeTabId;
    detachedTabIdsRef.current = detachedTabIds;
  }, [tabs, activeTabId, detachedTabIds]);

  useEffect(() => {
    updateScrollArrows();
  }, [tabs, updateScrollArrows]);

  const fetchPkColumn = useCallback(
    async (table: string, tabId?: string, tabSchema?: string) => {
      if (!activeConnectionId) return;
      const effectiveSchema = tabSchema ?? activeSchema;
      try {
        const [cols, fks] = await Promise.all([
          invoke<TableColumn[]>("get_columns", {
            connectionId: activeConnectionId,
            tableName: table,
            ...(effectiveSchema ? { schema: effectiveSchema } : {}),
          }),
          invoke<ForeignKey[]>("get_foreign_keys", {
            connectionId: activeConnectionId,
            tableName: table,
            ...(effectiveSchema ? { schema: effectiveSchema } : {}),
          }).catch((e) => {
            console.warn("Failed to fetch foreign keys:", e);
            return [] as ForeignKey[];
          }),
        ]);
        const pks = cols.filter((c) => c.is_pk).map((c) => c.name);
        const autoInc = cols
          .filter((c) => c.is_auto_increment)
          .map((c) => c.name);
        const defaultVal = cols
          .filter(
            (c) => c.default_value !== undefined && c.default_value !== null,
          )
          .map((c) => c.name);
        const nullable = cols.filter((c) => c.is_nullable).map((c) => c.name);
        const targetId = tabId || activeTabId;
        if (targetId)
          updateTab(targetId, {
            pkColumns: pks.length > 0 ? pks : null,
            autoIncrementColumns: autoInc,
            defaultValueColumns: defaultVal,
            nullableColumns: nullable,
            columnMetadata: cols,
            foreignKeys: fks,
          });
      } catch (e) {
        console.error("Failed to fetch PK:", e);
        // Even if PK fetch fails, set pkColumns to null to unblock the UI
        const targetId = tabId || activeTabId;
        if (targetId)
          updateTab(targetId, {
            pkColumns: null,
            autoIncrementColumns: [],
            defaultValueColumns: [],
            nullableColumns: [],
            columnMetadata: [],
            foreignKeys: [],
          });
      }
    },
    [activeConnectionId, activeTabId, updateTab, activeSchema],
  );

  const stopQuery = useCallback(async () => {
    if (!activeConnectionId) return;
    try {
      await invoke("cancel_query", { connectionId: activeConnectionId });
      updateActiveTab({ isLoading: false });
    } catch (e) {
      console.error("Failed to stop:", e);
    }
  }, [activeConnectionId, updateActiveTab]);

  const runQuery = useCallback(
    async (
      sql?: string,
      pageNum: number = 1,
      tabId?: string,
      paramsOverride?: Record<string, string>,
      filterOverride?: string,
      sortOverride?: string,
      limitOverride?: number,
      preservePendingChanges?: {
        pendingChanges?: Record<
          string,
          { pkOriginalValue: unknown; changes: Record<string, unknown> }
        >;
        pendingDeletions?: Record<string, unknown>;
        pendingInsertions?: Record<string, PendingInsertion>;
      },
      distinctOverride?: boolean,
      offsetOverride?: number,
    ) => {
      const targetTabId = tabId || activeTabIdRef.current;
      if (!activeConnectionId || !targetTabId) return;

      const targetTab = tabsRef.current.find((t) => t.id === targetTabId);
      if (!targetTab) return;

      // When the target tab's results live in a detached window, this run was
      // triggered from that window: don't touch main-window-only UI state
      // (results panel, params modal) — it belongs to whatever tab is active here.
      const isDetached = detachedTabIdsRef.current.has(targetTabId);

      let textToRun = sql?.trim() || targetTab?.query;
      // For Table Tabs, reconstruct query if filter/sort are present
      if (targetTab?.type === "table" && targetTab.activeTable) {
        const effectiveSchema =
          activeCapabilities?.schemas === true ? targetTab.schema : undefined;
        const tabForQuery = { ...targetTab, schema: effectiveSchema };
        textToRun = reconstructTableQuery(
          tabForQuery,
          activeDriver ?? undefined,
          {
            filterOverride:
              filterOverride !== undefined ? filterOverride : undefined,
            sortOverride: sortOverride !== undefined ? sortOverride : undefined,
            limitOverride:
              limitOverride !== undefined ? limitOverride : undefined,
            offsetOverride:
              offsetOverride !== undefined ? offsetOverride : undefined,
            distinctOverride:
              distinctOverride !== undefined ? distinctOverride : undefined,
            wrapLimitSubquery: true,
          },
        );
      }

      if (!textToRun || !textToRun.trim()) return;

      const targetConn = connections.find(
        (c) => c.id === (targetTab?.connectionId || activeConnectionId),
      );
      const connEnv =
        targetConn?.environment ?? targetConn?.appearance?.environment;

      if (!(await guardDangerousQuery(textToRun, connEnv))) return;

      // Check for parameters
      const params = extractQueryParams(textToRun);
      if (params.length > 0) {
        const storedParams = paramsOverride || targetTab.queryParams || {};
        const missingParams = params.filter(
          (p) => storedParams[p] === undefined || storedParams[p].trim() === "",
        );

        // If we have missing params
        if (missingParams.length > 0) {
          // The params modal lives in the main window; don't pop it for a run
          // triggered from a detached window (it would hijack the active tab).
          if (!isDetached) {
            setQueryParamsModal({
              isOpen: true,
              sql: textToRun,
              parameters: params,
              pendingPageNum: pageNum,
              pendingTabId: targetTabId,
              mode: "run",
            });
          }
          return;
        }

        // Interpolate parameters before execution
        textToRun = interpolateQueryParams(textToRun, storedParams);
      }

      // Automatically open the results panel when running a query — but only
      // for the main window; a detached run must not re-expand the main panel.
      if (!isDetached) {
        setIsResultsCollapsed(false);
      }

      // Preserve total_rows across page changes so the count doesn't disappear
      const previousTotalRows =
        targetTab?.result?.pagination?.total_rows ?? null;

      updateTab(targetTabId, {
        isLoading: true,
        error: "",
        result: targetTab?.type === "table" && targetTab.result ? targetTab.result : null,
        executionTime: null,
        page: pageNum,
        // Clear multi-result state when running a single query
        results: undefined,
        activeResultId: undefined,
        // Clear pending changes and selection when running a new query (unless preserving)
        pendingChanges: preservePendingChanges?.pendingChanges,
        pendingDeletions: preservePendingChanges?.pendingDeletions,
        pendingInsertions: preservePendingChanges?.pendingInsertions,
        selectedRows: [],
      });

      const shouldRecordHistory =
        targetTab?.type === "console" || targetTab?.type === "query_builder";

      const schema = targetTab?.schema ?? activeSchema;
      // For history: fall back to activeDatabaseName for multi-db connections
      // where schema may not be set on the tab
      const historyDb = schema
        || (isMultiDb ? activeDatabaseName : undefined)
        || undefined;


      // Safe Mode Guardrail Check
      const safeCheck = evaluateSafeMode(textToRun, effectiveSafeModeLevel, activeConnectionObj?.name);
      if (!safeCheck.allowed) {
        showAlert(safeCheck.reason || "Bị chặn bởi Chế độ Chỉ đọc (Read-Only)", {
          title: "Chế độ Chỉ đọc (Read-Only Safe Mode)",
          kind: "error",
        });
        return;
      }
      if (safeCheck.requiresConfirmation) {
        const confirmed = await ask(safeCheck.reason || "Xác nhận thực thi câu lệnh?", {
          title: "Bảo vệ an toàn (Safe Mode)",
          kind: "warning",
        });
        if (!confirmed) return;
      }

      try {
        const start = performance.now();
        // Use settings.resultPageSize for Page Size (pagination), ignoring the "Total Limit" input which is handled in SQL
        // Fallback to 100 if settings not loaded yet
        const pageSize =
          settings.resultPageSize && settings.resultPageSize > 0
            ? settings.resultPageSize
            : 100;
        const res = await invoke<QueryResult>("execute_query", {
          connectionId: activeConnectionId,
          query: textToRun,
          limit: pageSize,
          page: pageNum,
          ...(schema ? { schema } : {}),
        });
        const end = performance.now();

        // Fetch PK column if this is a table tab OR if the query references a table
        const currentTab = tabsRef.current.find((t) => t.id === targetTabId);
        let tableName = currentTab?.activeTable;

        // If not a table tab, try to extract table name from the query
        if (!tableName && textToRun) {
          const extracted = extractTableName(textToRun);
          // Reject views and materialized views — they are not row-editable
          // (materialized views only accept REFRESH, not INSERT/UPDATE/DELETE).
          if (
            extracted &&
            !views.some((v) => v.name === extracted) &&
            !materializedViews.some((v) => v.name === extracted)
          ) {
            tableName = extracted;
          }
        }

        // Only carry the previous count forward when re-running / paginating the
        // SAME query; a different query resets it so a stale count isn't shown.
        const isSameQuery = lastRunQueryRef.current[targetTabId] === textToRun;
        lastRunQueryRef.current[targetTabId] = textToRun;
        const resultWithCount =
          res.pagination &&
          res.pagination.total_rows === null &&
          previousTotalRows !== null &&
          isSameQuery
            ? {
                ...res,
                pagination: {
                  ...res.pagination,
                  total_rows: previousTotalRows,
                },
              }
            : res;

        updateTab(targetTabId, {
          result: resultWithCount,
          executionTime: end - start,
          isLoading: false,
          activeTable: tableName || null,
        });

        if (tableName) {
          // Fetch column metadata in the background; tab updates when ready
          fetchPkColumn(tableName, targetTabId, targetTab?.schema ?? undefined);
        } else {
          updateTab(targetTabId, { pkColumns: null });
        }

        if (shouldRecordHistory) {
          addHistoryEntry(
            textToRun,
            end - start,
            "success",
            res.pagination?.total_rows ?? null,
            null,
            historyDb,
          );
        }
      } catch (err) {
        updateTab(targetTabId, {
          error: typeof err === "string" ? err : t("editor.queryFailed"),
          isLoading: false,
        });

        if (shouldRecordHistory) {
          addHistoryEntry(
            textToRun,
            null,
            "error",
            null,
            typeof err === "string" ? err : t("editor.queryFailed"),
            historyDb,
          );
        }
      }
    },
    [
      activeConnectionId,
      updateTab,
      settings.resultPageSize,
      fetchPkColumn,
      t,
      activeDriver,
      activeSchema,
      activeCapabilities?.schemas,
      views,
      materializedViews,
      isMultiDb,
      activeDatabaseName,
      addHistoryEntry,
      guardDangerousQuery,
      connections,
    ],
  );

  const runMultipleQueries = useCallback(
    async (queries: string[], paramsOverride?: Record<string, string>) => {
      const targetTabId = activeTabIdRef.current;
      if (!activeConnectionId || !targetTabId) return;

      const targetTab = tabsRef.current.find((t) => t.id === targetTabId);
      if (!targetTab) return;

      const targetConn = connections.find(
        (c) => c.id === (targetTab?.connectionId || activeConnectionId),
      );
      const connEnv =
        targetConn?.environment ?? targetConn?.appearance?.environment;

      if (!(await guardDangerousQuery(queries, connEnv))) return;

      // Collect all unique parameters across all queries
      const allParams = [
        ...new Set(queries.flatMap((q) => extractQueryParams(q))),
      ];
      if (allParams.length > 0) {
        const storedParams =
          paramsOverride || targetTab.queryParams || {};
        const missingParams = allParams.filter(
          (p) =>
            storedParams[p] === undefined || storedParams[p].trim() === "",
        );
        if (missingParams.length > 0) {
          setQueryParamsModal({
            isOpen: true,
            sql: queries.join(";\n"),
            parameters: allParams,
            pendingPageNum: 1,
            pendingTabId: targetTabId,
            mode: "run",
            pendingMultiQueries: queries,
          });
          return;
        }
        // Interpolate all queries with the stored params
        queries = queries.map((q) => interpolateQueryParams(q, storedParams));
      }

      const pageSize =
        settings.resultPageSize && settings.resultPageSize > 0
          ? settings.resultPageSize
          : 100;
      const schema = targetTab?.schema ?? activeSchema;
      const historyDb = schema
        || (isMultiDb ? activeDatabaseName : undefined)
        || undefined;

      const entries = createResultEntries(targetTabId, queries);

      setIsResultsCollapsed(false);
      updateTab(targetTabId, {
        results: entries,
        activeResultId: entries[0].id,
        result: null,
        error: "",
        isLoading: true,
        executionTime: null,
      });

      const shouldRecordHistory =
        targetTab?.type === "console" || targetTab?.type === "query_builder";

      // Resolves a single result tab the moment its statement finishes:
      // records history and patches that entry in place (no whole-array
      // rewrite) so the UI shows per-statement status in real time instead of
      // waiting for the entire batch.
      const applied = new Set<number>();
      const applyStatement = (index: number, item: BatchStatementResult) => {
        const entry = entries[index];
        if (!entry) return;
        const execTime = item?.execution_time_ms ?? null;
        if (item?.error) {
          if (shouldRecordHistory) {
            addHistoryEntry(
              entry.query,
              execTime,
              "error",
              null,
              item.error,
              historyDb,
            );
          }
          patchResultEntry(targetTabId, entry.id, {
            error: item.error,
            executionTime: execTime,
            isLoading: false,
          });
          return;
        }
        const res = item?.result ?? null;
        const tableName = extractTableName(entry.query) ?? null;
        if (shouldRecordHistory) {
          addHistoryEntry(
            entry.query,
            execTime,
            "success",
            res?.pagination?.total_rows ?? null,
            null,
            historyDb,
          );
        }
        patchResultEntry(targetTabId, entry.id, {
          result: res,
          executionTime: execTime,
          isLoading: false,
          activeTable: tableName,
        });
      };

      // A unique id ties the live events to this run, so a listener ignores
      // events from any other batch executing concurrently.
      const batchId = `batch-${targetTabId}-${performance.now()}`;
      // Registered before `invoke` so no early statement event is missed.
      const unlisten = await listen<{
        batch_id: string;
        index: number;
        statement: BatchStatementResult;
      }>("batch-statement-complete", (event) => {
        const p = event.payload;
        if (p.batch_id !== batchId || applied.has(p.index)) return;
        applied.add(p.index);
        applyStatement(p.index, p.statement);
      });

      // Run the whole script on a single pooled connection so statements
      // can share session state (SET @var, LAST_INSERT_ID(), transactions,
      // TEMP TABLE).
      const batchStart = performance.now();
      let batchResults: BatchStatementResult[];
      try {
        batchResults = await invoke<BatchStatementResult[]>(
          "execute_query_batch",
          {
            connectionId: activeConnectionId,
            queries: entries.map((e) => e.query),
            limit: pageSize,
            page: 1,
            batchId,
            ...(schema ? { schema } : {}),
          },
        );
      } catch (err) {
        unlisten();
        // Batch-level failure (e.g. connection acquisition, cancellation):
        // mark only the entries that haven't already resolved via a live event
        // as failed, so statements that completed first keep their results.
        const fallbackElapsed = performance.now() - batchStart;
        const message = typeof err === "string" ? err : t("editor.queryFailed");
        entries.forEach((entry, idx) => {
          if (applied.has(idx)) return;
          if (shouldRecordHistory) {
            addHistoryEntry(
              entry.query,
              fallbackElapsed,
              "error",
              null,
              message,
              historyDb,
            );
          }
          patchResultEntry(targetTabId, entry.id, {
            error: message,
            executionTime: fallbackElapsed,
            isLoading: false,
          });
        });
        updateTab(targetTabId, { isLoading: false });
        return;
      }

      unlisten();

      // Reconcile any statement whose live event was missed (dropped/raced),
      // then clear the tab-level loading flag.
      batchResults.forEach((item, idx) => {
        if (applied.has(idx)) return;
        applied.add(idx);
        applyStatement(idx, item);
      });
      updateTab(targetTabId, { isLoading: false });
    },
    [activeConnectionId, updateTab, patchResultEntry, settings.resultPageSize, activeSchema, t, isMultiDb, activeDatabaseName, addHistoryEntry, guardDangerousQuery, connections],
  );

  const runResultEntryPage = useCallback(
    async (entryId: string, pageNum: number, tabIdArg?: string) => {
      const targetTabId = tabIdArg ?? activeTabIdRef.current;
      if (!activeConnectionId || !targetTabId) return;

      const currentTab = tabsRef.current.find((t) => t.id === targetTabId);
      const entry = currentTab?.results?.find((r) => r.id === entryId);
      if (!entry) return;

      const pageSize =
        settings.resultPageSize && settings.resultPageSize > 0
          ? settings.resultPageSize
          : 100;
      const schema = currentTab?.schema ?? activeSchema;

      // Mark this entry as loading
      if (currentTab?.results) {
        updateTab(targetTabId, {
          results: updateResultEntry(currentTab.results, entryId, {
            isLoading: true,
          }),
        });
      }

      try {
        const start = performance.now();
        const res = await invoke<QueryResult>("execute_query", {
          connectionId: activeConnectionId,
          query: entry.query,
          limit: pageSize,
          page: pageNum,
          ...(schema ? { schema } : {}),
        });
        const end = performance.now();

        const latestTab = tabsRef.current.find((t) => t.id === targetTabId);
        if (latestTab?.results) {
          const previousTotalRows =
            entry.result?.pagination?.total_rows ?? null;
          const resultWithCount =
            res.pagination &&
            res.pagination.total_rows === null &&
            previousTotalRows !== null
              ? {
                  ...res,
                  pagination: {
                    ...res.pagination,
                    total_rows: previousTotalRows,
                  },
                }
              : res;

          updateTab(targetTabId, {
            results: updateResultEntry(latestTab.results, entryId, {
              result: resultWithCount,
              executionTime: end - start,
              isLoading: false,
              page: pageNum,
            }),
          });
        }
      } catch (err) {
        const latestTab = tabsRef.current.find((t) => t.id === targetTabId);
        if (latestTab?.results) {
          updateTab(targetTabId, {
            results: updateResultEntry(latestTab.results, entryId, {
              error:
                typeof err === "string" ? err : t("editor.queryFailed"),
              isLoading: false,
            }),
          });
        }
      }
    },
    [activeConnectionId, updateTab, settings.resultPageSize, activeSchema, t],
  );

  const loadCount = useCallback(
    async (tabIdArg?: string) => {
      const tab = tabIdArg
        ? tabsRef.current.find((t) => t.id === tabIdArg)
        : activeTab;
      if (!tab?.result?.pagination || !activeConnectionId) return;
      // Count the reconstructed filtered query, not tab.query (which omits the
      // filter box's WHERE); LIMIT is dropped so it can't cap the count.
      const countTarget =
        tab.type === "table" && tab.activeTable
          ? reconstructTableQuery(
              {
                ...tab,
                schema:
                  activeCapabilities?.schemas === true ? tab.schema : undefined,
              },
              activeDriver ?? undefined,
              { sortOverride: null, limitOverride: null },
            )
          : tab.query;
      // setIsCountLoading drives the spinner in the main window only; skip it for
      // a count triggered from a detached window (its own window owns its spinner).
      const isDetached = detachedTabIdsRef.current.has(tab.id);
      if (!isDetached) setIsCountLoading(true);
      try {
        const total = await invoke<number>("count_query", {
          connectionId: activeConnectionId,
          query: countTarget,
          schema: tab.schema ?? activeSchema,
        });
        const latest = tabsRef.current.find((t) => t.id === tab.id) ?? tab;
        if (!latest.result?.pagination) return;
        updateTab(tab.id, {
          result: {
            ...latest.result,
            pagination: { ...latest.result.pagination, total_rows: total },
          },
        });
      } finally {
        if (!isDetached) setIsCountLoading(false);
      }
    },
    [
      activeTab,
      activeConnectionId,
      activeSchema,
      activeDriver,
      activeCapabilities?.schemas,
      updateTab,
    ],
  );

  // --- Detached results windows (one per detached tab) ---
  const handleDetachResults = useCallback(
    async (targetTabId?: string) => {
      const targetId = targetTabId ?? activeTab?.id;
      if (!targetId) return;
      const target = tabs.find((t) => t.id === targetId) ?? activeTab;
      if (!target) return;
      try {
        await invoke("open_results_window", {
          tabId: target.id,
          title: `${target.title} — Tabularis Window`,
        });
        setDetachedTabIds((prev) => new Set(prev).add(target.id));
      } catch (e) {
        console.error("Failed to detach results", e);
      }
    },
    [activeTab, tabs],
  );

  const handleReattachResults = useCallback(async (tabId: string) => {
    try {
      await invoke("close_results_window", { tabId });
    } catch (e) {
      console.error("Failed to close results window", e);
    }
    setDetachedTabIds((prev) => {
      const next = new Set(prev);
      next.delete(tabId);
      return next;
    });
  }, []);

  // Push each detached tab's result state to its window whenever the tabs
  // change (every detached tab is re-synced; its window filters by tabId).
  useEffect(() => {
    if (detachedTabIds.size === 0) return;
    for (const id of detachedTabIds) {
      const tab = tabs.find((t) => t.id === id);
      if (tab) {
        emit(
          RESULTS_SYNC_EVENT,
          buildSyncPayload(
            tab,
            {
              connectionId: activeConnectionId,
              copyFormat,
              csvDelimiter,
              csvIncludeHeaders,
            },
            activeDriver ?? undefined,
            effectiveTables,
            activeSchema,
          ),
        );
      }
    }
  }, [
    tabs,
    detachedTabIds,
    activeConnectionId,
    activeDriver,
    copyFormat,
    csvDelimiter,
    csvIncludeHeaders,
    effectiveTables,
    activeSchema,
  ]);

  // If a detached tab is closed in the main window, close its orphaned window.
  // Closing the window emits RESULTS_CLOSED_EVENT, whose listener owns pruning
  // detachedTabIds — so this effect stays side-effect-only (no setState here).
  useEffect(() => {
    for (const id of detachedTabIds) {
      if (!tabs.some((t) => t.id === id)) {
        invoke("close_results_window", { tabId: id }).catch(() => {});
      }
    }
  }, [tabs, detachedTabIds]);

  // Respond to the detached windows' handshakes and forwarded actions. The main
  // window owns all query/DB logic, so actions map onto the existing handlers
  // targeting the tab named in each event (not necessarily the active one).
  //
  // Registered unconditionally (no detachedTabIds.size gate): a freshly opened
  // window emits its ready handshake as soon as it boots, and listen() registers
  // asynchronously — gating behind the first detach races that emit and can leave
  // the window stuck on "Loading…". Each handler self-guards (action via
  // detachedTabIdsRef, ready via the tabsRef lookup, closed via prev.has).
  useEffect(() => {
    const emitSyncFor = (tabId: string) => {
      const tab = tabsRef.current.find((t) => t.id === tabId);
      if (tab) {
        emit(
          RESULTS_SYNC_EVENT,
          buildSyncPayload(
            tab,
            {
              connectionId: activeConnectionId,
              copyFormat,
              csvDelimiter,
              csvIncludeHeaders,
            },
            activeDriver ?? undefined,
            effectiveTables,
            activeSchema,
          ),
        );
      }
    };

    const makeHandlers = (tabId: string): ResultsWindowActionHandlers => {
      const tabResults = () => {
        const tab = tabsRef.current.find((t) => t.id === tabId);
        return tab && tab.results ? tab : null;
      };
      return {
        onRunQueryPage: (query, page) => runQuery(query, page, tabId),
        onRunQuery: (query) => {
          const queries = splitQueries(query, activeDialect);
          if (queries.length > 1) {
            runMultipleQueries(queries);
          } else {
            runQuery(queries[0] || query, 1, tabId);
          }
        },
        onUpdateQuery: (query) => updateTab(tabId, { query }),
        onReattach: () => handleReattachResults(tabId),
        onPageChange: (entryId, page) => runResultEntryPage(entryId, page, tabId),
        onRerunEntry: (entryId) => runResultEntryPage(entryId, 1, tabId),
        onLoadCount: () => loadCount(tabId),
        onSelectResult: (entryId) =>
          updateTab(tabId, { activeResultId: entryId }),
        onCloseEntry: (entryId) => {
          const tab = tabResults();
          if (!tab) return;
          const { results: newResults, nextActiveId } = removeResultEntry(
            tab.results!,
            entryId,
            tab.activeResultId,
          );
          if (newResults.length === 0) {
            updateTab(tab.id, { results: undefined, activeResultId: undefined });
          } else {
            updateTab(tab.id, {
              results: newResults,
              activeResultId: nextActiveId,
            });
          }
        },
        onCloseOtherEntries: (entryId) => {
          const tab = tabResults();
          if (!tab) return;
          const { results: newResults, nextActiveId } = removeOtherEntries(
            tab.results!,
            entryId,
          );
          updateTab(tab.id, {
            results: newResults,
            activeResultId: nextActiveId,
          });
        },
        onCloseEntriesToRight: (entryId) => {
          const tab = tabResults();
          if (!tab) return;
          const { results: newResults, nextActiveId } = removeEntriesToRight(
            tab.results!,
            entryId,
            tab.activeResultId,
          );
          updateTab(tab.id, {
            results: newResults,
            activeResultId: nextActiveId,
          });
        },
        onCloseEntriesToLeft: (entryId) => {
          const tab = tabResults();
          if (!tab) return;
          const { results: newResults, nextActiveId } = removeEntriesToLeft(
            tab.results!,
            entryId,
            tab.activeResultId,
          );
          updateTab(tab.id, {
            results: newResults,
            activeResultId: nextActiveId,
          });
        },
        onCloseAllEntries: () =>
          updateTab(tabId, { results: undefined, activeResultId: undefined }),
        onRenameEntry: (entryId, label) => {
          const tab = tabResults();
          if (!tab) return;
          updateTab(tab.id, {
            results: updateResultEntry(tab.results!, entryId, { label }),
          });
        },
      };
    };

    const readyP = listen<ResultsReadyPayload>(RESULTS_READY_EVENT, (event) =>
      emitSyncFor(event.payload.tabId),
    );
    const actionP = listen<ResultsActionEnvelope>(
      RESULTS_ACTION_EVENT,
      (event) => {
        // Only honor actions for tabs we actually have detached — defense in
        // depth against events arriving for a reattached/unknown tab.
        const { tabId, action } = event.payload;
        if (!detachedTabIdsRef.current.has(tabId)) return;
        applyAction(action, makeHandlers(tabId));
      },
    );
    const closedP = listen<ResultsClosedPayload>(
      RESULTS_CLOSED_EVENT,
      (event) => {
        const closedId = event.payload.tabId;
        setDetachedTabIds((prev) => {
          if (!prev.has(closedId)) return prev;
          const next = new Set(prev);
          next.delete(closedId);
          return next;
        });
      },
    );

    return () => {
      readyP.then((u) => u());
      actionP.then((u) => u());
      closedP.then((u) => u());
    };
  }, [
    activeConnectionId,
    copyFormat,
    csvDelimiter,
    csvIncludeHeaders,
    runQuery,
    runResultEntryPage,
    loadCount,
    updateTab,
  ]);

  const handleRunButton = useCallback(() => {
    if (!activeTab) return;

    // Table Tab: run query with filter/sort/limit from activeTab
    if (activeTab.type === "table") {
      runQuery(undefined, 1);
      return;
    }

    // Visual Query Builder: run the generated SQL directly
    if (activeTab.type === "query_builder") {
      if (activeTab.query && activeTab.query.trim()) {
        runQuery(activeTab.query, 1);
      }
      return;
    }

    // Monaco Editor: handle selection and multi-query
    if (!editorsRef.current[activeTab.id]) {
      // Fallback: use saved query when editor ref is not available (e.g. after tab restore)
      if (activeTab.query?.trim()) {
        const queries = splitQueries(activeTab.query, activeDialect);
        if (queries.length <= 1) runQuery(queries[0] || activeTab.query, 1);
        else {
          setSelectableQueries(queries);
          setIsQuerySelectionModalOpen(true);
        }
      }
      return;
    }
    const editor = editorsRef.current[activeTab.id];
    const selection = editor.getSelection();
    const selectedText = selection
      ? editor.getModel()?.getValueInRange(selection)?.trim()
      : undefined;

    // 1. If text is highlighted (bôi đen), execute ONLY the highlighted text!
    if (selectedText && selection && !selection.isEmpty()) {
      const selectedQueries = splitQueries(selectedText, activeDialect);
      if (selectedQueries.length > 1) {
        runMultipleQueries(selectedQueries);
      } else {
        runQuery(selectedQueries[0] || selectedText, 1);
      }
      return;
    }

    // 2. If NO text is highlighted:
    const fullText = editor.getValue();
    if (!fullText.trim()) return;

    const statements = splitStatements(fullText, activeDialect);
    if (statements.length <= 1) {
      // Single query in console -> run it directly!
      runQuery(statements[0]?.text || fullText, 1);
      return;
    }

    // 3. Multiple queries in console: execute statement at current cursor position
    const model = editor.getModel();
    const position = editor.getPosition();
    if (position && model) {
      const offset = model.getOffsetAt(position);
      const stmtAtCursor = findStatementAtOffset(statements, offset);
      if (stmtAtCursor && stmtAtCursor.text.trim()) {
        runQuery(stmtAtCursor.text.trim(), 1);
        return;
      }
    }

    // Fallback: prompt query selection modal
    setSelectableQueries(statements.map((s) => s.text));
    setIsQuerySelectionModalOpen(true);
  }, [activeTab, activeDialect, runQuery, runMultipleQueries]);

  const openExplainForQuery = useCallback((query: string) => {
    setVisualExplainQuery(query);
    setIsVisualExplainOpen(true);
  }, []);

  const handleExplainButton = useCallback(() => {
    if (!activeTab || !activeConnectionId) return;

    // Get text: selection first, then full editor content, then saved query
    const editor = editorsRef.current[activeTab.id];
    let text = "";
    if (editor) {
      const selection = editor.getSelection();
      const selectedText = selection && !selection.isEmpty()
        ? editor.getModel()?.getValueInRange(selection)
        : undefined;
      text = (selectedText || editor.getValue()).trim();
    } else {
      text = (activeTab.query ?? "").trim();
    }

    if (!text) return;

    const explainable = getExplainableQueries(text, activeDialect);
    if (explainable.length === 0) {
      // No explainable queries — open modal with full text so it shows the error
      openExplainForQuery(text);
    } else if (explainable.length === 1) {
      openExplainForQuery(explainable[0].query);
    } else {
      setExplainSelectableQueries(explainable);
      setIsExplainSelectionOpen(true);
    }
  }, [activeTab, activeConnectionId, activeDialect, openExplainForQuery]);

  // Keep stable refs in sync for Monaco actions (closure-captured at mount time)
  runQueryRef.current = runQuery;
  runMultipleQueriesRef.current = runMultipleQueries;
  openExplainForQueryRef.current = openExplainForQuery;
  activeDialectRef.current = activeDialect;

  // Latest activeTab for the AI chat "insert & run" bridge (avoids a stale
  // closure inside the long-lived subscription below).
  const aiRunActiveTabRef = useRef(activeTab);
  aiRunActiveTabRef.current = activeTab;

  // Bridge for the floating AI chat widget's "Chạy luôn" action: append the SQL
  // to the current console tab (preserving what's already there) — or open a new
  // console tab when none is active — then execute just that snippet.
  useEffect(() => {
    return onRunSql((sql) => {
      if (!activeConnectionId) return;
      const cur = aiRunActiveTabRef.current;
      let targetId = "";
      if (cur && cur.type === "console") {
        const existing = (cur.query ?? "").replace(/\s+$/, "");
        updateTab(cur.id, { query: existing ? `${existing}\n\n${sql}` : sql });
        targetId = cur.id;
      } else {
        targetId = addTab({ type: "console", query: sql, title: "AI SQL" });
      }
      if (targetId) runQueryRef.current(sql, 1, targetId);
    });
  }, [activeConnectionId, addTab, updateTab]);

  // Global Ctrl/Command+F5 shortcut for Run
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "F5") {
        e.preventDefault();
        handleRunButton();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "h" || e.key === "H")) {
        e.preventDefault();
        setIsQueryHistoryOpen(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === "c" || e.key === "C")) {
        e.preventDefault();
        handleCommitTransaction();
      }
      if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === "r" || e.key === "R")) {
        e.preventDefault();
        handleRollbackTransaction();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleRunButton]);

  // Global Ctrl+Tab shortcut: open tab switcher and advance to next tab circularly.
  // In split mode only the focused pane (explorerConnectionId) handles the shortcut.
  useEffect(() => {
    const focused = isFocusedPane(explorerConnectionId, activeConnectionId);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!focused || !e.ctrlKey || e.key !== "Tab") return;
      e.preventDefault();
      setIsTabSwitcherOpen(true);
      const nextId = resolveNextTabId(tabsRef.current, activeTabIdRef.current);
      if (nextId !== null) setActiveTabId(nextId);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (!focused || e.key !== "Control") return;
      setIsTabSwitcherOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [explorerConnectionId, activeConnectionId, setActiveTabId]);

  // Cmd/Ctrl+T: new console tab; Cmd/Ctrl+Right: next page; Cmd/Ctrl+Left: prev page
  useEffect(() => {
    const focused = isFocusedPane(explorerConnectionId, activeConnectionId);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!focused) return;

      if (matchesShortcut(e, "close_tab")) {
        e.preventDefault();
        const currentTabId = activeTabIdRef.current;
        if (currentTabId) handleCloseTab(currentTabId);
        return;
      }

      if (matchesShortcut(e, "reopen_closed_tab")) {
        e.preventDefault();
        reopenClosedTab();
        return;
      }

      if (matchesShortcut(e, "new_tab")) {
        e.preventDefault();
        addTab({ type: "console" });
        return;
      }

      if (matchesShortcut(e, "next_page")) {
        const tab = tabsRef.current.find(
          (t) => t.id === activeTabIdRef.current,
        );
        if (tab?.result?.pagination?.has_more) {
          e.preventDefault();
          runQuery(tab.query, (tab.result.pagination.page ?? 1) + 1);
        }
        return;
      }

      if (matchesShortcut(e, "prev_page")) {
        const tab = tabsRef.current.find(
          (t) => t.id === activeTabIdRef.current,
        );
        if (tab?.result?.pagination && tab.result.pagination.page > 1) {
          e.preventDefault();
          runQuery(tab.query, tab.result.pagination.page - 1);
        }
        return;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    explorerConnectionId,
    activeConnectionId,
    matchesShortcut,
    addTab,
    handleCloseTab,
    reopenClosedTab,
    runQuery,
  ]);

  const handleRefresh = useCallback(
    (tabIdArg?: string) => {
      // Guard: onRefresh may be wired to an onClick, which would pass an event.
      const targetId =
        (typeof tabIdArg === "string" ? tabIdArg : undefined) ??
        activeTabIdRef.current;
      const currentTab = tabsRef.current.find((t) => t.id === targetId);
      if (currentTab?.activeTable && activeConnectionId)
        runQuery(currentTab.query, currentTab.page, currentTab.id);
    },
    [activeConnectionId, runQuery],
  );

  // Auto-load table data for restored table tabs when connection is ready
  const autoLoadedTabsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!activeConnectionId) return;
    const currentTab = tabsRef.current.find(
      (t) => t.id === activeTabIdRef.current,
    );
    if (
      currentTab &&
      currentTab.type === "table" &&
      currentTab.activeTable &&
      currentTab.connectionId === activeConnectionId &&
      !currentTab.result &&
      !currentTab.isLoading &&
      !currentTab.error &&
      !autoLoadedTabsRef.current.has(currentTab.id)
    ) {
      autoLoadedTabsRef.current.add(currentTab.id);
      handleRefresh(currentTab.id);
    }

    if (
      splitTab &&
      splitTab.type === "table" &&
      splitTab.activeTable &&
      splitTab.connectionId === activeConnectionId &&
      !splitTab.result &&
      !splitTab.isLoading &&
      !splitTab.error &&
      !autoLoadedTabsRef.current.has(splitTab.id)
    ) {
      autoLoadedTabsRef.current.add(splitTab.id);
      handleRefresh(splitTab.id);
    }
  }, [activeConnectionId, activeTabId, splitTab, handleRefresh]);

  const handleToolbarUpdate = useCallback(
    (
      update: {
        filter: string;
        sort: string;
        limit: number | undefined;
        offset?: number;
        distinct?: boolean;
      },
      tabIdArg?: string,
    ) => {
      const tabId = tabIdArg ?? activeTabIdRef.current;
      if (!tabId) return;

      const { filter, sort, limit, offset, distinct } = update;

      updateTab(tabId, {
        filterClause: filter,
        sortClause: sort,
        limitClause: limit,
        offsetClause: offset,
        distinct,
      });

      // Pass values directly to runQuery to avoid race conditions with ref updates
      runQuery(
        undefined,
        1,
        tabId,
        undefined,
        filter,
        sort,
        limit,
        undefined,
        distinct,
        offset,
      );
    },
    [updateTab, runQuery],
  );

  const handleForeignKeyShowPanel = useCallback(
    (fk: ForeignKey, value: unknown) => {
      const currentTab = tabsRef.current.find(
        (tb) => tb.id === activeTabIdRef.current,
      );
      if (!currentTab || !activeConnectionId) return;

      const sourceType = currentTab.columnMetadata?.find(
        (c) => c.name === fk.column_name,
      )?.data_type;

      setActiveFkQuery({
        fk,
        value,
        sourceColumnType: sourceType,
      });
    },
    [activeConnectionId],
  );

  const handleForeignKeyNavigate = useCallback(
    (fk: ForeignKey, value: unknown, sourceTab?: Tab) => {
      const currentTab =
        sourceTab ??
        tabsRef.current.find((tb) => tb.id === activeTabIdRef.current);
      if (!currentTab || !activeConnectionId) return;

      const sourceType = currentTab.columnMetadata?.find(
        (c) => c.name === fk.column_name,
      )?.data_type;
      const filterClause = buildForeignKeyFilterClause(
        fk,
        value,
        activeDriver ?? null,
        sourceType,
      );

      const targetSchema = activeCapabilities?.schemas
        ? currentTab.schema
        : undefined;

      const newTabId = addTab({
        type: "table",
        activeTable: fk.ref_table,
        schema: targetSchema,
        filterClause,
        // Reset clauses that may linger on an existing dedup'd tab
        sortClause: "",
        limitClause: undefined,
        // Drop any stale results so the new query renders fresh
        result: null,
      });
      if (!newTabId) return;

      updateTab(newTabId, {
        filterClause,
        sortClause: "",
        limitClause: undefined,
      });

      // Defer to next tick: addTab uses setTabs (async), and runQuery resolves
      // the target tab via tabsRef which is only refreshed by the
      // tabs-tracking effect after React commits. Running synchronously here
      // misses the freshly created tab and bails out early.
      setTimeout(() => {
        runQuery(undefined, 1, newTabId, undefined, filterClause, "", undefined);
      }, 0);
    },
    [
      activeConnectionId,
      activeDriver,
      activeCapabilities?.schemas,
      addTab,
      updateTab,
      runQuery,
    ],
  );

  const handleFilterByValue = useCallback(
    (
      column: string,
      operator: CellValueFilterOperator,
      value: unknown,
      columnType?: string,
      tabOverride?: Tab,
    ) => {
      const currentTab =
        tabOverride ??
        tabsRef.current.find((tb) => tb.id === activeTabIdRef.current);
      if (!currentTab) return;

      const sourceType =
        columnType ||
        currentTab.columnMetadata?.find((c) => c.name === column)?.data_type;
      const added = buildCellValueFilterClause(
        column,
        operator,
        value,
        activeCapabilities ?? activeDriver ?? null,
        sourceType,
      );
      handleToolbarUpdate(
        {
          filter: combineFilterClauses(currentTab.filterClause, added),
          sort: currentTab.sortClause || "",
          limit: currentTab.limitClause,
        },
        currentTab.id,
      );
    },
    [activeDriver, activeCapabilities, handleToolbarUpdate],
  );

  const handleSort = useCallback(
    (colName: string, sortTab?: Tab) => {
      const targetTab = sortTab ?? activeTab;
      if (!targetTab) return;

      const currentSort = targetTab.sortClause || "";
      const parts = currentSort.trim().split(/\s+/);

      let newSort = "";

      const sortCol = parts[0]?.replace(/^["`]|["`]$/g, "") ?? "";

      // Check if we are currently sorting by this column
      if (sortCol === colName && parts.length <= 2) {
        const currentDir = parts[1]?.toUpperCase();

        if (!currentDir || currentDir === "ASC") {
          // ASC -> DESC
          newSort = `${formatSqlIdentifier(colName, activeDriver)} DESC`;
        } else {
          // DESC -> None (Clear)
          newSort = "";
        }
      } else {
        // New column -> ASC
        newSort = `${formatSqlIdentifier(colName, activeDriver)} ASC`;
      }

      handleToolbarUpdate(
        {
          filter: targetTab.filterClause || "",
          sort: newSort,
          limit: targetTab.limitClause,
          offset: targetTab.offsetClause,
          distinct: targetTab.distinct,
        },
        targetTab.id,
      );
    },
    [activeTab, activeDriver, handleToolbarUpdate],
  );

  const handlePendingChange = useCallback(
    (pkVal: unknown, colName: string, value: unknown, tabIdArg?: string) => {
      const tabId = tabIdArg ?? activeTabIdRef.current;
      if (!tabId) return;

      const currentTab = tabsRef.current.find((t) => t.id === tabId);
      if (!currentTab) return;

      const pkKey = serializePkKey(pkVal as Record<string, unknown>);
      const currentPending = currentTab.pendingChanges || {};
      const rowEntry = currentPending[pkKey] || {
        pkOriginalValue: pkVal,
        changes: {},
      };

      // Create new changes object
      const newChanges = { ...rowEntry.changes };

      if (value === undefined) {
        // Remove change
        delete newChanges[colName];
      } else {
        // Update change
        newChanges[colName] = value;
      }

      const newPending = { ...currentPending };

      // If no changes left for this row, remove the row entry
      if (Object.keys(newChanges).length === 0) {
        delete newPending[pkKey];
      } else {
        newPending[pkKey] = {
          ...rowEntry,
          changes: newChanges,
        };
      }

      updateTab(tabId, { pendingChanges: newPending });
    },
    [updateTab],
  );

  const handleSelectionChange = useCallback(
    (indices: Set<number>, tabIdArg?: string) => {
      const tabId = tabIdArg ?? activeTabIdRef.current;
      if (!tabId) return;
      updateTab(tabId, { selectedRows: Array.from(indices) });
    },
    [updateTab],
  );

  const handleDeleteRows = useCallback(() => {
    if (
      !activeTab ||
      !activeTab.selectedRows ||
      activeTab.selectedRows.length === 0
    )
      return;

    const existingRowCount = activeTab.result?.rows.length || 0;
    const currentPendingInsertions = activeTab.pendingInsertions || {};
    const currentPendingDeletions = activeTab.pendingDeletions || {};

    const newPendingDeletions = { ...currentPendingDeletions };
    const newPendingInsertions = { ...currentPendingInsertions };

    // Separate selected rows into existing rows and new rows
    const insertionTempIds = Object.keys(currentPendingInsertions);

    activeTab.selectedRows.forEach((rowIndex) => {
      if (rowIndex < existingRowCount) {
        // Existing row - add to pending deletions
        if (activeTab.result && activeTab.pkColumns && activeTab.pkColumns.length > 0) {
          const pkCols = activeTab.pkColumns;
          const pkIndices = pkCols.map((c) => activeTab.result!.columns.indexOf(c));
          if (pkIndices.every((i) => i !== -1)) {
            const row = activeTab.result.rows[rowIndex];
            if (row) {
              const pkMapVal = buildPkMap(pkCols, row, pkIndices);
              const pkKey = serializePkKey(pkMapVal);
              newPendingDeletions[pkKey] = pkMapVal;
            }
          }
        }
      } else {
        // New row (insertion) - remove directly from pendingInsertions
        const insertionArrayIndex = rowIndex - existingRowCount;
        if (
          insertionArrayIndex >= 0 &&
          insertionArrayIndex < insertionTempIds.length
        ) {
          const tempId = insertionTempIds[insertionArrayIndex];
          delete newPendingInsertions[tempId];
        }
      }
    });

    updateActiveTab({
      pendingDeletions: newPendingDeletions,
      pendingInsertions: newPendingInsertions,
      selectedRows: [],
    });
  }, [activeTab, updateActiveTab]);

  const handlePendingInsertionChange = useCallback(
    (tempId: string, colName: string, value: unknown, tabIdArg?: string) => {
      const tabId = tabIdArg ?? activeTabIdRef.current;
      if (!tabId) return;

      const currentTab = tabsRef.current.find((t) => t.id === tabId);
      if (!currentTab) return;

      const currentPendingInsertions = currentTab.pendingInsertions || {};
      const insertion = currentPendingInsertions[tempId];
      if (!insertion) return;

      const newData = { ...insertion.data };
      if (value === undefined) {
        delete newData[colName];
      } else {
        newData[colName] = value;
      }

      const newPendingInsertions = {
        ...currentPendingInsertions,
        [tempId]: {
          ...insertion,
          data: newData,
        },
      };

      updateTab(tabId, { pendingInsertions: newPendingInsertions });
    },
    [updateTab],
  );

  const handleDiscardInsertion = useCallback(
    (tempId: string, tabIdArg?: string) => {
      const tabId = tabIdArg ?? activeTabIdRef.current;
      if (!tabId) return;
      const currentTab = tabsRef.current.find((t) => t.id === tabId);
      if (!currentTab?.pendingInsertions) return;

      const newPendingInsertions = { ...currentTab.pendingInsertions };
      delete newPendingInsertions[tempId];

      updateTab(tabId, { pendingInsertions: newPendingInsertions });
    },
    [updateTab],
  );

  const handleRevertDeletion = useCallback(
    (pkVal: unknown, tabIdArg?: string) => {
      const tabId = tabIdArg ?? activeTabIdRef.current;
      if (!tabId) return;
      const currentTab = tabsRef.current.find((t) => t.id === tabId);
      if (!currentTab?.pendingDeletions) return;

      const pkKey = serializePkKey(pkVal as Record<string, unknown>);
      const newPendingDeletions = { ...currentTab.pendingDeletions };
      delete newPendingDeletions[pkKey];

      updateTab(tabId, {
        pendingDeletions:
          Object.keys(newPendingDeletions).length > 0
            ? newPendingDeletions
            : undefined,
      });
    },
    [updateTab],
  );

  const handleMarkForDeletion = useCallback(
    (pkVal: unknown, tabIdArg?: string) => {
      const tabId = tabIdArg ?? activeTabIdRef.current;
      if (!tabId) return;
      const currentTab = tabsRef.current.find((t) => t.id === tabId);
      if (!currentTab) return;

      const pkKey = serializePkKey(pkVal as Record<string, unknown>);
      const currentPendingDeletions = currentTab.pendingDeletions || {};
      const newPendingDeletions = {
        ...currentPendingDeletions,
        [pkKey]: pkVal,
      };

      updateTab(tabId, { pendingDeletions: newPendingDeletions });
    },
    [updateTab],
  );

  const handleMarkMultipleForDeletion = useCallback(
    (pkVals: unknown[], tabIdArg?: string) => {
      const tabId = tabIdArg ?? activeTabIdRef.current;
      if (!tabId) return;
      const currentTab = tabsRef.current.find((t) => t.id === tabId);
      if (!currentTab) return;

      const newPendingDeletions = { ...(currentTab.pendingDeletions || {}) };
      for (const pkVal of pkVals) {
        newPendingDeletions[serializePkKey(pkVal as Record<string, unknown>)] = pkVal;
      }

      updateTab(tabId, { pendingDeletions: newPendingDeletions });
    },
    [updateTab],
  );

  const handleDuplicateRow = useCallback(
    (rowData: Record<string, unknown>, tabIdArg?: string) => {
      const tabId = tabIdArg ?? activeTabIdRef.current;
      if (!tabId) return;
      const currentTab = tabsRef.current.find((t) => t.id === tabId);
      if (!currentTab) return;

      const autoIncrementCols = currentTab.autoIncrementColumns ?? [];
      const data: Record<string, unknown> = { ...rowData };
      autoIncrementCols.forEach((col) => {
        data[col] = null;
      });

      const tempId = generateTempId();
      const currentPendingInsertions = currentTab.pendingInsertions || {};
      const existingRowCount = currentTab.result?.rows.length || 0;
      const insertionCount = Object.keys(currentPendingInsertions).length;
      const displayIndex = existingRowCount + insertionCount;

      updateTab(tabId, {
        pendingInsertions: {
          ...currentPendingInsertions,
          [tempId]: { tempId, data, displayIndex },
        },
      });
    },
    [updateTab],
  );

  const handleNewRow = useCallback(async () => {
    if (
      !activeTabIdRef.current ||
      !activeConnectionId ||
      !activeTab?.activeTable
    ) {
      console.warn("Cannot create new row: missing required context", {
        tabId: activeTabIdRef.current,
        connectionId: activeConnectionId,
        table: activeTab?.activeTable,
      });
      return;
    }

    try {
      // Fetch table columns
      const columns = await invoke<TableColumn[]>("get_columns", {
        connectionId: activeConnectionId,
        tableName: activeTab.activeTable,
        ...(activeSchema ? { schema: activeSchema } : {}),
      });

      if (!columns || columns.length === 0) {
        throw new Error("No columns found for table");
      }

      // Generate temp ID and initialize data
      const tempId = generateTempId();
      const data = initializeNewRow(columns);

      const currentPendingInsertions = activeTab.pendingInsertions || {};
      const existingRowCount = activeTab.result?.rows.length || 0;
      const insertionCount = Object.keys(currentPendingInsertions).length;

      // displayIndex will be calculated in DataGrid (existingRowCount + insertionIndex)
      const displayIndex = existingRowCount + insertionCount;

      const newPendingInsertions = {
        ...currentPendingInsertions,
        [tempId]: {
          tempId,
          data,
          displayIndex,
        },
      };

      const updates: Partial<Tab> = {
        pendingInsertions: newPendingInsertions,
      };

      // If activeTab.result is missing (e.g. empty table initially), initialize it
      // so DataGrid receives columns and can render the new row
      if (!activeTab.result) {
        updates.result = {
          columns: columns.map((c) => c.name),
          rows: [],
          affected_rows: 0,
          pagination: {
            page: 1,
            page_size: settings.resultPageSize || 100,
            total_rows: null,
            has_more: false,
          },
        };
      } else if (
        !activeTab.result.columns ||
        activeTab.result.columns.length === 0
      ) {
        // If result exists but has no columns, update it with columns
        updates.result = {
          ...activeTab.result,
          columns: columns.map((c) => c.name),
        };
      }

      // Ensure pkColumns and autoIncrementColumns are set
      if (!activeTab.pkColumns || activeTab.pkColumns.length === 0) {
        const pks = columns.filter((c) => c.is_pk).map((c) => c.name);
        if (pks.length > 0) {
          updates.pkColumns = pks;
        }
      }

      if (!activeTab.autoIncrementColumns) {
        const autoInc = columns
          .filter((c) => c.is_auto_increment)
          .map((c) => c.name);
        updates.autoIncrementColumns = autoInc;
      }

      if (!activeTab.defaultValueColumns) {
        const defaultVal = columns
          .filter(
            (c) => c.default_value !== undefined && c.default_value !== null,
          )
          .map((c) => c.name);
        updates.defaultValueColumns = defaultVal;
      }

      if (!activeTab.nullableColumns) {
        const nullable = columns
          .filter((c) => c.is_nullable)
          .map((c) => c.name);
        updates.nullableColumns = nullable;
      }

      if (!activeTab.columnMetadata) {
        updates.columnMetadata = columns;
      }

      updateTab(activeTabIdRef.current, updates);
    } catch (err) {
      console.error("Failed to create new row:", err);
      showAlert(t("editor.failedCreateRow") + String(err), {
        title: t("general.error"),
        kind: "error",
      });
    }
  }, [
    activeConnectionId,
    activeTab,
    updateTab,
    t,
    settings.resultPageSize,
    activeSchema,
    showAlert,
  ]);

  const handleSubmitChanges = useCallback(async (tabArg?: Tab, schemaArg?: string) => {
    // Defaults keep the main path identical; the split pane passes its own tab
    // and schema so it can save without becoming the active tab.
    const tab = tabArg ?? activeTab;
    const schema = schemaArg ?? activeSchema;
    if (!tab || !tab.activeTable || !activeConnectionId) return;

    // pkColumns is required for updates/deletions but not for insertions-only
    const hasPkColumns = !!(tab.pkColumns && tab.pkColumns.length > 0);

    const {
      pendingChanges,
      pendingDeletions,
      pendingInsertions,
      activeTable,
      pkColumns,
      selectedRows,
    } = tab;
    const updates: { pkVal: Record<string, unknown>; colName: string; newVal: unknown }[] = [];
    const deletions: Record<string, unknown>[] = [];
    const insertions: { tempId: string; data: Record<string, unknown> }[] = [];

    // Filter pending changes by selected rows IF there is a selection AND applyToAll is false
    const hasSelection = !applyToAll && selectedRows && selectedRows.length > 0;
    const selectedPkSet = new Set<string>();

    if (hasSelection && tab.result && hasPkColumns && pkColumns) {
      const pkIndices = pkColumns.map((c) => tab.result!.columns.indexOf(c));
      if (pkIndices.every((i) => i !== -1)) {
        selectedRows.forEach((rowIndex) => {
          const row = tab.result!.rows[rowIndex];
          if (row) selectedPkSet.add(serializePkKey(buildPkMap(pkColumns, row, pkIndices)));
        });
      }
    }

    if (hasPkColumns && pkColumns && pendingChanges) {
      for (const [pkKey, rowData] of Object.entries(pendingChanges)) {
        // Apply filter if selection exists (and applyToAll is false)
        if (hasSelection && !selectedPkSet.has(pkKey)) continue;

        const { pkOriginalValue, changes } = rowData;
        for (const [colName, newVal] of Object.entries(changes)) {
          updates.push({ pkVal: pkOriginalValue as Record<string, unknown>, colName, newVal });
        }
      }
    }

    if (hasPkColumns && pkColumns && pendingDeletions) {
      for (const [pkKey, pkVal] of Object.entries(pendingDeletions)) {
        // Apply filter if selection exists (and applyToAll is false)
        if (hasSelection && !selectedPkSet.has(pkKey)) continue;
        deletions.push(pkVal as Record<string, unknown>);
      }
    }

    // Process insertions
    if (pendingInsertions && Object.keys(pendingInsertions).length > 0) {
      try {
        // Fetch columns for validation
        const columns = await invoke<TableColumn[]>("get_columns", {
          connectionId: activeConnectionId,
          tableName: activeTable,
          ...(schema ? { schema } : {}),
        });

        const selectedDisplayIndices = new Set<number>();

        if (hasSelection && selectedRows) {
          // Convert selectedRows to displayIndices
          // Insertion rows are displayed AFTER existing rows
          selectedRows.forEach((rowIndex) => {
            selectedDisplayIndices.add(rowIndex);
          });
        }

        // Filter and validate insertions
        // Insertion rows have displayIndex = existingRowCount + insertionIndex
        const existingRowCount = tab.result?.rows.length || 0;
        let insertionIndex = 0;
        for (const [tempId, insertion] of Object.entries(pendingInsertions)) {
          // Check if this insertion is selected (if filtering by selection)
          const insertionDisplayIndex = existingRowCount + insertionIndex;
          if (
            hasSelection &&
            !selectedDisplayIndices.has(insertionDisplayIndex)
          ) {
            insertionIndex++;
            continue;
          }

          // Validate insertion
          const errors = validatePendingInsertion(insertion, columns);
          if (Object.keys(errors).length > 0) {
            // Skip invalid insertions (optionally show error to user)
            console.warn(`Skipping invalid insertion ${tempId}:`, errors);
            insertionIndex++;
            continue;
          }

          // Convert to backend format (auto-increment columns are automatically excluded)
          const backendData = insertionToBackendData(insertion, columns);

          insertions.push({ tempId, data: backendData });
          insertionIndex++;
        }
      } catch (err) {
        console.error("Failed to process insertions:", err);
        showAlert(t("editor.failedProcessInsertions") + String(err), {
          title: t("common.error"),
          kind: "error",
        });
        return;
      }
    }

    if (
      updates.length === 0 &&
      deletions.length === 0 &&
      insertions.length === 0
    )
      return;

    updateTab(tab.id, { isLoading: true });

    try {
      const promises = [];

      const databaseParam =
        isMultiDatabaseCapable(activeCapabilities) && tab?.schema
          ? { database: tab.schema }
          : {};

      // Deletions
      if (deletions.length > 0) {
        promises.push(
          ...deletions.map((pkMap) =>
            invoke("delete_record", {
              connectionId: activeConnectionId,
              table: activeTable,
              pkMap,
              ...(schema ? { schema } : {}),
              ...databaseParam,
            }),
          ),
        );
      }

      // Updates
      if (updates.length > 0) {
        promises.push(
          ...updates.map((u) =>
            invoke("update_record", {
              connectionId: activeConnectionId,
              table: activeTable,
              pkMap: u.pkVal,
              colName: u.colName,
              newVal: u.newVal,
              ...(schema ? { schema } : {}),
              ...databaseParam,
            }),
          ),
        );
      }

      // Insertions
      if (insertions.length > 0) {
        promises.push(
          ...insertions.map((insertion) =>
            invoke("insert_record", {
              connectionId: activeConnectionId,
              table: activeTable,
              data: insertion.data,
              ...(schema ? { schema } : {}),
              ...databaseParam,
            }),
          ),
        );
      }

      await Promise.all(promises);

      // Remove processed changes from state
      const newPendingChanges = { ...(pendingChanges || {}) };
      const newPendingDeletions = { ...(pendingDeletions || {}) };
      const newPendingInsertions = { ...(pendingInsertions || {}) };

      // Partial cleanup - remove only processed changes
      updates.forEach((u) => delete newPendingChanges[serializePkKey(u.pkVal)]);
      deletions.forEach((d) => delete newPendingDeletions[serializePkKey(d as Record<string, unknown>)]);
      insertions.forEach((i) => delete newPendingInsertions[i.tempId]);

      // Cleanup empty change objects
      Object.keys(newPendingChanges).forEach((key) => {
        if (Object.keys(newPendingChanges[key]?.changes || {}).length === 0)
          delete newPendingChanges[key];
      });

      const remainingChanges =
        Object.keys(newPendingChanges).length > 0
          ? newPendingChanges
          : undefined;
      const remainingDeletions =
        Object.keys(newPendingDeletions).length > 0
          ? newPendingDeletions
          : undefined;
      const remainingInsertions =
        Object.keys(newPendingInsertions).length > 0
          ? newPendingInsertions
          : undefined;

      // Refresh query preserving remaining pending changes
      runQuery(
        tab.query,
        tab.page,
        tab.id,
        undefined,
        undefined,
        undefined,
        undefined,
        {
          pendingChanges: remainingChanges,
          pendingDeletions: remainingDeletions,
          pendingInsertions: remainingInsertions,
        },
      );
    } catch (e) {
      console.error("Batch update failed", e);
      updateTab(tab.id, { isLoading: false });
      showAlert(t("dataGrid.updateFailed") + String(e), {
        title: t("common.error"),
        kind: "error",
      });
    }
  }, [
    activeTab,
    activeConnectionId,
    updateTab,
    runQuery,
    t,
    applyToAll,
    activeSchema,
    activeCapabilities,
    showAlert,
  ]);

  // Cmd/Ctrl+S: commit the active tab's pending grid changes (like TablePlus).
  useEffect(() => {
    const focused = isFocusedPane(explorerConnectionId, activeConnectionId);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!focused) return;
      if (matchesShortcut(e, "save_grid_changes")) {
        e.preventDefault();
        if (hasPendingChanges) handleSubmitChanges();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    explorerConnectionId,
    activeConnectionId,
    matchesShortcut,
    hasPendingChanges,
    handleSubmitChanges,
  ]);

  const handleParamsSubmit = useCallback(
    (values: Record<string, string>) => {
      const { pendingTabId, mode, sql, pendingPageNum, pendingMultiQueries } =
        queryParamsModal;
      if (!pendingTabId) return;

      // Update tab with new params (merge with existing)
      const currentTab = tabsRef.current.find((t) => t.id === pendingTabId);
      const newParams = { ...(currentTab?.queryParams || {}), ...values };

      updateTab(pendingTabId, { queryParams: newParams });

      // Close modal
      setQueryParamsModal((prev) => ({ ...prev, isOpen: false }));

      // If mode was run, execute query immediately
      if (mode === "run") {
        if (pendingMultiQueries) {
          runMultipleQueries(pendingMultiQueries, newParams);
        } else {
          runQuery(sql, pendingPageNum, pendingTabId, newParams);
        }
      }
    },
    [queryParamsModal, updateTab, runQuery, runMultipleQueries],
  );

  const handleEditParams = useCallback(() => {
    if (!activeTab || !activeTab.query) return;

    const params = extractQueryParams(activeTab.query);
    if (params.length === 0) return;

    setQueryParamsModal({
      isOpen: true,
      sql: activeTab.query,
      parameters: params,
      pendingPageNum: 1,
      pendingTabId: activeTab.id,
      mode: "save",
    });
  }, [activeTab]);

  const handleRollbackChanges = useCallback(() => {
    if (!activeTab) return;
    const {
      selectedRows,
      result,
      pkColumns,
      pendingChanges,
      pendingDeletions,
      pendingInsertions,
    } = activeTab;

    // If applyToAll is true OR no selection, rollback everything
    if (applyToAll || !selectedRows || selectedRows.length === 0) {
      updateActiveTab({
        pendingChanges: undefined,
        pendingDeletions: undefined,
        pendingInsertions: undefined,
      });
      return;
    }

    // Filter rollback by selection
    const selectedPkSet = new Set<string>();
    const selectedDisplayIndices = new Set<number>();

    // Add all selected row indices to the set
    selectedRows.forEach((rowIndex) => {
      selectedDisplayIndices.add(rowIndex);
    });

    // For existing rows, also collect their PK values
    if (result && pkColumns && pkColumns.length > 0) {
      const pkIndices = pkColumns.map((c) => result.columns.indexOf(c));
      if (pkIndices.every((i) => i !== -1)) {
        selectedRows.forEach((rowIndex) => {
          const row = result.rows[rowIndex];
          if (row) selectedPkSet.add(serializePkKey(buildPkMap(pkColumns, row, pkIndices)));
        });
      }
    }

    const newPendingChanges = { ...(pendingChanges || {}) };
    const newPendingDeletions = { ...(pendingDeletions || {}) };
    const newPendingInsertions = { ...(pendingInsertions || {}) };

    // Rollback changes and deletions (for existing rows)
    selectedPkSet.forEach((pk) => {
      delete newPendingChanges[pk];
      delete newPendingDeletions[pk];
    });

    // Rollback insertions (for new rows)
    // Insertion rows are displayed AFTER existing rows, so their displayIndex = existingRowCount + insertionIndex
    const existingRowCount = result?.rows.length || 0;
    let insertionIndex = 0;
    for (const tempId of Object.keys(newPendingInsertions)) {
      const insertionDisplayIndex = existingRowCount + insertionIndex;
      if (selectedDisplayIndices.has(insertionDisplayIndex)) {
        delete newPendingInsertions[tempId];
      }
      insertionIndex++;
    }

    updateActiveTab({
      pendingChanges:
        Object.keys(newPendingChanges).length > 0
          ? newPendingChanges
          : undefined,
      pendingDeletions:
        Object.keys(newPendingDeletions).length > 0
          ? newPendingDeletions
          : undefined,
      pendingInsertions:
        Object.keys(newPendingInsertions).length > 0
          ? newPendingInsertions
          : undefined,
    });
  }, [activeTab, updateActiveTab, applyToAll]);

  const handleEditorMount = (
    editor: Parameters<OnMount>[0],
    monaco: Monaco,
    tabId: string,
  ) => {
    editorsRef.current[tabId] = editor;
    setMonacoInstance(monaco);
    // Focus the editor when a console tab is opened (Ctrl+T / new console)
    const mountedTab = tabsRef.current.find((t) => t.id === tabId);
    if (mountedTab?.type === "console") editor.focus();
    editor.addAction({
      id: "run-selection",
      label: "Execute Selection",
      contextMenuGroupId: "navigation",
      contextMenuOrder: 1.5,
      run: (ed) => {
        const selection = ed.getSelection();
        const selectedText = selection && !selection.isEmpty()
          ? ed.getModel()?.getValueInRange(selection)
          : undefined;
        const text = (selectedText || ed.getValue()).trim();
        if (!text) return;
        const queries = splitQueries(text, activeDialectRef.current);
        if (queries.length > 1) {
          runMultipleQueriesRef.current(queries);
        } else {
          runQueryRef.current(queries[0] || text, 1);
        }
      },
    });
    editor.addAction({
      id: "explain-selection",
      label: t("editor.visualExplain.contextMenuExplain"),
      contextMenuGroupId: "navigation",
      contextMenuOrder: 1.6,
      run: (ed) => {
        const selection = ed.getSelection();
        const selectedText = selection && !selection.isEmpty()
          ? ed.getModel()?.getValueInRange(selection)
          : undefined;
        const text = (selectedText || ed.getValue()).trim();
        if (!text) return;
        const explainable = getExplainableQueries(text, activeDialectRef.current);
        if (explainable.length === 0) {
          openExplainForQueryRef.current(text);
        } else if (explainable.length === 1) {
          openExplainForQueryRef.current(explainable[0].query);
        } else {
          setExplainSelectableQueries(explainable);
          setIsExplainSelectionOpen(true);
        }
      },
    });
  };

  useEffect(() => {
    const state = location.state as EditorState;
    if (activeConnectionId) {
      if (state?.initialQuery !== undefined) {
        if (
          state.targetConnectionId &&
          state.targetConnectionId !== activeConnectionId
        )
          return;

        const queryKey = `${state.initialQuery}-${state.tableName}-${state.queryName}-${state.schema}-${state.title}-${state.splitRight ? "split" : "main"}`;

        if (processingRef.current === queryKey) {
          // If re-navigating to the same definition with readOnly, patch any
          // existing tab that was opened without the flag (e.g. before the fix).
          if (state.readOnly) {
            const title = state.queryName || state.tableName || "";
            const existing = tabsRef.current.find(
              (t) => t.connectionId === activeConnectionId && t.title === title,
            );
            if (existing) updateTab(existing.id, { readOnly: true });
          }
          return;
        }
        processingRef.current = queryKey;

        const {
          initialQuery: sql,
          tableName: table,
          queryName,
          preventAutoRun,
          readOnly: navReadOnly,
          materialized: navMaterialized,
          schema: navSchema,
          title: navTitle,
          splitRight,
        } = state;
        const tabId = addTab({
          type: table ? "table" : "console",
          title: navTitle || queryName || table || t("sidebar.newConsole"),
          query: sql,
          activeTable: table,
          schema: navSchema,
          readOnly: navReadOnly,
          materialized: navMaterialized,
        });

        if (splitRight && tabId) {
          setSplitOrientation("horizontal");
          if (!splitTabIds.includes(tabId)) {
            togglePin(tabId);
          } else {
            setActiveSplitTabId(tabId);
          }
        }

        if (tabId && !preventAutoRun) {
          // Queue execution only if not prevented
          pendingExecutionsRef.current[tabId] = { sql: sql || "", page: 1 };

          // Try immediate execution if tab exists (reused)
          const existingTab = tabsRef.current.find((t) => t.id === tabId);
          if (existingTab) {
            runQuery(sql, 1, tabId);
            delete pendingExecutionsRef.current[tabId];
          }
        }

        navigate(location.pathname, { replace: true, state: {} });
        setTimeout(() => {
          processingRef.current = null;
        }, 500);
      }
    }
  }, [
    location.state,
    location.pathname,
    activeConnectionId,
    addTab,
    updateTab,
    navigate,
    runQuery,
    t,
  ]);

  // Process pending executions when tabs are created/updated
  useEffect(() => {
    Object.keys(pendingExecutionsRef.current).forEach((tabId) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (tab) {
        const { sql, page } = pendingExecutionsRef.current[tabId];
        runQuery(sql, page, tabId);
        delete pendingExecutionsRef.current[tabId];
      }
    });
  }, [tabs, runQuery]);

  const startResize = () => {
    isDragging.current = true;
    document.body.style.cursor = "row-resize";

    // Overlay prevents CodeMirror from capturing mouse events during drag
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:9999;cursor:row-resize";
    document.body.appendChild(overlay);

    const panels = document.querySelectorAll<HTMLElement>("[data-editor-panel]");

    const handleResize = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const newHeight = e.clientY - 50;
      if (newHeight > 100 && newHeight < window.innerHeight - 150) {
        editorHeightRef.current = newHeight;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          panels.forEach((el) => {
            el.style.height = `${newHeight}px`;
          });
        });
      }
    };
    const stopResize = () => {
      isDragging.current = false;
      document.body.style.cursor = "";
      overlay.remove();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      setEditorHeight(editorHeightRef.current);
      document.removeEventListener("mousemove", handleResize);
      document.removeEventListener("mouseup", stopResize);
    };
    document.addEventListener("mousemove", handleResize);
    document.addEventListener("mouseup", stopResize);
  };

  // Drag on the split divider — resizes the pane widths (horizontal) or heights (vertical).
  const startSplitResize = () => {
    const container = workspaceRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const isVertical = splitOrientation === "vertical";
    const cursorType = isVertical ? "row-resize" : "col-resize";
    document.body.style.cursor = cursorType;
    document.body.style.userSelect = "none";
    const overlay = document.createElement("div");
    overlay.style.cssText = `position:fixed;inset:0;z-index:9999;cursor:${cursorType}`;
    document.body.appendChild(overlay);

    const onMove = (e: MouseEvent) => {
      if (isVertical) {
        setSplitRatio(splitRatioFromClientY(e.clientY, rect.top, rect.height));
      } else {
        setSplitRatio(splitRatioFromClientX(e.clientX, rect.left, rect.width));
      }
    };
    const onUp = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      overlay.remove();
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const cancelExport = useCallback(async () => {
    if (!activeConnectionId) return;
    try {
      await invoke("cancel_export", { connectionId: activeConnectionId });
      setExportState((prev) => ({
        ...prev,
        isOpen: false,
      }));
    } catch (e) {
      console.error("Failed to cancel export", e);
    }
  }, [activeConnectionId]);

  const closeExportModal = useCallback(() => {
    setExportState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const handleExportCommon = async (format: "csv" | "json") => {
    if (!activeTab || !activeConnectionId) return;

    const effectiveSchema =
      activeCapabilities?.schemas === true ? activeTab.schema : undefined;
    const tabForQuery = { ...activeTab, schema: effectiveSchema };
    const query =
      activeTab.type === "table" && activeTab.activeTable
        ? reconstructTableQuery(tabForQuery, activeDriver ?? undefined)
        : activeTab.query;

    if (!query || !query.trim()) return;

    try {
      const filePath = await save({
        filters: [{ name: format.toUpperCase(), extensions: [format] }],
        defaultPath: `result_${Date.now()}.${format}`,
      });

      if (!filePath) return;

      setExportState({
        isOpen: true,
        status: "exporting",
        rowsProcessed: 0,
        fileName: filePath.split(/[/\\]/).pop() || filePath, // Show only filename
      });
      setExportMenuOpen(false);

      // On multi-database connections (e.g. MySQL) scope the export to the
      // selected database so the query runs against the database the user is
      // viewing rather than the connection's primary database. The tab may not
      // carry its own schema (e.g. a console query), so fall back to the active
      // database — mirroring how execute_query resolves the schema.
      const targetDatabase = activeTab?.schema ?? activeSchema ?? undefined;
      const databaseParam =
        isMultiDatabaseCapable(activeCapabilities) && targetDatabase
          ? { database: targetDatabase }
          : {};

      await invoke("export_query_to_file", {
        connectionId: activeConnectionId,
        query,
        filePath,
        format,
        csvDelimiter: format === "csv" ? csvDelimiter : undefined,
        ...databaseParam,
      });

      // Success: update modal state instead of showing toast
      setExportState((prev) => ({
        ...prev,
        status: "completed",
      }));
    } catch (e) {
      // Error: update modal state
      setExportState((prev) => ({
        ...prev,
        status: "error",
        errorMessage: String(e),
      }));
    }
  };

  const handleExportCSV = () => handleExportCommon("csv");
  const handleExportJSON = () => handleExportCommon("json");

  const handleExportExcel = async () => {
    if (!activeTab?.result) return;
    const { columns, rows } = activeTab.result;
    if (!columns.length || !rows.length) return;

    setExportMenuOpen(false);
    try {
      const defaultName = activeTab.title
        ? `${activeTab.title.replace(/[^a-zA-Z0-9_\-\u00C0-\u024F\u1EA0-\u1EF9]/g, "_")}_${Date.now()}.xlsx`
        : `result_${Date.now()}.xlsx`;

      const savedPath = await exportQueryResultToExcel({
        columns,
        rows,
        defaultFileName: defaultName,
        sheetName: activeTab.title ? activeTab.title.slice(0, 31) : "Results",
      });

      if (savedPath) {
        showAlert(t("common.saved", { defaultValue: "Đã xuất file Excel thành công!" }), {
          kind: "info",
        });
      }
    } catch (err) {
      console.error("Export Excel error:", err);
      showAlert(String(err), { kind: "error" });
    }
  };

  const handleRunDropdownToggle = useCallback(() => {
    if (!isRunDropdownOpen) {
      // Monaco Editor: split queries from editor
      if (activeTab?.type !== "query_builder" && activeTab) {
        const editor = editorsRef.current[activeTab.id];
        if (editor) {
          const selection = editor.getSelection();
          const selectedText = selection
            ? editor.getModel()?.getValueInRange(selection)
            : undefined;

          if (selectedText && selection && !selection.isEmpty()) {
            const queries = splitQueries(selectedText, activeDialect);
            setSelectableQueries(queries);
          } else {
            const text = editor.getValue();
            const queries = splitQueries(text, activeDialect);
            setSelectableQueries(queries);
          }
        } else if (activeTab.query?.trim()) {
          // Fallback: use saved query when editor ref is not available
          const queries = splitQueries(activeTab.query, activeDialect);
          setSelectableQueries(queries);
        }
      }
    }
    setIsRunDropdownOpen((prev) => !prev);
  }, [isRunDropdownOpen, activeTab, activeDialect]);

  const handleStartTransaction = useCallback(async () => {
    if (!activeConnectionId) return;
    try {
      const sql = activeDriver === "postgres" || activeDriver === "sqlite" ? "BEGIN;" : "START TRANSACTION;";
      await runQuery(sql, 1);
      setIsTransactionActive(true);
      showAlert(t("editor.transactionStarted", { defaultValue: "Đã bắt đầu Giao dịch (Transaction) mới." }), {
        title: "Transaction",
        kind: "info",
      });
    } catch (e) {
      showAlert(String(e), { title: "Transaction Error", kind: "error" });
    }
  }, [activeConnectionId, activeDriver, runQuery, showAlert, t]);

  const handleCommitTransaction = useCallback(async () => {
    if (!activeConnectionId) return;
    try {
      await runQuery("COMMIT;", 1);
      setIsTransactionActive(false);
      showAlert(t("editor.transactionCommitted", { defaultValue: "Đã COMMIT giao dịch thành công!" }), {
        title: "Transaction",
        kind: "info",
      });
    } catch (e) {
      showAlert(String(e), { title: "Commit Error", kind: "error" });
    }
  }, [activeConnectionId, runQuery, showAlert, t]);

  const handleRollbackTransaction = useCallback(async () => {
    if (!activeConnectionId) return;
    try {
      await runQuery("ROLLBACK;", 1);
      setIsTransactionActive(false);
      showAlert(t("editor.transactionRolledBack", { defaultValue: "Đã ROLLBACK hoàn tác giao dịch." }), {
        title: "Transaction",
        kind: "info",
      });
    } catch (e) {
      showAlert(String(e), { title: "Rollback Error", kind: "error" });
    }
  }, [activeConnectionId, runQuery, showAlert, t]);

  const handleInsertSqlTemplate = useCallback(
    (templateSql: string) => {
      if (!activeTab) return;
      const editor = editorsRef.current[activeTab.id];
      if (editor) {
        const selection = editor.getSelection();
        const model = editor.getModel();
        if (selection && model) {
          editor.executeEdits("tabularis.insertTemplate", [
            {
              range: selection,
              text: templateSql,
              forceMoveMarkers: true,
            },
          ]);
          editor.pushUndoStop();
          editor.focus();
          return;
        }
      }
      // Fallback: append to tab query if editor ref is not yet mounted
      const currentQuery = activeTab.query || "";
      const newQuery = currentQuery.trim()
        ? `${currentQuery}\n\n${templateSql}`
        : templateSql;
      updateTab(activeTab.id, { query: newQuery });
    },
    [activeTab, updateTab],
  );

  useEffect(() => {
    const handleOpenTemplates = () => {
      setIsSqlTemplatesOpen(true);
    };
    const handleOpenHistory = () => {
      setIsQueryHistoryOpen(true);
    };
    window.addEventListener("tabularis:open-sql-templates", handleOpenTemplates);
    window.addEventListener("tabularis:open-query-history", handleOpenHistory);
    const handleOpenMockData = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.tableName) {
        setMockDataModal({ isOpen: true, tableName: detail.tableName, schema: detail.schema });
      }
    };
    const handleOpenSchemaDiff = () => {
      setIsSchemaDiffOpen(true);
    };
    window.addEventListener("tabularis:open-mock-data", handleOpenMockData);
    window.addEventListener("tabularis:open-schema-diff", handleOpenSchemaDiff);
    const handleOpenTeamSync = () => setIsTeamSyncOpen(true);
    const handleOpenExplainDiffEvent = () => handleOpenExplainDiff();
    window.addEventListener("tabularis:open-team-sync", handleOpenTeamSync);
    window.addEventListener("tabularis:open-explain-diff", handleOpenExplainDiffEvent);
    return () => {
      window.removeEventListener("tabularis:open-sql-templates", handleOpenTemplates);
      window.removeEventListener("tabularis:open-query-history", handleOpenHistory);
      window.removeEventListener("tabularis:open-mock-data", handleOpenMockData);
      window.removeEventListener("tabularis:open-schema-diff", handleOpenSchemaDiff);
      window.removeEventListener("tabularis:open-team-sync", handleOpenTeamSync);
      window.removeEventListener("tabularis:open-explain-diff", handleOpenExplainDiffEvent);
    };
  }, []);

  if (!activeTab) {
    return (
      <div className="flex flex-col h-full bg-base items-center justify-center text-muted">
        <Database size={48} className="mb-4 opacity-20" />
        {activeConnectionId ? (
          <div className="text-center">
            <p className="mb-4">{t("editor.noTabs")}</p>
            <button
              onClick={() => addTab({ type: "console" })}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
            >
              {t("editor.newConsole")}
            </button>
          </div>
        ) : (
          <p>{t("editor.noActiveSession")}</p>
        )}
      </div>
    );
  }

  const activeConnection = connections.find((c) => c.id === activeConnectionId);
  const tabBarAccent = activeConnectionId
    ? getConnectionAccent(
        activeConnection,
        allDrivers.find((d) => d.id === activeDriver),
      )
    : null;
  // Active-tab accents (indicator line, loading bar, rename border) follow the
  // connection color when present, falling back to the default blue otherwise.
  const tabAccentColor = tabBarAccent ?? "#3b82f6";

  return (
    <div className="flex flex-col h-full bg-base">
      <div
        ref={workspaceRef}
        className={clsx(
          "flex flex-1 min-h-0 min-w-0",
          splitTab && splitOrientation === "vertical" ? "flex-col" : "flex-row",
        )}
      >
        <div
          className="flex flex-col min-w-0 min-h-0"
          style={
            splitTab
              ? {
                  [splitOrientation === "vertical" ? "height" : "width"]: `${splitRatio * 100}%`,
                  flexShrink: 0,
                }
              : { width: "100%", height: "100%", flex: 1 }
          }
        >
      {/* Tab Bar — tinted with the active connection's accent color */}
      <div
        className="flex items-center bg-elevated border-b border-default h-9 shrink-0"
        style={
          tabBarAccent
            ? {
                // Vertical accent wash (stronger at top) + accent-tinted bottom
                // border so the bar reads as part of the active connection.
                backgroundImage: `linear-gradient(${tabBarAccent}30, ${tabBarAccent}20)`,
                borderBottomColor: `${tabBarAccent}50`,
              }
            : undefined
        }
      >
        <button
          onClick={() => scrollTabs("left")}
          disabled={!canScrollLeft}
          className="flex items-center justify-center w-7 h-full text-muted border-r border-default shrink-0 transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:enabled:text-primary hover:enabled:bg-surface-secondary"
        >
          <ChevronLeft size={14} />
        </button>
        <button
          onClick={() => scrollTabs("right")}
          disabled={!canScrollRight}
          className="flex items-center justify-center w-7 h-full text-muted border-r border-default shrink-0 transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:enabled:text-primary hover:enabled:bg-surface-secondary"
        >
          <ChevronRight size={14} />
        </button>
        <div
          ref={tabScrollRef}
          onScroll={updateScrollArrows}
          className="flex flex-1 overflow-x-auto no-scrollbar h-full"
        >
          {leftTabs.map((tab) => (
            <div
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              onContextMenu={(e) => handleTabContextMenu(e, tab.id)}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  handleCloseTab(tab.id);
                }
              }}
              className={clsx(
                "flex items-center gap-2 px-3 h-full border-r border-default cursor-pointer min-w-[140px] max-w-[220px] text-xs transition-all duration-150 group relative select-none",
                activeTabId === tab.id
                  ? "bg-base text-primary font-medium"
                  : "text-muted hover:bg-[var(--tab-hover)] hover:text-secondary",
              )}
              style={
                activeTabId === tab.id
                  ? {
                      // Active tab keeps the content background (so it reads as
                      // connected to the pane below) but carries a soft accent
                      // body, stronger at the top, tinted by the connection.
                      backgroundImage: `linear-gradient(${tabAccentColor}30, ${tabAccentColor}20)`,
                    }
                  : // Inactive tabs pick up a soft accent wash on hover instead of
                    // a flat neutral grey, keeping the strip tied to the connection.
                    ({ "--tab-hover": `${tabAccentColor}33` } as React.CSSProperties)
              }
            >
              {activeTabId === tab.id && (
                <div
                  className="absolute top-0 left-0 right-0 h-[2px] rounded-b-sm"
                  style={{
                    backgroundColor: `${tabAccentColor}cc`,
                    boxShadow: `0 0 5px ${tabAccentColor}59`,
                  }}
                />
              )}
              {tab.type === "table" ? (
                <TableIcon size={12} className="text-accent shrink-0" />
              ) : tab.type === "query_builder" ? (
                <Network size={12} className="text-accent-secondary shrink-0" />
              ) : tab.type === "notebook" ? (
                <BookOpen size={12} className="text-orange-400 shrink-0" />
              ) : (
                <FileCode size={12} className="text-accent-secondary shrink-0" />
              )}
              {editingTabId === tab.id ? (
                <input
                  type="text"
                  value={editingTabTitle}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setEditingTabTitle(e.target.value)}
                  onBlur={commitTabRename}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") commitTabRename();
                    if (e.key === "Escape") setEditingTabId(null);
                  }}
                  className="flex-1 min-w-0 bg-surface-secondary border rounded px-1 py-0.5 text-xs text-primary focus:outline-none"
                  style={{ borderColor: `${tabAccentColor}80` }}
                />
              ) : (
                <span
                  className="truncate flex-1 flex items-center gap-1"
                  onDoubleClick={
                    canRenameTab(tab.type)
                      ? (e) => {
                          e.stopPropagation();
                          startTabRename(tab.id);
                        }
                      : undefined
                  }
                >
                  <span className="truncate select-text cursor-text">{tab.title}</span>
                  {tab.type === "console" && isMultiDb && (
                    <span className="text-muted shrink-0">
                      ({tab.schema || selectedDatabases[0]})
                    </span>
                  )}
                </span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCloseTab(tab.id);
                }}
                className={clsx(
                  "p-0.5 rounded hover:bg-surface-secondary hover:text-primary hover:scale-110 transition-all duration-150 shrink-0",
                  activeTabId === tab.id
                    ? "opacity-100"
                    : "opacity-0 group-hover:opacity-100",
                )}
              >
                <X size={12} />
              </button>
              {tab.isLoading && (
                <div
                  className="absolute bottom-0 left-0 h-0.5 w-full animate-pulse"
                  style={{
                    backgroundImage: `linear-gradient(90deg, transparent, ${tabAccentColor}, transparent)`,
                  }}
                />
              )}
            </div>
          ))}
        </div>
        <button
          onClick={() =>
            addTab({
              type: "console",
              ...(isMultiDb ? { schema: selectedDatabases[0] } : {}),
            })
          }
          className="flex items-center justify-center w-9 h-full text-muted hover:text-primary hover:bg-surface-secondary border-l border-default transition-colors shrink-0"
          title={t("editor.newConsole")}
        >
          <Plus size={16} />
        </button>
        <button
          onClick={() => addTab({ type: "query_builder" })}
          className="flex items-center justify-center w-9 h-full text-purple-500 hover:text-primary hover:bg-surface-secondary border-l border-default transition-colors shrink-0"
          title={t("editor.newVisualQuery")}
        >
          <Network size={16} />
        </button>
        <button
          onClick={async () => {
            if (!activeConnectionId) return;
            const title = "Notebook";
            const { notebookId } = await createNotebook(title, activeConnectionId);
            addTab({
              type: "notebook",
              notebookId,
              ...(isMultiDb ? { schema: selectedDatabases[0] } : {}),
            });
          }}
          className="flex items-center justify-center w-9 h-full text-orange-400 hover:text-primary hover:bg-surface-secondary border-l border-default transition-colors shrink-0"
          title={t("editor.newNotebook")}
        >
          <BookOpen size={16} />
        </button>
      </div>

      {/* Toolbar — hidden for notebook tabs */}
      {!isNotebookTab && <div className="flex items-center py-2 pl-2 pr-3 border-b border-default bg-elevated gap-2 h-[50px]">
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
              onClick={handleRunButton}
              disabled={!activeConnectionId}
              aria-label={`${t("editor.run")} (${isMac ? "Cmd+Enter" : "Ctrl+Enter"})`}
              aria-keyshortcuts={isMac ? "Meta+Enter" : "Control+Enter"}
              title={`${t("editor.run")} (${isMac ? "Cmd+Enter" : "Ctrl+Enter"})`}
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
                  onClick={handleRunDropdownToggle}
                  disabled={!activeConnectionId}
                  className="px-1.5 py-1.5 text-white rounded-r hover:bg-green-600 disabled:opacity-50"
                >
                  <ChevronDown size={14} />
                </button>

                {isRunDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setIsRunDropdownOpen(false)}
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
                                runQuery(q, 1);
                                setIsRunDropdownOpen(false);
                              }}
                              className="text-left px-4 py-2 text-xs font-mono text-secondary hover:text-white flex-1 truncate"
                              title={q}
                            >
                              {label}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsRunDropdownOpen(false);
                                setSaveQueryModal({ isOpen: true, sql: q });
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
            onClick={handleEditParams}
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
            onClick={() => setExportMenuOpen(!exportMenuOpen)}
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
                onClick={() => setExportMenuOpen(false)}
              />
              <div
                role="menu"
                className="absolute top-full right-0 mt-1 w-44 bg-elevated border border-strong rounded-md shadow-xl z-50 flex flex-col py-1 overflow-hidden"
              >
                <button
                  role="menuitem"
                  onClick={handleExportExcel}
                  className="flex items-center gap-2.5 text-left px-3 py-2 text-sm text-secondary hover:bg-blue-500/15 hover:text-blue-400 transition-colors"
                >
                  <FileSpreadsheet size={14} className="shrink-0 text-emerald-400 opacity-90" />
                  <span className="flex-1 font-medium">Excel</span>
                  <span className="text-xs text-muted">.xlsx</span>
                </button>
                <button
                  role="menuitem"
                  onClick={handleExportCSV}
                  className="flex items-center gap-2.5 text-left px-3 py-2 text-sm text-secondary hover:bg-blue-500/15 hover:text-blue-400 transition-colors"
                >
                  <FileText size={14} className="shrink-0 opacity-80" />
                  <span className="flex-1">CSV</span>
                  <span className="text-xs text-muted">.csv</span>
                </button>
                <button
                  role="menuitem"
                  onClick={handleExportJSON}
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
              <span className="max-w-[120px] truncate">
                {activeTab.schema || selectedDatabases[0]}
              </span>
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
                        updateActiveTab({ schema: db });
                        setIsDbDropdownOpen(false);
                      }}
                      className={clsx(
                        "text-left px-3 py-1.5 text-xs hover:bg-surface transition-colors flex items-center gap-2",
                        (activeTab.schema || selectedDatabases[0]) === db
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
      </div>}

      {/* Render all non-table tabs to prevent Monaco remounting */}
      {leftTabs.map((tab) => {
        if (tab.type === "table") return null;

        const isActive = tab.id === activeTabId;

        // Notebook tabs get full-height rendering
        if (tab.type === "notebook") {
          return (
            <div
              key={tab.id}
              style={{ display: isActive ? "flex" : "none" }}
              className="flex-1 flex flex-col min-h-0 overflow-hidden"
            >
              <NotebookView
                tab={tab}
                updateTab={updateTab}
                connectionId={activeConnectionId || ""}
                isActive={isActive}
              />
            </div>
          );
        }

        const isVisible = isActive && !isTableTab && isEditorOpen;

        return (
          <div
            key={tab.id}
            data-editor-panel
            style={{
              height: isResultsCollapsed ? "calc(100vh - 109px)" : editorHeight,
              display: isVisible ? "block" : "none",
            }}
            className="relative"
          >
            {tab.type === "query_builder" ? (
              <VisualQueryBuilder />
            ) : (
              <SqlEditorWrapper
                height="100%"
                dialect={activeDialect}
                initialValue={tab.query}
                connectionId={activeConnectionId}
                tables={effectiveTables}
                schema={activeSchema}
                onChange={(val) => {
                  if (isActive) updateTab(tab.id, { query: val });
                }}
                onRun={handleRunButton}
                onMount={
                  isActive
                    ? (editor, monaco) =>
                        handleEditorMount(editor, monaco, tab.id)
                    : undefined
                }
                editorKey={tab.id}
                options={{
                  padding: { top: 16, bottom: 40 },
                }}
              />
            )}

            {/* Editor overlay buttons — bottom-right */}
            {tab.type !== "query_builder" && (
              <div className="absolute bottom-2 right-6 z-10 flex items-center gap-1">
                {/* Visual Explain — hidden for read-only definition tabs */}
                {!tab.readOnly && (
                <button
                  onClick={handleExplainButton}
                  disabled={!activeConnectionId || !tab.query?.trim()}
                  className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-muted hover:text-green-300 bg-elevated/80 hover:bg-green-900/40 border border-default hover:border-green-500/40 transition-all disabled:opacity-30 disabled:pointer-events-none backdrop-blur-sm"
                  title={t("editor.visualExplain.title")}
                >
                  <Network size={12} />
                  {t("editor.visualExplain.buttonShort")}
                </button>
                )}
                {/* SQL Templates button (Ctrl+J) */}
                {!tab.readOnly && (
                  <button
                    onClick={() => setIsSqlTemplatesOpen(true)}
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-muted hover:text-blue-300 bg-elevated/80 hover:bg-blue-900/40 border border-default hover:border-blue-500/40 transition-all backdrop-blur-sm shadow-sm"
                    title={t("editor.sqlTemplates.tooltip", { defaultValue: "Mẫu SQL & Snippets (Ctrl+J)" })}
                  >
                    <Zap size={12} className="text-amber-400" />
                    <span>{t("editor.sqlTemplates.button", { defaultValue: "Mẫu SQL" })}</span>
                    <span className="text-[10px] text-muted opacity-80 font-mono">Ctrl+J</span>
                  </button>
                )}
                {/* Query History button (Ctrl+H) */}
                {!tab.readOnly && (
                  <button
                    onClick={() => setIsQueryHistoryOpen(true)}
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-muted hover:text-purple-300 bg-elevated/80 hover:bg-purple-900/40 border border-default hover:border-purple-500/40 transition-all backdrop-blur-sm shadow-sm"
                    title={t("editor.queryHistory.tooltip", { defaultValue: "Lịch sử truy vấn SQL (Ctrl+H)" })}
                  >
                    <History size={12} className="text-purple-400" />
                    <span>{t("editor.queryHistory.button", { defaultValue: "Lịch sử" })}</span>
                    <span className="text-[10px] text-muted opacity-80 font-mono">Ctrl+H</span>
                  </button>
                )}
                                {/* Format SQL button (Ctrl+Alt+F) */}
                {!tab.readOnly && (
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent("tabularis:format-sql"))}
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-muted hover:text-emerald-300 bg-elevated/80 hover:bg-emerald-900/40 border border-default hover:border-emerald-500/40 transition-all backdrop-blur-sm shadow-sm"
                    title={t("editor.formatSql.tooltip", { defaultValue: "Định dạng câu truy vấn SQL (Ctrl+Alt+F)" })}
                  >
                    <Wand2 size={12} className="text-emerald-400" />
                    <span>{t("editor.formatSql.button", { defaultValue: "Format" })}</span>
                    <span className="text-[10px] text-muted opacity-80 font-mono">Ctrl+Alt+F</span>
                  </button>
                )}
                {/* Transaction Control */}
                {!tab.readOnly && (
                  <div className="flex items-center gap-1 bg-elevated/80 border border-default rounded px-1.5 py-0.5 text-xs backdrop-blur-sm shadow-sm">
                    <span className="text-[11px] text-muted font-medium">Tx:</span>
                    <button
                      onClick={() =>
                        setTransactionMode((prev) => (prev === "auto" ? "manual" : "auto"))
                      }
                      className={`px-1.5 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                        transactionMode === "auto"
                          ? "bg-blue-900/40 text-blue-300 border border-blue-600/40 hover:bg-blue-900/60"
                          : "bg-amber-900/40 text-amber-300 border border-amber-600/40 hover:bg-amber-900/60"
                      }`}
                      title={
                        transactionMode === "auto"
                          ? "Chế độ Auto-Commit: Tự động lưu sau mỗi lệnh"
                          : "Chế độ Manual: Cần Commit hoặc Rollback thủ công"
                      }
                    >
                      {transactionMode === "auto" ? "Auto" : "Manual"}
                    </button>

                    {transactionMode === "manual" && (
                      <div className="flex items-center gap-1 ml-1 pl-1 border-l border-default">
                        {!isTransactionActive ? (
                          <button
                            onClick={handleStartTransaction}
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] bg-surface-secondary hover:bg-surface-tertiary text-secondary hover:text-primary transition-colors"
                            title="Bắt đầu Transaction (BEGIN / START TRANSACTION)"
                          >
                            <span>Bắt đầu</span>
                          </button>
                        ) : (
                          <>
                            <span
                              className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"
                              title="Đang có Transaction mở"
                            />
                            <button
                              onClick={handleCommitTransaction}
                              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] bg-emerald-700/50 hover:bg-emerald-600/60 text-emerald-300 border border-emerald-500/40 font-medium transition-colors"
                              title="Commit các thay đổi (COMMIT;)"
                            >
                              <Check size={11} />
                              <span>Commit</span>
                            </button>
                            <button
                              onClick={handleRollbackTransaction}
                              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] bg-rose-700/50 hover:bg-rose-600/60 text-rose-300 border border-rose-500/40 font-medium transition-colors"
                              title="Hoàn tác các thay đổi (ROLLBACK;)"
                            >
                              <RotateCcw size={11} />
                              <span>Rollback</span>
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {/* Pop out Console & Results to separate window */}
                {!tab.readOnly && (
                  <button
                    onClick={() => handleDetachResults(tab.id)}
                    disabled={detachedTabIds.has(tab.id)}
                    className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-muted hover:text-cyan-300 bg-elevated/80 hover:bg-cyan-900/40 border border-default hover:border-cyan-500/40 transition-all backdrop-blur-sm shadow-sm disabled:opacity-30 disabled:pointer-events-none"
                    title={t("editor.console.detachTooltip", { defaultValue: "Mở Console & Kết quả ra cửa sổ riêng" })}
                  >
                    <ExternalLink size={12} />
                    <span className="hidden sm:inline">{t("editor.console.detachButton", { defaultValue: "Cửa sổ riêng" })}</span>
                  </button>
                )}
                {/* AI dropdown — only if AI enabled */}
                {settings.aiEnabled && (
                  <AiDropdownButton
                    onGenerate={() => setIsAiModalOpen(true)}
                    onExplain={() => setIsAiExplainModalOpen(true)}
                    disableAll={!activeConnectionId}
                    disableExplain={!tab.query?.trim()}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Resize Bar & Results Panel */}
      {!isNotebookTab && (isTableTab || !isResultsCollapsed) ? (
        <>
          {isTableTab ? (
            <TableToolbar
              initialFilter={activeTab?.filterClause}
              initialSort={activeTab?.sortClause}
              initialLimit={activeTab?.limitClause}
              initialOffset={activeTab?.offsetClause}
              initialDistinct={activeTab?.distinct}
              placeholderColumn={placeholders.column}
              placeholderSort={placeholders.sort}
              defaultLimit={settings.resultPageSize || 100}
              columnMetadata={activeTab?.columnMetadata}
              onUpdate={handleToolbarUpdate}
              onRefresh={() => handleRefresh(activeTab.id)}
              isLoading={activeTab.isLoading}
              tableName={activeTab?.activeTable}
              highlightStorageKey={
                activeTab?.activeTable
                  ? buildHighlightStorageKey(activeConnectionId, activeTab.schema, activeTab.activeTable)
                  : null
              }
            />
          ) : (
            <div
              onMouseDown={isEditorOpen ? startResize : undefined}
              className={clsx(
                "h-6 bg-elevated border-y border-default flex items-center justify-end px-2 relative",
                isEditorOpen ? "cursor-row-resize" : "",
              )}
            >
              <div
                className="flex items-center gap-0.5"
                onMouseDown={(e) => e.stopPropagation()}
              >
                {/* Detach results into a separate window */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDetachResults();
                  }}
                  disabled={detachedTabIds.has(activeTab.id)}
                  className="text-muted hover:text-secondary transition-colors p-1 hover:bg-surface-secondary rounded disabled:opacity-30 disabled:pointer-events-none"
                  title={t("editor.results.detach")}
                >
                  <ExternalLink size={14} />
                </button>
                {/* Minimize (collapse the results panel) */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsResultsCollapsed(true);
                  }}
                  className="text-muted hover:text-secondary transition-colors p-1 hover:bg-surface-secondary rounded"
                  title={t("editor.results.minimize")}
                >
                  <Minus size={14} />
                </button>
                {/* Maximize results (hide editor) / restore */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    updateActiveTab({ isEditorOpen: !isEditorOpen });
                  }}
                  className="text-muted hover:text-secondary transition-colors p-1 hover:bg-surface-secondary rounded"
                  title={
                    isEditorOpen
                      ? t("editor.results.maximize")
                      : t("editor.results.restore")
                  }
                >
                  {isEditorOpen ? (
                    <Maximize2 size={14} />
                  ) : (
                    <Minimize2 size={14} />
                  )}
                </button>
                {/* Close (collapse the results panel, keeps the data) */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsResultsCollapsed(true);
                  }}
                  className="text-muted hover:text-red-400 transition-colors p-1 hover:bg-surface-secondary rounded"
                  title={t("editor.results.close")}
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Results Panel */}
          <div className="flex-1 overflow-hidden bg-elevated flex flex-col min-h-0">
            {detachedTabIds.has(activeTab.id) ? (
              <div className="flex flex-col items-center justify-center h-full text-muted gap-3">
                <ExternalLink size={28} className="opacity-60" />
                <p className="text-sm">{t("editor.results.detached")}</p>
                <button
                  onClick={() => handleReattachResults(activeTab.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-secondary hover:text-primary bg-surface-secondary hover:bg-surface-tertiary border border-default rounded transition-colors"
                >
                  <Minimize2 size={14} />
                  {t("editor.results.reattach")}
                </button>
              </div>
            ) : activeTab.results && activeTab.results.length > 0 ? (
              <MultiResultPanel
                results={activeTab.results}
                activeResultId={activeTab.activeResultId}
                tabId={activeTab.id}
                connectionId={activeConnectionId}
                copyFormat={copyFormat}
                csvDelimiter={csvDelimiter}
                csvIncludeHeaders={csvIncludeHeaders}
                onSelectResult={(entryId) =>
                  updateTab(activeTab.id, { activeResultId: entryId })
                }
                onRerunEntry={(entryId) => runResultEntryPage(entryId, 1)}
                onPageChange={runResultEntryPage}
                onCloseEntry={(entryId) => {
                  const { results: newResults, nextActiveId } =
                    removeResultEntry(
                      activeTab.results!,
                      entryId,
                      activeTab.activeResultId,
                    );
                  if (newResults.length === 0) {
                    updateTab(activeTab.id, {
                      results: undefined,
                      activeResultId: undefined,
                    });
                  } else {
                    updateTab(activeTab.id, {
                      results: newResults,
                      activeResultId: nextActiveId,
                    });
                  }
                }}
                onCloseOtherEntries={(entryId) => {
                  const { results: newResults, nextActiveId } =
                    removeOtherEntries(activeTab.results!, entryId);
                  updateTab(activeTab.id, {
                    results: newResults,
                    activeResultId: nextActiveId,
                  });
                }}
                onCloseEntriesToRight={(entryId) => {
                  const { results: newResults, nextActiveId } =
                    removeEntriesToRight(
                      activeTab.results!,
                      entryId,
                      activeTab.activeResultId,
                    );
                  updateTab(activeTab.id, {
                    results: newResults,
                    activeResultId: nextActiveId,
                  });
                }}
                onCloseEntriesToLeft={(entryId) => {
                  const { results: newResults, nextActiveId } =
                    removeEntriesToLeft(
                      activeTab.results!,
                      entryId,
                      activeTab.activeResultId,
                    );
                  updateTab(activeTab.id, {
                    results: newResults,
                    activeResultId: nextActiveId,
                  });
                }}
                onCloseAllEntries={() => {
                  updateTab(activeTab.id, {
                    results: undefined,
                    activeResultId: undefined,
                  });
                }}
                onRenameEntry={(entryId, label) => {
                  updateTab(activeTab.id, {
                    results: updateResultEntry(
                      activeTab.results!,
                      entryId,
                      { label },
                    ),
                  });
                }}
              />
            ) : activeTab.isLoading ? (
              <div className="flex flex-col items-center justify-center h-full text-muted">
                <div className="w-12 h-12 border-4 border-surface-secondary border-t-blue-500 rounded-full animate-spin mb-4"></div>
                <p className="text-sm">{t("editor.executingQuery")}</p>
              </div>
            ) : activeTab.error ? (
              <ErrorDisplay
                error={activeTab.error}
                query={activeTab.query}
                t={t}
              />
            ) : activeTab.result &&
              activeTab.result.columns.length === 0 &&
              !(
                activeTab.pendingInsertions &&
                Object.keys(activeTab.pendingInsertions).length > 0
              ) ? (
              // Non-SELECT statement (INSERT/UPDATE/DELETE/DDL): no result set,
              // so surface an explicit success message instead of an empty grid.
              <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-2 text-center px-4">
                <CheckCircle2 size={32} className="text-green-500" />
                <p className="text-sm font-medium text-primary">
                  {t("editor.queryExecuted")}
                </p>
                <p className="text-xs text-secondary flex items-center gap-2">
                  {activeTab.result.affected_rows > 0 && (
                    <span>
                      {t("editor.rowsAffected", {
                        count: activeTab.result.affected_rows,
                      })}
                    </span>
                  )}
                  {activeTab.executionTime !== null && (
                    <span className="text-muted font-mono">
                      ({formatDuration(activeTab.executionTime)})
                    </span>
                  )}
                </p>
              </div>
            ) : activeTab.result ||
              (activeTab.pendingInsertions &&
                Object.keys(activeTab.pendingInsertions).length > 0) ? (
              <div className="flex-1 min-h-0 flex flex-col">
                {activeTab.result && (
                  <div className="p-2 bg-elevated text-xs text-secondary border-b border-default flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-4">
                      <span>
                        {t("editor.rowsRetrieved", {
                          count: activeTab.result.rows.length,
                        })}
                        {activeTab.result.columns.length > 0 && (
                          <span className="text-muted">
                            {" · "}
                            {t("editor.columnsCount", {
                              count: activeTab.result.columns.length,
                            })}
                          </span>
                        )}{" "}
                        {activeTab.executionTime !== null && (
                          <span className="text-muted ml-2 font-mono">
                            ({formatDuration(activeTab.executionTime)})
                          </span>
                        )}
                      </span>

                      {activeTab.result.pagination?.has_more && (
                        <span className="px-2 py-0.5 bg-yellow-900/30 text-yellow-400 rounded text-[10px] font-semibold uppercase tracking-wide border border-yellow-500/30">
                          {t("editor.autoPaginated")}
                        </span>
                      )}
                      {/* PII Masking Toggle */}
                      <button
                        type="button"
                        onClick={() => setIsMaskingEnabled((prev) => !prev)}
                        className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium transition-colors border ${
                          isMaskingEnabled
                            ? "bg-purple-900/40 text-purple-300 border-purple-500/50 hover:bg-purple-900/60"
                            : "bg-surface text-secondary border-default hover:text-primary hover:bg-surface-secondary"
                        }`}
                        title={t("editor.maskSensitiveData.tooltip", {
                          defaultValue: "Bảo vệ & che mờ dữ liệu nhạy cảm (Email, Phone, Password, Salary)",
                        })}
                      >
                        {isMaskingEnabled ? (
                          <EyeOff size={12} className="text-purple-400 shrink-0" />
                        ) : (
                          <Eye size={12} className="shrink-0 text-muted" />
                        )}
                        <span>{t("editor.maskSensitiveData.button", { defaultValue: "Che mờ PII" })}</span>
                      </button>

                      {/* Live Tail Toggle */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setIsLiveTailActive((prev) => !prev);
                            setLiveTailNewRowCount(0);
                          }}
                          className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium transition-colors border ${
                            isLiveTailActive
                              ? "bg-emerald-950/60 text-emerald-300 border-emerald-500/50 hover:bg-emerald-950/80"
                              : "bg-surface text-secondary border-default hover:text-primary hover:bg-surface-secondary"
                          }`}
                          title={t("editor.liveTail.tooltip", {
                            defaultValue: "Theo dõi dữ liệu bảng thời gian thực (Live Table Tail)",
                          })}
                        >
                          <Radio size={12} className={isLiveTailActive ? "text-emerald-400 animate-pulse" : "text-muted shrink-0"} />
                          <span>Live Tail{isLiveTailActive ? ` (${liveTailInterval}s)` : ""}</span>
                          {isLiveTailActive && liveTailNewRowCount > 0 && (
                            <span className="ml-0.5 px-1 rounded-full bg-emerald-500 text-black text-[10px] font-bold">
                              +{liveTailNewRowCount}
                            </span>
                          )}
                        </button>
                        {isLiveTailActive && (
                          <select
                            value={liveTailInterval}
                            onChange={(e) => setLiveTailInterval(Number(e.target.value))}
                            className="px-1 py-0.5 rounded bg-surface border border-default text-[11px] text-primary focus:outline-none"
                          >
                            <option value={2}>2s</option>
                            <option value={5}>5s</option>
                            <option value={10}>10s</option>
                          </select>
                        )}
                      </div>

                      {/* Slow Query AI Optimizer */}
                      {activeTab.executionTime !== null && activeTab.executionTime > 500 && (
                        <button
                          type="button"
                          onClick={() => handleOpenExplainDiff()}
                          className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/40 hover:bg-amber-500/20 transition-all shadow-sm animate-pulse"
                          title={t("editor.explainDiff.slowQueryTooltip", {
                            defaultValue: "Truy vấn chạy chậm (>500ms). Nhấn để phân tích cây kế hoạch và tạo index tối ưu!",
                          })}
                        >
                          <Zap size={11} className="text-amber-400" />
                          <span>Tối ưu AI ({activeTab.executionTime.toFixed(0)}ms)</span>
                        </button>
                      )}

                    </div>

                    {/* Pagination Controls */}
                    {activeTab.result.pagination && (
                      <div className="flex items-center gap-1 bg-surface-secondary rounded border border-strong">
                        <button
                          disabled={
                            activeTab.result.pagination.page === 1 ||
                            activeTab.isLoading
                          }
                          onClick={() => runQuery(activeTab.query, 1)}
                          className="p-1 hover:bg-surface-tertiary text-secondary hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                          title="First Page"
                        >
                          <ChevronsLeft size={14} />
                        </button>
                        <button
                          disabled={
                            activeTab.result.pagination.page === 1 ||
                            activeTab.isLoading
                          }
                          onClick={() =>
                            runQuery(
                              activeTab.query,
                              activeTab.result!.pagination!.page - 1,
                            )
                          }
                          className="p-1 hover:bg-surface-tertiary text-secondary hover:text-white disabled:opacity-30 disabled:cursor-not-allowed border-l border-strong"
                          title="Previous Page"
                        >
                          <ChevronLeft size={14} />
                        </button>

                        <div
                          className="px-3 text-secondary text-xs font-medium cursor-pointer hover:bg-surface-tertiary transition-colors min-w-[80px] text-center py-1"
                          onClick={() => {
                            setIsEditingPage(true);
                            setTempPage(
                              String(activeTab.result!.pagination!.page),
                            );
                          }}
                          title={t("editor.jumpToPage")}
                        >
                          {isEditingPage ? (
                            <input
                              autoFocus
                              type="text"
                              className="w-full bg-transparent text-center focus:outline-none text-white p-0 m-0 border-none h-full"
                              value={tempPage}
                              onChange={(e) => setTempPage(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  const newPage = parseInt(tempPage);
                                  const totalRows =
                                    activeTab.result!.pagination!.total_rows;
                                  if (!isNaN(newPage) && newPage >= 1) {
                                    if (
                                      totalRows === null ||
                                      newPage <=
                                        Math.ceil(
                                          totalRows /
                                            activeTab.result!.pagination!
                                              .page_size,
                                        )
                                    ) {
                                      runQuery(activeTab.query, newPage);
                                    }
                                  }
                                  setIsEditingPage(false);
                                } else if (e.key === "Escape") {
                                  setIsEditingPage(false);
                                }
                                e.stopPropagation();
                              }}
                              onBlur={() => setIsEditingPage(false)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <>
                              {activeTab.result.pagination.total_rows !== null
                                ? t("editor.pageOf", {
                                    current: activeTab.result.pagination.page,
                                    total: Math.ceil(
                                      activeTab.result.pagination.total_rows /
                                        activeTab.result.pagination.page_size,
                                    ),
                                  })
                                : t("editor.page", {
                                    current: activeTab.result.pagination.page,
                                  })}
                            </>
                          )}
                        </div>

                        {/* Count load button, or the loaded total row count */}
                        {activeTab.result.pagination.total_rows === null ? (
                          <button
                            disabled={isCountLoading || activeTab.isLoading}
                            onClick={() => loadCount()}
                            className="p-1 hover:bg-surface-tertiary text-secondary hover:text-white disabled:opacity-30 disabled:cursor-not-allowed border-l border-strong"
                            title={t("editor.loadRowCount")}
                          >
                            {isCountLoading ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Hash size={14} />
                            )}
                          </button>
                        ) : (
                          <span className="px-2 py-1 text-secondary text-xs font-medium border-l border-strong whitespace-nowrap">
                            {t("editor.rowCount", {
                              total:
                                activeTab.result.pagination.total_rows.toLocaleString(),
                            })}
                          </span>
                        )}

                        <button
                          disabled={
                            !activeTab.result.pagination.has_more ||
                            activeTab.isLoading
                          }
                          onClick={() =>
                            runQuery(
                              activeTab.query,
                              activeTab.result!.pagination!.page + 1,
                            )
                          }
                          className="p-1 hover:bg-surface-tertiary text-secondary hover:text-white disabled:opacity-30 disabled:cursor-not-allowed border-l border-strong"
                          title="Next Page"
                        >
                          <ChevronRight size={14} />
                        </button>
                        <button
                          disabled={
                            activeTab.result.pagination.total_rows === null ||
                            activeTab.isLoading
                          }
                          onClick={() =>
                            runQuery(
                              activeTab.query,
                              Math.ceil(
                                activeTab.result!.pagination!.total_rows! /
                                  activeTab.result!.pagination!.page_size,
                              ),
                            )
                          }
                          className="p-1 hover:bg-surface-tertiary text-secondary hover:text-white disabled:opacity-30 disabled:cursor-not-allowed border-l border-strong"
                          title="Last Page"
                        >
                          <ChevronsRight size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Data Manipulation Toolbar (Below Header) */}
                {activeTab.activeTable && activeTab.result && (
                  <div className="p-1 px-2 bg-elevated border-b border-default flex items-center gap-2">
                    {!driverReadonly && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={handleNewRow}
                          disabled={!!activeTab.materialized}
                          className="flex items-center justify-center w-7 h-7 text-secondary hover:text-green-400 hover:bg-surface-secondary rounded transition-colors disabled:opacity-30"
                          title={t("editor.newRow")}
                        >
                          <Plus size={16} />
                        </button>
                        <button
                          onClick={handleDeleteRows}
                          disabled={
                            !!activeTab.materialized ||
                            !activeTab.selectedRows ||
                            activeTab.selectedRows.length === 0
                          }
                          className="flex items-center justify-center w-7 h-7 text-secondary hover:text-red-400 hover:bg-surface-secondary rounded transition-colors disabled:opacity-30"
                          title={t("dataGrid.deleteRow")}
                        >
                          <Minus size={16} />
                        </button>
                      </div>
                    )}

                    <div className="w-[1px] h-4 bg-surface-secondary mx-1"></div>

                    <div className="flex items-center gap-1 text-secondary">
                      <Copy size={13} className="shrink-0" />
                      <select
                        value={copyFormat}
                        onChange={(e) =>
                          setCopyFormat(e.target.value as "csv" | "json" | "sql-insert" | "markdown" | "typescript")
                        }
                        className="bg-transparent border-none text-[11px] text-secondary hover:text-primary focus:outline-none cursor-pointer appearance-none pr-3 font-medium uppercase tracking-wide"
                        title={t("settings.copyFormat")}
                        style={CHEVRON_SELECT_STYLE}
                      >
                        <option value="csv">CSV</option>
                        <option value="json">JSON</option>
                        <option value="sql-insert">SQL INSERT</option>
                        <option value="markdown">MARKDOWN</option>
                        <option value="typescript">TYPESCRIPT</option>
                      </select>
                      {copyFormat === "csv" && (
                        <select
                          value={csvDelimiter}
                          onChange={(e) => setCsvDelimiter(e.target.value)}
                          className="bg-transparent border-none text-[11px] text-secondary hover:text-primary focus:outline-none cursor-pointer appearance-none pr-3 font-medium tracking-wide"
                          title={t("settings.csvDelimiter")}
                          style={CHEVRON_SELECT_STYLE}
                        >
                          <option value=",">
                            {t("settings.delimiterComma")}
                          </option>
                          <option value=";">
                            {t("settings.delimiterSemicolon")}
                          </option>
                          <option value={"\t"}>
                            {t("settings.delimiterTab")}
                          </option>
                          <option value="|">
                            {t("settings.delimiterPipe")}
                          </option>
                        </select>
                      )}
                      {copyFormat === "csv" && (
                        <label
                          className="flex items-center gap-1 cursor-pointer select-none text-[11px] text-secondary hover:text-primary"
                          title={t("settings.csvIncludeHeaders")}
                        >
                          <input
                            type="checkbox"
                            checked={csvIncludeHeaders}
                            onChange={(e) =>
                              setCsvIncludeHeaders(e.target.checked)
                            }
                            className="w-3 h-3 cursor-pointer accent-blue-500"
                          />
                          <span className="font-medium tracking-wide">
                            {t("settings.csvHeaders")}
                          </span>
                        </label>
                      )}
                    </div>

                    {/* Separator */}
                    {hasPendingChanges && (
                      <div className="w-[1px] h-4 bg-surface-secondary mx-1"></div>
                    )}

                    {hasPendingChanges && (
                      <div className="flex items-center gap-1 ml-2 border border-blue-900 bg-blue-900/20 rounded px-1 py-0.5">
                        <label className="flex items-center gap-1.5 px-2 py-1 cursor-pointer select-none group">
                          <input
                            type="checkbox"
                            checked={applyToAll}
                            onChange={(e) => setApplyToAll(e.target.checked)}
                            className="w-3.5 h-3.5 cursor-pointer accent-blue-500"
                          />
                          <span className="text-[10px] text-secondary group-hover:text-primary transition-colors">
                            {t("editor.applyToAll")}
                          </span>
                        </label>
                        <div className="w-[1px] h-4 bg-blue-900/50 mx-0.5"></div>
                        <button
                          onClick={() => handleSubmitChanges()}
                          disabled={!applyToAll && !selectionHasPending}
                          className="flex items-center gap-1.5 px-2 h-7 text-green-400 hover:bg-green-900/20 hover:text-green-300 rounded text-xs font-medium border border-transparent hover:border-green-900/50 transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:border-transparent disabled:cursor-not-allowed"
                          title={t("editor.submitChanges")}
                        >
                          <Check size={14} />
                          <span>Submit</span>
                        </button>
                        <button
                          onClick={handleRollbackChanges}
                          disabled={!applyToAll && !selectionHasPending}
                          className="flex items-center gap-1.5 px-2 h-7 text-secondary hover:bg-surface-secondary hover:text-primary rounded text-xs font-medium border border-transparent hover:border-strong transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:border-transparent disabled:cursor-not-allowed"
                          title={t("editor.rollbackChanges")}
                        >
                          <Undo2 size={14} />
                          <span>Rollback</span>
                        </button>
                        <span className="text-[10px] text-blue-400 bg-blue-900/20 border border-blue-900/30 px-2 py-0.5 rounded-full font-medium select-none ml-2">
                          {Object.keys(activeTab.pendingChanges || {}).length +
                            Object.keys(activeTab.pendingDeletions || {})
                              .length +
                            Object.keys(activeTab.pendingInsertions || {})
                              .length}{" "}
                          pending
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                  <div className="flex-1 min-h-0 overflow-hidden">
                    <DataGrid
                      key={activeTab.id}
                      scrollKey={activeTab.id}
                      columns={activeTab.result?.columns || []}
                      data={activeTab.result?.rows || []}
                      tableName={activeTab.activeTable}
                      pkColumns={activeTab.pkColumns}
                      autoIncrementColumns={activeTab.autoIncrementColumns}
                      defaultValueColumns={activeTab.defaultValueColumns}
                      nullableColumns={activeTab.nullableColumns}
                      columnMetadata={activeTab.columnMetadata}
                      foreignKeys={activeTab.foreignKeys}
                      onForeignKeyNavigate={handleForeignKeyNavigate}
                      onForeignKeyShowPanel={handleForeignKeyShowPanel}
                      onForeignKeyHidePanel={() => setActiveFkQuery(null)}
                      onFilterByValue={
                        activeTab.type === "table"
                          ? handleFilterByValue
                          : undefined
                      }
                      connectionId={activeConnectionId}
                      onRefresh={handleRefresh}
                      pendingChanges={activeTab.pendingChanges}
                      pendingDeletions={activeTab.pendingDeletions}
                      pendingInsertions={activeTab.pendingInsertions}
                      onPendingChange={handlePendingChange}
                      onPendingInsertionChange={handlePendingInsertionChange}
                      onDiscardInsertion={handleDiscardInsertion}
                      onRevertDeletion={handleRevertDeletion}
                      onMarkForDeletion={handleMarkForDeletion}
                      onMarkMultipleForDeletion={handleMarkMultipleForDeletion}
                      onDuplicateRow={handleDuplicateRow}
                      selectedRows={new Set(activeTab.selectedRows || [])}
                      onSelectionChange={handleSelectionChange}
                      copyFormat={copyFormat}
                      csvDelimiter={csvDelimiter}
                      csvIncludeHeaders={csvIncludeHeaders}
                      sortClause={activeTab.sortClause}
                      onSort={
                        activeTab.type === "table" &&
                        (activeTab.result?.rows.length ?? 0) > 0
                          ? handleSort
                          : undefined
                      }
                      isMaskingEnabled={isMaskingEnabled}
                      readonly={driverReadonly || !!activeTab.materialized || isSafeModeReadonly}
                      columnVisibilityKey={
                        activeTab.activeTable
                          ? `${activeConnectionId ?? ""}:${activeTab.schema ?? ""}:${activeTab.activeTable}`
                          : undefined
                      }
                      highlightStorageKey={
                        activeTab.activeTable
                          ? buildHighlightStorageKey(activeConnectionId, activeTab.schema, activeTab.activeTable)
                          : null
                      }
                    />
                  </div>
                  {activeFkQuery && activeConnectionId && (
                    <RelatedRecordsPanel
                      activeFkQuery={activeFkQuery}
                      connectionId={activeConnectionId}
                      driver={activeDriver}
                      schema={activeSchema}
                      onClose={() => setActiveFkQuery(null)}
                      onNavigateToTab={handleForeignKeyNavigate}
                    />
                  )}
                </div>
              </div>
            ) : activeTab.type === "table" ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-surface-tertiary">
                <div className="p-3 bg-surface-secondary/50 rounded-2xl border border-default/50">
                  <TableIcon size={32} className="text-blue-400/80" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm font-medium text-primary">
                    {activeTab.activeTable ? (
                      <>
                        {t("editor.tablePrefix", { defaultValue: "Bảng" })}{" "}
                        <span className="text-blue-400 font-mono font-semibold">
                          {activeTab.activeTable}
                        </span>
                      </>
                    ) : (
                      t("editor.tableRunPrompt")
                    )}
                  </p>
                  <p className="text-xs text-muted max-w-sm">
                    {t("editor.tableLoadHint", {
                      defaultValue:
                        "Dữ liệu bảng chưa được tải hoặc kết nối vừa được khôi phục.",
                    })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRefresh(activeTab.id)}
                  disabled={!activeConnectionId || activeTab.isLoading}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium shadow-md shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                >
                  <RotateCcw
                    size={14}
                    className={activeTab.isLoading ? "animate-spin" : ""}
                  />
                  <span>
                    {t("editor.loadTableData", {
                      defaultValue: "Tải dữ liệu bảng",
                    })}
                  </span>
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-surface-tertiary text-sm">
                {t("editor.executePrompt")}
              </div>
            )}
          </div>
        </>
      ) : (
        // Show Results Button (when collapsed)
        <div className="h-10 bg-elevated border-t border-default flex items-center justify-end px-2">
          <button
            onClick={() => setIsResultsCollapsed(false)}
            className="text-muted hover:text-secondary transition-colors p-1 hover:bg-surface-secondary rounded"
            title="Show Results Panel"
          >
            <ChevronUp size={16} />
          </button>
        </div>
      )}
        </div>
        {/* end left (main) column */}

        {splitTab && (
          <>
            <div
              onMouseDown={startSplitResize}
              className={clsx(
                "shrink-0 transition-colors bg-default/40 hover:bg-blue-500/60",
                splitOrientation === "vertical"
                  ? "h-1 w-full cursor-row-resize"
                  : "w-1 h-full cursor-col-resize",
              )}
            />
            <div
              className={clsx(
                "flex flex-col flex-1 min-w-0 min-h-0",
                splitOrientation === "vertical" ? "w-full" : "h-full",
              )}
              style={
                splitOrientation === "vertical"
                  ? { height: `${(1 - splitRatio) * 100}%` }
                  : { width: `${(1 - splitRatio) * 100}%` }
              }
            >
              <SplitResultsPane
                tab={splitTab}
                pinnedTabs={pinnedTabs}
                activeSplitTabId={splitTab.id}
                orientation={splitOrientation}
                onToggleOrientation={() =>
                  setSplitOrientation((o) => toggleSplitOrientation(o))
                }
                renderEditor={(t) => (
                  <div className="flex-1 min-h-0 min-w-0">
                    <SqlEditorWrapper
                      editorKey={`split-${t.id}`}
                      initialValue={t.query}
                      connectionId={activeConnectionId}
                      tables={effectiveTables}
                      schema={activeSchema}
                      onChange={(newQuery) =>
                        updateTab(t.id, { query: newQuery })
                      }
                      onRun={() => {
                        const queries = splitQueries(t.query, activeDialect);
                        if (queries.length > 1) {
                          runMultipleQueries(queries);
                        } else {
                          runQuery(queries[0] || t.query, 1, t.id);
                        }
                      }}
                      dialect={activeDialect}
                    />
                  </div>
                )}
                onSelectPinned={(id) => setActiveSplitTabId(id)}
                onUnpin={(id) => togglePin(id)}
                connectionId={activeConnectionId}
                copyFormat={copyFormat}
                csvDelimiter={csvDelimiter}
                csvIncludeHeaders={csvIncludeHeaders}
                onPageChange={(page) =>
                  runQuery(splitTab.query, page, splitTab.id)
                }
                onClose={() => togglePin(splitTab.id)}
                onFocusTab={() => {
                  setSplitTabIds((ids) => ids.filter((id) => id !== splitTab.id));
                  setActiveTabId(splitTab.id);
                }}
                onSwap={() => {
                  const previousActive = activeTabIdRef.current;
                  setActiveTabId(splitTab.id);
                  // The now-main tab leaves the pins; the previously-active tab
                  // takes its place as the shown pin.
                  setSplitTabIds((ids) =>
                    ids.map((id) =>
                      id === splitTab.id ? (previousActive ?? id) : id,
                    ),
                  );
                  setActiveSplitTabId(previousActive);
                }}
                onSave={() =>
                  handleSubmitChanges(
                    splitTab,
                    splitTab.schema ?? activeSchema ?? undefined,
                  )
                }
                editGridProps={
                  splitTab.activeTable && splitTab.result
                    ? {
                        tableName: splitTab.activeTable,
                        pkColumns: splitTab.pkColumns,
                        autoIncrementColumns: splitTab.autoIncrementColumns,
                        defaultValueColumns: splitTab.defaultValueColumns,
                        nullableColumns: splitTab.nullableColumns,
                        columnMetadata: splitTab.columnMetadata,
                        foreignKeys: splitTab.foreignKeys,
                        connectionId: activeConnectionId,
                        onRefresh: () => handleRefresh(splitTab.id),
                        pendingChanges: splitTab.pendingChanges,
                        pendingDeletions: splitTab.pendingDeletions,
                        pendingInsertions: splitTab.pendingInsertions,
                        onPendingChange: (pk, col, val) =>
                          handlePendingChange(pk, col, val, splitTab.id),
                        onPendingInsertionChange: (tid, col, val) =>
                          handlePendingInsertionChange(tid, col, val, splitTab.id),
                        onDiscardInsertion: (tid) =>
                          handleDiscardInsertion(tid, splitTab.id),
                        onRevertDeletion: (pk) =>
                          handleRevertDeletion(pk, splitTab.id),
                        onMarkForDeletion: (pk) =>
                          handleMarkForDeletion(pk, splitTab.id),
                        onMarkMultipleForDeletion: (pks) =>
                          handleMarkMultipleForDeletion(pks, splitTab.id),
                        onDuplicateRow: (rd) =>
                          handleDuplicateRow(rd, splitTab.id),
                        selectedRows: new Set(splitTab.selectedRows || []),
                        onSelectionChange: (idx) =>
                          handleSelectionChange(idx, splitTab.id),
                        onForeignKeyNavigate: (fk, value) =>
                          handleForeignKeyNavigate(fk, value, splitTab),
                        onFilterByValue:
                          splitTab.type === "table"
                            ? (col, op, val, colType) =>
                                handleFilterByValue(
                                  col,
                                  op,
                                  val,
                                  colType,
                                  splitTab
                                )
                            : undefined,
                        onSort:
                          splitTab.type === "table" &&
                          (splitTab.result?.rows.length ?? 0) > 0
                            ? (col) => handleSort(col, splitTab)
                            : undefined,
                        sortClause: splitTab.sortClause,
                        copyFormat,
                        csvDelimiter,
                        csvIncludeHeaders,
                        readonly:
                          driverReadonly || !!splitTab.materialized,
                        columnVisibilityKey: `${activeConnectionId ?? ""}:${splitTab.schema ?? ""}:${splitTab.activeTable}`,
                        scrollKey: `split:${splitTab.id}`,
                      }
                    : undefined
                }
              />
            </div>
          </>
        )}
      </div>
      {/* end workspace flex-row */}

      {activeTab.activeTable && (
        <NewRowModal
          isOpen={showNewRowModal}
          onClose={() => setShowNewRowModal(false)}
          tableName={activeTab.activeTable}
          onSaveSuccess={handleRefresh}
        />
      )}
      <QuerySelectionModal
        isOpen={isQuerySelectionModalOpen}
        queries={selectableQueries}
        onSelect={(q) => {
          runQuery(q, 1);
          setIsQuerySelectionModalOpen(false);
        }}
        onRunAll={(queries) => {
          runMultipleQueries(queries);
          setIsQuerySelectionModalOpen(false);
        }}
        onRunSelected={(queries) => {
          runMultipleQueries(queries);
          setIsQuerySelectionModalOpen(false);
        }}
        onClose={() => setIsQuerySelectionModalOpen(false)}
      />
      <ProductionSafetyModal
        isOpen={!!dangerousQuery}
        query={dangerousQuery?.sql || ""}
        dangerReasons={dangerousQuery?.reasons || []}
        isProduction={!!dangerousQuery?.isProduction}
        onConfirm={() => resolveDangerousQuery(true)}
        onClose={() => resolveDangerousQuery(false)}
      />
      <SqlTemplatesModal
        isOpen={isSqlTemplatesOpen}
        onClose={() => setIsSqlTemplatesOpen(false)}
        onInsert={handleInsertSqlTemplate}
        tables={tables?.map((t) => t.name) || []}
        activeTable={activeTab?.activeTable || null}
      />
      <QueryHistoryModal
        isOpen={isQueryHistoryOpen}
        onClose={() => setIsQueryHistoryOpen(false)}
        onInsertQuery={handleInsertSqlTemplate}
        onRunQuery={(sql) => runQuery(sql, 1)}
      />
            {mockDataModal && (
        <MockDataModal
          isOpen={mockDataModal.isOpen}
          onClose={() => setMockDataModal(null)}
          tableName={mockDataModal.tableName}
          schema={mockDataModal.schema}
          onOpenInEditor={(sql) => addTab({ type: "console", query: sql })}
        />
      )}
      <SchemaDiffModal
        isOpen={isSchemaDiffOpen}
        onClose={() => setIsSchemaDiffOpen(false)}
        onOpenInEditor={(sql) => addTab({ type: "console", query: sql })}
      />
      <VisualExplainDiffModal
        isOpen={isExplainDiffOpen}
        onClose={() => setIsExplainDiffOpen(false)}
        plan={explainDiffPlan}
        connectionId={activeConnectionId}
        schema={activeTab?.schema ?? activeSchema ?? null}
        onInsertSql={(sql) => addTab({ type: "console", query: sql })}
      />
      <TeamWorkspaceSyncModal
        isOpen={isTeamSyncOpen}
        onClose={() => setIsTeamSyncOpen(false)}
      />
      <TabSwitcherModal
        isOpen={isTabSwitcherOpen}
        tabs={tabs}
        activeTabId={activeTabId}
        onSelect={(tabId) => {
          setActiveTabId(tabId);
          setIsTabSwitcherOpen(false);
        }}
        onClose={(tabId) => handleCloseTab(tabId)}
        onDismiss={() => setIsTabSwitcherOpen(false)}
      />
      {saveQueryModal.isOpen && (
        <QueryModal
          isOpen={saveQueryModal.isOpen}
          onClose={() =>
            setSaveQueryModal({ ...saveQueryModal, isOpen: false })
          }
          initialSql={saveQueryModal.sql}
          initialDatabase={activeTab?.schema ?? activeSchema ?? activeDatabaseName}
          databases={isMultiDb ? selectedDatabases : undefined}
          onSave={async (name, sql, database) => await saveQuery(name, sql, database ?? activeTab?.schema ?? activeSchema ?? activeDatabaseName)}
          title={t("editor.saveQuery")}
        />
      )}
      <AiQueryModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        connectionId={activeConnectionId ?? undefined}
        schema={activeTab?.schema ?? activeSchema ?? undefined}
        database={activeTab?.database}
        onInsert={(q) => {
          updateActiveTab({ query: q });
          runQuery(q, 1);
        }}
      />
      <AiExplainModal
        isOpen={isAiExplainModalOpen}
        onClose={() => setIsAiExplainModalOpen(false)}
        query={activeTab.query}
      />
      <VisualExplainModal
        isOpen={isVisualExplainOpen}
        onClose={() => {
          setIsVisualExplainOpen(false);
          setVisualExplainQuery(null);
        }}
        query={visualExplainQuery ?? activeTab?.query ?? ""}
        connectionId={activeConnectionId ?? ""}
        schema={activeTab?.schema ?? activeSchema ?? undefined}
        onInsertSql={(sql) => addTab({ type: "console", query: sql })}
      />
      <ExplainSelectionModal
        isOpen={isExplainSelectionOpen}
        queries={explainSelectableQueries}
        onSelect={(q) => {
          setIsExplainSelectionOpen(false);
          openExplainForQuery(q);
        }}
        onClose={() => setIsExplainSelectionOpen(false)}
      />
      {tabContextMenu && (
        <ContextMenu
          x={tabContextMenu.x}
          y={tabContextMenu.y}
          onClose={() => setTabContextMenu(null)}
          items={[
            ...(splitTabIds.includes(tabContextMenu.tabId)
              ? [
                  {
                    label: t("editor.split.unpin", "Close Split"),
                    icon: PanelRight,
                    action: () => togglePin(tabContextMenu.tabId),
                  },
                ]
              : [
                  {
                    label: t("editor.split.splitRight", "Split Right"),
                    icon: Columns2,
                    action: () => {
                      setSplitOrientation("horizontal");
                      togglePin(tabContextMenu.tabId);
                    },
                  },
                  {
                    label: t("editor.split.splitDown", "Split Down"),
                    icon: Rows2,
                    action: () => {
                      setSplitOrientation("vertical");
                      togglePin(tabContextMenu.tabId);
                    },
                  },
                ]),
            {
              label: detachedTabIds.has(tabContextMenu.tabId)
                ? t("editor.results.reattach", "Reattach Window")
                : t("editor.results.detach", "Detach Window"),
              icon: detachedTabIds.has(tabContextMenu.tabId)
                ? Minimize2
                : ExternalLink,
              action: () => {
                if (detachedTabIds.has(tabContextMenu.tabId)) {
                  handleReattachResults(tabContextMenu.tabId);
                } else {
                  handleDetachResults(tabContextMenu.tabId);
                }
              },
            },
            ...(canRenameTab(
              tabs.find((t) => t.id === tabContextMenu.tabId)?.type ?? "",
            )
              ? [
                  {
                    label: t("sidebar.notebooks.rename", "Rename"),
                    icon: Pencil,
                    action: () => startTabRename(tabContextMenu.tabId),
                  },
                ]
              : []),
            ...(!["console", "notebook", "query_builder"].includes(
              tabs.find((t) => t.id === tabContextMenu.tabId)?.type ?? "",
            )
              ? [
                  {
                    label: t("editor.convertToConsole"),
                    icon: FileCode,
                    action: () => handleConvertToConsole(tabContextMenu.tabId),
                  },
                ]
              : []),
            {
              label: t("editor.reopenClosedTab"),
              icon: Undo2,
              disabled: !canReopenClosedTab,
              action: () => reopenClosedTab(),
            },
            {
              label: t("editor.closeTab"),
              icon: X,
              action: () => handleCloseTab(tabContextMenu.tabId),
            },
            {
              label: t("editor.closeOthers"),
              icon: XCircle,
              action: () => closeOtherTabs(tabContextMenu.tabId),
            },
            {
              label: t("editor.closeRight"),
              icon: ArrowRightToLine,
              action: () => closeTabsToRight(tabContextMenu.tabId),
            },
            {
              label: t("editor.closeLeft"),
              icon: ArrowLeftToLine,
              action: () => closeTabsToLeft(tabContextMenu.tabId),
            },
            {
              label: t("editor.closeAll"),
              icon: Trash2,
              danger: true,
              action: () => closeAllTabs(),
            },
          ]}
        />
      )}
      <ErrorModal
        isOpen={errorModal.isOpen}
        onClose={() => setErrorModal({ isOpen: false, message: "" })}
        message={errorModal.message}
      />
      <ExportProgressModal
        isOpen={exportState.isOpen}
        status={exportState.status}
        rowsProcessed={exportState.rowsProcessed}
        fileName={exportState.fileName}
        errorMessage={exportState.errorMessage}
        onCancel={cancelExport}
        onClose={closeExportModal}
      />
      <QueryParamsModal
        isOpen={queryParamsModal.isOpen}
        onClose={() =>
          setQueryParamsModal((prev) => ({ ...prev, isOpen: false }))
        }
        onSubmit={handleParamsSubmit}
        parameters={queryParamsModal.parameters}
        initialValues={
          tabsRef.current.find((t) => t.id === queryParamsModal.pendingTabId)
            ?.queryParams || {}
        }
        mode={queryParamsModal.mode}
      />
    </div>
  );
};

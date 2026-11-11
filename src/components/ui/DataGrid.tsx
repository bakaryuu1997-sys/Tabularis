import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useTranslation } from "react-i18next";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";
import { SlotAnchor } from "./SlotAnchor";
import {
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  BarChart2,
  Braces,
  Copy,
  CopyPlus,
  Clock,
  Undo,
  Trash2,
  Edit,
  Sparkles,
  Ban,
  FileDigit,
  ExternalLink,
  Filter,
  PanelBottomOpen,
  EyeOff,
  Eye,
  Key,
  Link2,
  Plus,
  TableProperties,
} from "lucide-react";
import { getColumnTypeVisual } from "../../utils/columnTypeBadge";
import { ColumnQuickStatsPopover } from "./ColumnQuickStatsPopover";
import {
  isSensitiveColumn,
  maskRows,
  maskSensitiveValue,
  parseExtraMaskedColumns,
  type MaskingProfile,
} from "../../utils/dataMasking";
import { usePresentationMode } from "../../hooks/usePresentationMode";
import { isMaskingActive } from "../../utils/presentation";
import { buildColumnTooltip } from "../../utils/columnDetails";
import {
  getCellValueFilterOperators,
  type CellValueFilterOperator,
} from "../../utils/cellValueFilter";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useAlert } from "../../hooks/useAlert";
import {
  USE_DEFAULT_SENTINEL,
  formatCellValue,
  getColumnSortState,
  calculateSelectionRange,
  toggleSetValue,
  getResultValueType,
  buildPkMap,
  serializePkKey,
  resolveGridScrollKey,
  type MergedRow,
} from "../../utils/dataGrid";
import { useSettings } from "../../hooks/useSettings";
import { isGeometricType, formatGeometricValue } from "../../utils/geometry";
import { isBlobColumn, isBlobWireFormat } from "../../utils/blob";
import { isJsonColumn, isJsonContent } from "../../utils/json";
import {
  pickPrimaryForeignKeyByColumn,
  getForeignKeyForPreview,
} from "../../utils/foreignKeys";
import {
  getDateInputMode,
  parseDateTime,
  formatDateTime,
} from "../../utils/dateInput";
import { RowEditorSidebar } from "./RowEditorSidebar";
import { CellValueInspector } from "./CellValueInspector";
import { ColumnProfileModal } from "../modals/ColumnProfileModal";
import { profileColumn, type ColumnProfileResult } from "../../utils/columnProfiler";
import { useDatabase } from "../../hooks/useDatabase";
import {
  rowsToCSV,
  rowsToCSVWithHeaders,
  rowsToJSON,
  rowsToSqlInsert,
  rowsToMarkdownTable,
  rowsToTypeScriptInterface,
  getSelectedRows,
  copyTextToClipboard,
} from "../../utils/clipboard";
import type {
  PendingInsertion,
  TableColumn,
  ForeignKey,
} from "../../types/editor";
import { MemoRow, type RowCtx } from "./DataGridRow";
import { type HighlightRule, loadHighlightRules } from "../../utils/highlightRules";
import {
  toggleHiddenColumn,
  computeColumnVisibility,
  pruneHiddenColumns,
  loadHiddenColumns,
  saveHiddenColumns,
} from "../../utils/columnVisibility";

interface DataGridProps {
  columns: string[];
  data: unknown[][];
  tableName?: string | null;
  pkColumns?: string[] | null;
  autoIncrementColumns?: string[];
  defaultValueColumns?: string[];
  nullableColumns?: string[];
  columnMetadata?: TableColumn[];
  foreignKeys?: ForeignKey[];
  onForeignKeyNavigate?: (fk: ForeignKey, value: unknown) => void;
  onFilterByValue?: (
    column: string,
    operator: CellValueFilterOperator,
    value: unknown,
    columnType?: string,
  ) => void;
  onForeignKeyShowPanel?: (fk: ForeignKey, value: unknown) => void;
  onForeignKeyHidePanel?: () => void;
  connectionId?: string | null;
  onRefresh?: () => void;
  onAddRow?: () => void;
  pendingChanges?: Record<
    string,
    { pkOriginalValue: unknown; changes: Record<string, unknown> }
  >;
  pendingDeletions?: Record<string, unknown>;
  pendingInsertions?: Record<string, PendingInsertion>;
  onPendingChange?: (pkVal: unknown, colName: string, value: unknown) => void;
  onPendingInsertionChange?: (
    tempId: string,
    colName: string,
    value: unknown,
  ) => void;
  onDiscardInsertion?: (tempId: string) => void;
  onRevertDeletion?: (pkVal: unknown) => void;
  onMarkForDeletion?: (pkVal: unknown) => void;
  onMarkMultipleForDeletion?: (pkVals: unknown[]) => void;
  onDuplicateRow?: (rowData: Record<string, unknown>) => void;
  selectedRows?: Set<number>;
  onSelectionChange?: (indices: Set<number>) => void;
  copyFormat?: "csv" | "json" | "sql-insert" | "markdown" | "typescript";
  csvDelimiter?: string;
  csvIncludeHeaders?: boolean;
  sortClause?: string;
  onSort?: (colName: string) => void;
  readonly?: boolean;
  /** When set, client-side hidden columns are persisted under this key
   * (e.g. `${connectionId}:${tableName}`). Omit for session-only visibility. */
  columnVisibilityKey?: string;
  isMaskingEnabled?: boolean;
  maskingProfile?: MaskingProfile;
  showCellDataBars?: boolean;
  onToggleMasking?: () => void;
  scrollKey?: string;
  highlightRules?: HighlightRule[];
  highlightStorageKey?: string | null;
}

// SQL tag shown in the chip next to each "Filter by this value" entry.
const CELL_VALUE_FILTER_BADGES: Record<CellValueFilterOperator, string> = {
  "=": "=",
  "<>": "<>",
  ">": ">",
  ">=": ">=",
  "<": "<",
  "<=": "<=",
  contains: "LIKE",
  "IS NULL": "IS",
  "IS NOT NULL": "IS NOT",
};

// Value shown next to the column name in the "Filter by this value" submenu.
const formatCellValueFilterHint = (value: unknown): string => {
  if (value === null || value === undefined) return "NULL";
  const text = String(value).replace(/\s+/g, " ").trim();
  return text === "" ? "''" : text.length > 80 ? `${text.slice(0, 80)}…` : text;
};

// i18n label per "Filter by this value" operator (issue #853).
const CELL_VALUE_FILTER_LABEL_KEYS: Record<CellValueFilterOperator, string> = {
  "=": "dataGrid.filterEquals",
  "<>": "dataGrid.filterNotEquals",
  ">": "dataGrid.filterGreaterThan",
  ">=": "dataGrid.filterGreaterOrEqual",
  "<": "dataGrid.filterLessThan",
  "<=": "dataGrid.filterLessOrEqual",
  contains: "dataGrid.filterContains",
  "IS NULL": "dataGrid.filterIsNull",
  "IS NOT NULL": "dataGrid.filterIsNotNull",
};

/** Persistent horizontal/vertical scroll positions across renders, tab switches, and sorts. */
const gridScrollPositions = new Map<string, { scrollLeft: number; scrollTop: number }>();

export const DataGrid = React.memo(
  ({
    columns,
    data,
    tableName,
    pkColumns,
    autoIncrementColumns,
    defaultValueColumns,
    nullableColumns,
    columnMetadata,
    foreignKeys,
    onForeignKeyNavigate,
    onFilterByValue,
    onForeignKeyShowPanel,
    onForeignKeyHidePanel,
    connectionId,
    onRefresh,
    onAddRow,
    pendingChanges,
    pendingDeletions,
    pendingInsertions,
    onPendingChange,
    onPendingInsertionChange,
    onDiscardInsertion,
    onRevertDeletion,
    onMarkForDeletion,
    onMarkMultipleForDeletion,
    onDuplicateRow,
    selectedRows: externalSelectedRows,
    onSelectionChange,
    copyFormat,
    csvDelimiter = ",",
    csvIncludeHeaders = true,
    sortClause,
    onSort,
    readonly: readonlyProp,
    isMaskingEnabled: isMaskingEnabledFromProps,
    maskingProfile: maskingProfileProp,
    showCellDataBars: showCellDataBarsProp,
    columnVisibilityKey,
    scrollKey,
    highlightRules: highlightRulesProp,
    highlightStorageKey,
  }: DataGridProps) => {
    const { t } = useTranslation();
    const { activeSchema, activeDriver, connections } = useDatabase();
    const { showAlert } = useAlert();
    const { settings } = useSettings();
    const { isPresentationMode } = usePresentationMode();
    // Sensitive columns stay masked in every grid while presenting, whatever the grid's own toggle says.
    const isMaskingEnabledProp = isMaskingActive(isMaskingEnabledFromProps, isPresentationMode);
    const colorByType = settings.resultColorByType ?? true;
    const maskingProfile = maskingProfileProp ?? settings.maskingProfile ?? "smart";
    const maskingExtraColumns = useMemo(
      () => parseExtraMaskedColumns(settings.maskingExtraColumns),
      [settings.maskingExtraColumns],
    );
    // Anything copied while masking is on carries the masked values, never the real ones.
    const maskRowsForCopy = useCallback(
      (rows: readonly (readonly unknown[])[]): unknown[][] =>
        isMaskingEnabledProp
          ? maskRows(rows, columns, maskingProfile, maskingExtraColumns)
          : (rows as unknown[][]),
      [isMaskingEnabledProp, columns, maskingProfile, maskingExtraColumns],
    );
    const showCellDataBars = showCellDataBarsProp ?? settings.showCellDataBars ?? true;

    // Client-side hidden columns (presentational only — never changes the SQL).
    const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() =>
      loadHiddenColumns(columnVisibilityKey),
    );
    // Re-load when the persistence key changes (e.g. switching table/tab).
    useEffect(() => {
      setHiddenColumns(loadHiddenColumns(columnVisibilityKey));
    }, [columnVisibilityKey]);
    // Drop stale names whenever the visible column set changes.
    useEffect(() => {
      setHiddenColumns((prev) => {
        const pruned = pruneHiddenColumns(prev, columns);
        return pruned.size === prev.size ? prev : pruned;
      });
    }, [columns]);

    const hideColumn = useCallback((col: string) => {
      setHiddenColumns((prev) => {
        const next = new Set(prev).add(col);
        return next;
      });
    }, []);
    const toggleColumn = useCallback((col: string) => {
      setHiddenColumns((prev) => toggleHiddenColumn(prev, col));
    }, []);
    const showAllColumns = useCallback(() => setHiddenColumns(new Set()), []);

    // Persist explicit hide/show changes (the columns-effect above only prunes).
    useEffect(() => {
      saveHiddenColumns(columnVisibilityKey, hiddenColumns);
    }, [hiddenColumns, columnVisibilityKey]);

    const detectJsonInTextColumns = useMemo(() => {
      if (!connectionId) return false;
      return (
        connections.find((c) => c.id === connectionId)
          ?.detect_json_in_text_columns === true
      );
    }, [connections, connectionId]);

    const [contextMenu, setContextMenu] = useState<{
      x: number;
      y: number;
      row: unknown[];
      rowIndex: number;
      colIndex: number;
      colName: string;
      mergedRow?: {
        type: "existing" | "insertion";
        rowData: unknown[];
        displayIndex: number;
        tempId?: string;
      };
    } | null>(null);
    const [headerContextMenu, setHeaderContextMenu] = useState<{
      x: number;
      y: number;
      colName: string;
    } | null>(null);
    const [editingCell, setEditingCell] = useState<{
      rowIndex: number;
      colIndex: number;
      value: unknown;
      isRawSql?: boolean;
    } | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [sidebarRowData, setSidebarRowData] = useState<{
      data: Record<string, unknown>;
      rowIndex: number;
      focusField?: string;
    } | null>(null);
    const [expandedCell, setExpandedCell] = useState<{
      rowIndex: number;
      colIndex: number;
      kind: "json" | "text";
    } | null>(null);

    useEffect(() => {
      setExpandedCell(null);
    }, [data]);

    const [internalSelectedRowIndices, setInternalSelectedRowIndices] =
      useState<Set<number>>(new Set());
    const [lastSelectedRowIndex, setLastSelectedRowIndex] = useState<
      number | null
    >(null);
    const [focusedCell, setFocusedCell] = useState<{
      rowIndex: number;
      colIndex: number;
    } | null>(null);
    const [inspectorOpen, setInspectorOpen] = useState(false);
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    const [selectedColumnProfile, setSelectedColumnProfile] = useState<ColumnProfileResult | null>(null);

    const [inspectorCell, setInspectorCell] = useState<{
      rowIndex: number;
      colIndex: number;
      colName: string;
      value: unknown;
    } | null>(null);
    const editInputRef = useRef<HTMLInputElement>(null);
    // Mirror of editingCell so the commit/keydown callbacks can read the latest
    // value without listing editingCell in their deps — keeps their identity
    // stable so the memoized rows don't re-render on every keystroke/scroll.
    const editingCellRef = useRef(editingCell);
    useEffect(() => {
      editingCellRef.current = editingCell;
    }, [editingCell]);
    const pendingJsonSessions = useRef<
      Map<string, { colName: string; rowData: unknown[]; isInsertion: boolean; tempId?: string }>
    >(new Map());

    const selectedRowIndices =
      externalSelectedRows || internalSelectedRowIndices;

    const updateSelection = useCallback(
      (newSelection: Set<number>) => {
        if (onSelectionChange) {
          onSelectionChange(newSelection);
        } else {
          setInternalSelectedRowIndices(newSelection);
        }
      },
      [onSelectionChange],
    );

    // Pre-calculate pkIndex array once for O(1) lookup instead of O(n) in render loop
    const pkIndexMaps = useMemo((): number[] => {
      if (!pkColumns || pkColumns.length === 0) return [];
      const indices = pkColumns.map((col) => columns.indexOf(col));
      // If any PK column is absent from the result set, disable editing entirely
      // to avoid partial WHERE clauses that could match multiple rows.
      if (indices.some((idx) => idx < 0)) return [];
      return indices;
    }, [columns, pkColumns]);

    // Create column type map for O(1) lookup during cell rendering
    const columnTypeMap = useMemo(() => {
      if (!columnMetadata) return null;
      return new Map(columnMetadata.map((col) => [col.name, col.data_type]));
    }, [columnMetadata]);

    // Create column length map for O(1) lookup during blob rendering decisions
    const columnLengthMap = useMemo(() => {
      if (!columnMetadata) return null;
      return new Map(
        columnMetadata.map((col) => [col.name, col.character_maximum_length]),
      );
    }, [columnMetadata]);

    // Precompute the result-coloring class per column once (the type is fixed
    // per column), so rows don't reclassify every cell on each render. `null`
    // when the feature is off, which makes rows skip the wrapper entirely.
    const resultColorClassMap = useMemo(() => {
      if (!colorByType) return null;
      const map = new Map<string, string>();
      for (const colName of columns) {
        const colType = columnTypeMap?.get(colName);
        if (colType) map.set(colName, `rcell-${getResultValueType(undefined, colType)}`);
      }
      return map;
    }, [colorByType, columns, columnTypeMap]);

    // Precompute column data distribution (valid vs null) for header mini-bar
    const columnDistributionMap = useMemo(() => {
      const map = new Map<string, { validRatio: number; validCount: number; nullCount: number }>();
      const total = data.length;
      if (total === 0) return map;

      columns.forEach((colName, colIdx) => {
        let validCount = 0;
        for (let i = 0; i < total; i++) {
          const val = data[i]?.[colIdx];
          if (val !== null && val !== undefined) {
            validCount++;
          }
        }
        map.set(colName, {
          validRatio: validCount / total,
          validCount,
          nullCount: total - validCount,
        });
      });
      return map;
    }, [columns, data]);

    // Precompute numeric bounds (min, max) per column for cell data bars
    const colNumericBoundsMap = useMemo(() => {
      const map = new Map<string, { min: number; max: number }>();
      if (!showCellDataBars || data.length === 0) return map;

      columns.forEach((colName, colIdx) => {
        const colType = columnTypeMap?.get(colName) || "";
        const isNumType = /int|float|double|decimal|num|real/i.test(colType);

        let min = Infinity;
        let max = -Infinity;
        let count = 0;

        for (let i = 0; i < data.length; i++) {
          const val = data[i]?.[colIdx];
          if (val !== null && val !== undefined && val !== "") {
            const num = Number(val);
            if (!isNaN(num)) {
              if (num < min) min = num;
              if (num > max) max = num;
              count++;
            }
          }
        }

        if (count > 0 && max > min && (isNumType || count === data.length)) {
          map.set(colName, { min, max });
        }
      });
      return map;
    }, [columns, data, columnTypeMap, showCellDataBars]);

    const [quickStatsState, setQuickStatsState] = useState<{
      isOpen: boolean;
      colName: string;
      anchorRect: { top: number; left: number; bottom: number; right: number } | null;
      profile: ColumnProfileResult | null;
      declaredType?: string;
    }>({
      isOpen: false,
      colName: "",
      anchorRect: null,
      profile: null,
    });

    const handleOpenQuickStats = useCallback(
      (colName: string, event: React.MouseEvent<HTMLElement>) => {
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        const colType = columnTypeMap?.get(colName);
        const rowObjects = data.map((r) => {
          const obj: Record<string, unknown> = {};
          columns.forEach((col, idx) => {
            obj[col] = r[idx];
          });
          return obj;
        });
        const prof = profileColumn(colName, rowObjects, colType);
        setQuickStatsState({
          isOpen: true,
          colName,
          anchorRect: {
            top: rect.top,
            left: rect.left,
            bottom: rect.bottom,
            right: rect.right,
          },
          profile: prof,
          declaredType: colType,
        });
      },
      [columnTypeMap, columns, data],
    );

    const isJsonCellTarget = useCallback(
      (colType: string | undefined, value: unknown): boolean => {
        if (colType && isJsonColumn(colType)) return true;
        if (!detectJsonInTextColumns) return false;
        if (Array.isArray(value)) return true;
        if (isJsonContent(value)) return true;
        return false;
      },
      [detectJsonInTextColumns],
    );

    const buildRowLabel = useCallback(
      (rowData: unknown[], rowIndex: number, isInsertion: boolean): string => {
        if (isInsertion) return t("dataGrid.newRow", { defaultValue: "NEW" });
        if (pkColumns && pkColumns.length > 0 && pkIndexMaps.length > 0) {
          const pkVal = rowData[pkIndexMaps[0]];
          if (pkVal !== null && pkVal !== undefined && pkVal !== "") {
            return `${pkColumns[0]}=${String(pkVal)}`;
          }
        }
        return `Row ${rowIndex + 1}`;
      },
      [pkColumns, pkIndexMaps, t],
    );

    const openJsonViewerWindow = useCallback(
      async (
        value: unknown,
        originalValue: unknown,
        colName: string,
        rowData: unknown[],
        rowIndex: number,
        isInsertion: boolean,
        tempId: string | undefined,
        readOnly: boolean,
      ) => {
        try {
          const rowLabel = buildRowLabel(rowData, rowIndex, isInsertion);
          let cellKey: string | null = null;
          const canSaveBack =
            (isInsertion && !!tempId) ||
            (!isInsertion && pkIndexMaps.length > 0);
          if (isInsertion && tempId) {
            cellKey = `ins:${tempId}:${colName}`;
          } else if (!isInsertion && pkIndexMaps.length > 0) {
            const pkMapVal = buildPkMap(pkColumns!, rowData, pkIndexMaps);
            const serialized = serializePkKey(pkMapVal);
            if (serialized !== "" && serialized !== "null" && serialized !== "undefined") {
              cellKey = `pk:${serialized}:${colName}`;
            }
          }
          const sessionId = await invoke<string>("open_json_viewer_window", {
            value,
            originalValue,
            colName,
            rowLabel,
            readOnly: readOnly || !canSaveBack,
            cellKey,
          });
          pendingJsonSessions.current.set(sessionId, {
            colName,
            rowData,
            isInsertion,
            tempId,
          });
        } catch (e) {
          console.error("Failed to open JSON viewer window:", e);
        }
      },
      [buildRowLabel, pkIndexMaps, pkColumns],
    );

    useEffect(() => {
      const unlistenPromise = listen<{ session_id: string; value: unknown }>(
        "json-viewer:saved",
        (event) => {
          const { session_id, value } = event.payload;
          const session = pendingJsonSessions.current.get(session_id);
          if (!session) return;
          pendingJsonSessions.current.delete(session_id);

          const { colName, rowData, isInsertion, tempId } = session;
          if (isInsertion && onPendingInsertionChange && tempId) {
            onPendingInsertionChange(tempId, colName, value);
          } else if (!isInsertion && onPendingChange && pkIndexMaps.length > 0) {
            const pkMapVal = buildPkMap(pkColumns!, rowData, pkIndexMaps);
            onPendingChange(pkMapVal, colName, value);
          }
        },
      );
      return () => {
        unlistenPromise.then((fn) => fn());
      };
    }, [onPendingChange, onPendingInsertionChange, pkIndexMaps, pkColumns]);

    const fksByColumn = useMemo(
      () => pickPrimaryForeignKeyByColumn(foreignKeys),
      [foreignKeys],
    );

    // Merge existing rows with pending insertions
    const mergedRows = useMemo(() => {
      const rows: MergedRow[] = [];

      // Add existing rows first (displayIndex 0, 1, 2, ...)
      data.forEach((rowData, idx) => {
        rows.push({
          type: "existing",
          rowData,
          displayIndex: idx,
        });
      });

      // Add pending insertions at the end
      if (pendingInsertions) {
        const existingRowCount = data.length;
        let insertionIndex = 0;
        Object.entries(pendingInsertions).forEach(([tempId, insertion]) => {
          const rowData = columns.map((col) => insertion.data[col] ?? null);
          rows.push({
            type: "insertion",
            rowData,
            displayIndex: existingRowCount + insertionIndex,
            tempId,
          });
          insertionIndex++;
        });
      }

      // Sort by displayIndex (insertions are now at the end)
      return rows.sort((a, b) => a.displayIndex - b.displayIndex);
    }, [data, pendingInsertions, columns]);

    // The value shown in the cell inspector. Sensitive columns show the masked value and cannot be edited there.
    const inspectorIsMasked =
      !!inspectorCell && isMaskingEnabledProp && isSensitiveColumn(inspectorCell.colName, maskingExtraColumns);
    const inspectorRawValue = inspectorCell
      ? mergedRows[inspectorCell.rowIndex]?.rowData[inspectorCell.colIndex] ?? inspectorCell.value
      : undefined;
    const inspectorValue =
      inspectorIsMasked && inspectorCell
        ? maskSensitiveValue(inspectorRawValue, inspectorCell.colName, maskingProfile)
        : inspectorRawValue;

    const handleRowClick = useCallback(
      (index: number, event: React.MouseEvent) => {
        let newSelected = new Set(selectedRowIndices);

        if (event.shiftKey && lastSelectedRowIndex !== null) {
          // Range selection
          const range = calculateSelectionRange(lastSelectedRowIndex, index);

          // If NOT Ctrl/Cmd, clear previous selection first (standard OS behavior)
          if (!event.ctrlKey && !event.metaKey) {
            newSelected.clear();
          }

          range.forEach((i) => newSelected.add(i));
        } else if (event.ctrlKey || event.metaKey) {
          // Toggle selection
          newSelected = toggleSetValue(newSelected, index);
          setLastSelectedRowIndex(index);
        } else {
          // Single selection
          newSelected.clear();
          newSelected.add(index);
          setLastSelectedRowIndex(index);
        }

        updateSelection(newSelected);
      },
      [selectedRowIndices, lastSelectedRowIndex, updateSelection],
    );

    const handleSelectAll = useCallback(() => {
      setFocusedCell(null);
      onForeignKeyHidePanel?.();
      if (selectedRowIndices.size === mergedRows.length) {
        updateSelection(new Set());
      } else {
        const allIndices = new Set(mergedRows.map((_, i) => i));
        updateSelection(allIndices);
        const allRows = maskRowsForCopy(mergedRows.map((r) => r.rowData));
        const text = copyFormat === "json"
          ? rowsToJSON(allRows, columns)
          : copyFormat === "sql-insert"
          ? rowsToSqlInsert(allRows, columns, tableName ?? "table")
          : copyFormat === "markdown"
          ? rowsToMarkdownTable(allRows, columns)
          : copyFormat === "typescript"
          ? rowsToTypeScriptInterface(tableName ?? "Record", columns, allRows)
          : csvIncludeHeaders
          ? rowsToCSVWithHeaders(allRows, columns, "null", csvDelimiter)
          : rowsToCSV(allRows, "null", csvDelimiter);
        copyTextToClipboard(text).catch((e) => {
          showAlert(t("common.error") + ": " + e, { title: t("common.error"), kind: "error" });
        });
      }
    }, [
      selectedRowIndices.size,
      mergedRows,
      updateSelection,
      onForeignKeyHidePanel,
      columns,
      copyFormat,
      csvDelimiter,
      csvIncludeHeaders,
      tableName,
      maskRowsForCopy,
      showAlert,
      t,
    ]);

    useEffect(() => {
      if (editingCell && editInputRef.current) {
        editInputRef.current.focus();
      }
    }, [editingCell]);

    const buildRowDataWithPending = useCallback(
      (rowArray: unknown[], isInsertion: boolean): Record<string, unknown> => {
        const rowData: Record<string, unknown> = {};
        columns.forEach((col, idx) => {
          rowData[col] = rowArray[idx];
        });
        if (!isInsertion && pkIndexMaps.length > 0) {
          const pkMapVal = buildPkMap(pkColumns!, rowArray, pkIndexMaps);
          const pending = pendingChanges?.[serializePkKey(pkMapVal)]?.changes;
          if (pending) Object.assign(rowData, pending);
        }
        return rowData;
      },
      [columns, pkIndexMaps, pkColumns, pendingChanges],
    );

    const handleCellDoubleClick = useCallback(
      (rowIndex: number, colIndex: number, value: unknown) => {
      if (!tableName || readonlyProp) return;

      const mergedRow = mergedRows[rowIndex];
      if (!mergedRow) return;
      // No primary key defined for the table at all → editing impossible.
      if (
        mergedRow.type !== "insertion" &&
        (!pkColumns || pkColumns.length === 0)
      )
        return;

      const colName = columns[colIndex];

      // For existing rows we must be able to build a safe UPDATE. Two guards,
      // each running whenever the data it depends on is available, so they
      // don't silently no-op when a driver omits result metadata:
      //
      // 1. Every primary key column must be present in the result set (needed
      //    for the WHERE clause). Depends only on pkColumns + columns.
      // 2. The edited column must map to a real physical column of the table
      //    (prevents malformed UPDATEs on aliased/computed columns). Requires
      //    columnMetadata; skipped when it's unavailable.
      if (mergedRow.type !== "insertion") {
        const missingPk = (pkColumns ?? []).filter(
          (pk) => !columns.some((c) => c.toLowerCase() === pk.toLowerCase()),
        );
        if (missingPk.length > 0) {
          showAlert(
            t("dataGrid.pkRequiredToEdit", {
              pk: missingPk.join(", "),
              defaultValue:
                'To edit this result, include the primary key column "{{pk}}" in your SELECT.',
            }),
            { title: t("common.error"), kind: "warning" },
          );
          return;
        }

        if (columnMetadata && columnMetadata.length > 0) {
          const realColumns = new Set(
            columnMetadata.map((c) => c.name.toLowerCase()),
          );
          if (!realColumns.has(colName.toLowerCase())) {
            showAlert(
              t("dataGrid.columnNotEditable", {
                column: colName,
                table: tableName,
                defaultValue:
                  'Column "{{column}}" can\'t be edited — it is not a direct column of table "{{table}}" (likely an alias or computed value).',
              }),
              { title: t("common.error"), kind: "warning" },
            );
            return;
          }
        }
      }

      const colType = columnTypeMap?.get(colName);

      if (
        colType &&
        (isBlobColumn(colType, columnLengthMap?.get(colName)) ||
          isBlobWireFormat(value))
      ) {
        setSidebarRowData({
          data: buildRowDataWithPending(
            mergedRow.rowData,
            mergedRow.type === "insertion",
          ),
          rowIndex,
          focusField: colName,
        });
        setSidebarOpen(true);
        return;
      }

      if (colType && isJsonColumn(colType)) {
        const isInsertion = mergedRow.type === "insertion";
        openJsonViewerWindow(
          value,
          mergedRow.rowData[colIndex],
          colName,
          mergedRow.rowData,
          rowIndex,
          isInsertion,
          mergedRow.tempId,
          readonlyProp ?? false,
        );
        return;
      }

      let editValue = value;
      if (
        colType &&
        isGeometricType(colType) &&
        value !== null &&
        value !== undefined
      ) {
        editValue = formatGeometricValue(value);
      }

      setEditingCell({ rowIndex, colIndex, value: editValue });
    },
      [
        tableName,
        readonlyProp,
        mergedRows,
        pkColumns,
        columns,
        columnTypeMap,
        columnLengthMap,
        columnMetadata,
        buildRowDataWithPending,
        openJsonViewerWindow,
        showAlert,
        t,
      ],
    );

    const isCommittingRef = useRef(false);

    const handleEditCommit = useCallback(async () => {
      // Prevent multiple concurrent commits (e.g., from rapid blur events)
      if (isCommittingRef.current) return;
      const editingCell = editingCellRef.current;
      if (!editingCell || !tableName) {
        setEditingCell(null);
        return;
      }

      isCommittingRef.current = true;

      try {
        const { rowIndex, colIndex, value } = editingCell;

        // Safety check: ensure mergedRows has data
        if (!mergedRows || rowIndex >= mergedRows.length) {
          console.warn("Invalid rowIndex in handleEditCommit");
          setEditingCell(null);
          return;
        }

        // Check if this is an insertion row
        const mergedRow = mergedRows[rowIndex];
        const isInsertion = mergedRow?.type === "insertion";

        if (isInsertion) {
          // Handle insertion cell edit
          if (onPendingInsertionChange && mergedRow.tempId) {
            const colName = columns[colIndex];
            onPendingInsertionChange(mergedRow.tempId, colName, value);
          }
          setEditingCell(null);
          return;
        }

        // Existing row logic
        const row = mergedRow.rowData;
        if (!row) {
          console.warn("Invalid row data in handleEditCommit");
          setEditingCell(null);
          return;
        }

        // Original value
        const originalValue = row[colIndex];

        // Check if value changed (handling string/number differences)
        const isUnchanged = String(value) === String(originalValue);

        if (isUnchanged && !onPendingChange) {
          setEditingCell(null);
          return;
        }

        // PK Value - check pkIndexMaps is valid
        if (pkIndexMaps.length === 0 || !pkColumns) {
          setEditingCell(null);
          return;
        }
        const pkMapVal = buildPkMap(pkColumns, row, pkIndexMaps);
        const colName = columns[colIndex];

        if (onPendingChange) {
          // If value matches original, pass undefined to remove the pending change
          onPendingChange(pkMapVal, colName, isUnchanged ? undefined : value);
          setEditingCell(null);
          return;
        }

        if (!connectionId) return;

        // Legacy immediate update
        try {
          await invoke("update_record", {
            connectionId,
            table: tableName,
            pkMap: pkMapVal,
            colName,
            newVal: value,
            ...(activeSchema ? { schema: activeSchema } : {}),
          });
          if (onRefresh) onRefresh();
        } catch (e) {
          console.error("Update failed:", e);
          showAlert(t("dataGrid.updateFailed") + e, {
            title: t("common.error"),
            kind: "error",
          });
        }
        setEditingCell(null);
      } finally {
        isCommittingRef.current = false;
      }
    }, [
      tableName,
      mergedRows,
      columns,
      onPendingInsertionChange,
      onPendingChange,
      pkIndexMaps,
      pkColumns,
      connectionId,
      activeSchema,
      onRefresh,
      showAlert,
      t,
    ]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
      const editingCell = editingCellRef.current;
      if (e.key === "Enter") {
        handleEditCommit();
      } else if (e.key === "Escape") {
        setEditingCell(null);
      } else if (e.key === "Tab") {
        e.preventDefault(); // Prevent default tab behavior

        if (!editingCell) return;

        // Commit current cell first
        handleEditCommit();

        const { rowIndex, colIndex } = editingCell;
        const totalRows = mergedRows.length;
        const totalCols = columns.length;

        // Calculate next position
        let nextRowIndex = rowIndex;
        let nextColIndex = colIndex + 1;

        // If we're at the last column, move to next row
        if (nextColIndex >= totalCols) {
          nextColIndex = 0;
          nextRowIndex = rowIndex + 1;

          // If we're at the last row, wrap to first row
          if (nextRowIndex >= totalRows) {
            nextRowIndex = 0;
          }
        }

        // Get the value of the next cell
        const nextRow = mergedRows[nextRowIndex];
        if (nextRow) {
          const nextValue = nextRow.rowData[nextColIndex];

          // Set editing on the next cell
          setTimeout(() => {
            setEditingCell({
              rowIndex: nextRowIndex,
              colIndex: nextColIndex,
              value: nextValue,
            });
          }, 0);
        }
      }
    }, [handleEditCommit, mergedRows, columns]);

    const columnHelper = useMemo(() => createColumnHelper<unknown[]>(), []);

    const coreRowModel = useMemo(() => getCoreRowModel(), []);

    const effectiveScrollKey = useMemo(() => {
      return resolveGridScrollKey(
        scrollKey,
        columnVisibilityKey,
        tableName,
        connectionId,
      );
    }, [scrollKey, columnVisibilityKey, tableName, connectionId]);

    const parentRef = useRef<HTMLDivElement>(null);
    const lastScrollLeftRef = useRef<number>(0);
    const lastScrollTopRef = useRef<number>(0);

    // Keep tracked scroll position updated on user scroll
    useEffect(() => {
      const el = parentRef.current;
      if (!el) return;

      const handleScroll = () => {
        lastScrollLeftRef.current = el.scrollLeft;
        lastScrollTopRef.current = el.scrollTop;
        if (effectiveScrollKey) {
          gridScrollPositions.set(effectiveScrollKey, {
            scrollLeft: el.scrollLeft,
            scrollTop: el.scrollTop,
          });
        }
      };

      el.addEventListener("scroll", handleScroll, { passive: true });
      return () => {
        el.removeEventListener("scroll", handleScroll);
      };
    }, [effectiveScrollKey]);

    // Restore scroll position on initial mount or key change
    useLayoutEffect(() => {
      const el = parentRef.current;
      if (!el) return;
      const saved = effectiveScrollKey ? gridScrollPositions.get(effectiveScrollKey) : undefined;
      const targetLeft = saved?.scrollLeft ?? lastScrollLeftRef.current;
      if (targetLeft > 0) {
        el.scrollLeft = targetLeft;
      }
      const targetTop = saved?.scrollTop ?? lastScrollTopRef.current;
      if (targetTop > 0) {
        el.scrollTop = targetTop;
      }
    }, [effectiveScrollKey]);

    // Preserve horizontal scroll position when data, columns, or sortClause updates
    useLayoutEffect(() => {
      const el = parentRef.current;
      if (!el) return;
      const saved = effectiveScrollKey ? gridScrollPositions.get(effectiveScrollKey) : undefined;
      const targetLeft = saved?.scrollLeft ?? lastScrollLeftRef.current;
      if (targetLeft > 0) {
        el.scrollLeft = targetLeft;
        const rafId = requestAnimationFrame(() => {
          if (el && targetLeft > 0 && Math.abs(el.scrollLeft - targetLeft) > 1) {
            el.scrollLeft = targetLeft;
          }
        });
        return () => cancelAnimationFrame(rafId);
      }
    }, [data, columns, sortClause, effectiveScrollKey]);

    const handleColumnSort = useCallback(
      (colName: string) => {
        if (!onSort) return;
        const el = parentRef.current;
        if (el) {
          lastScrollLeftRef.current = el.scrollLeft;
          lastScrollTopRef.current = el.scrollTop;
          if (effectiveScrollKey) {
            gridScrollPositions.set(effectiveScrollKey, {
              scrollLeft: el.scrollLeft,
              scrollTop: el.scrollTop,
            });
          }
        }
        onSort(colName);
      },
      [onSort, effectiveScrollKey],
    );

    const tableColumns = React.useMemo(
      () =>
        columns.map((colName, index) =>
          columnHelper.accessor((row) => row[index], {
            // react-table requires a non-empty `id` when an accessorFn is used.
            // Some drivers (e.g. SQL Server `SELECT @@VERSION`, Postgres `SELECT 1 AS ""`)
            // return columns with an empty name, which would otherwise crash the grid.
            id: colName !== "" ? colName : `__unnamed_${index}__`,
            header: () => {
              const sortState = getColumnSortState(colName, sortClause);
              const displaySortState: "none" | "asc" | "desc" =
                sortState ?? "none";

              const isPk = Boolean(
                (pkColumns && pkColumns.includes(colName)) ||
                columnMetadata?.find((c) => c.name === colName)?.is_pk,
              );
              const fk = foreignKeys?.find((f) => f.column_name === colName);
              const meta = columnMetadata?.find((c) => c.name === colName);
              const colType = meta?.data_type || columnTypeMap?.get(colName);

              const sortPrompt = onSort
                ? displaySortState === "none"
                  ? t("dataGrid.sortByAsc", { col: colName })
                  : displaySortState === "asc"
                    ? t("dataGrid.sortByDesc", { col: colName })
                    : t("dataGrid.clearSort")
                : undefined;

              const tooltipText = buildColumnTooltip(
                colName,
                meta,
                isPk,
                fk,
                sortPrompt,
              );

              return (
                <div
                  className="flex flex-col gap-1 select-none group/header min-w-0"
                  title={tooltipText}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    {isPk && (
                      <span title={t("dataGrid.primaryKeyTooltip")} className="inline-flex items-center">
                        <Key
                          size={12}
                          className="text-amber-400 shrink-0"
                        />
                      </span>
                    )}
                    {fk && (
                      <span title={t("dataGrid.foreignKeyTooltip", { table: fk.ref_table, column: fk.ref_column })} className="inline-flex items-center">
                        <Link2
                          size={12}
                          className="text-cyan-400 shrink-0"
                        />
                      </span>
                    )}
                    <span
                      className="select-text cursor-text font-medium text-primary hover:text-white"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        // Allow selecting text without triggering sort
                        e.stopPropagation();
                      }}
                    >
                      {colName}
                    </span>
                    {colType && (() => {
                      const visual = getColumnTypeVisual(colType);
                      return (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => handleOpenQuickStats(colName, e)}
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border select-none shrink-0 cursor-pointer hover:brightness-125 active:scale-95 transition-all ${visual.badgeClass}`}
                          title={`${t("dataGrid.columnType")}: ${colType} • ${t("dataGrid.quickStatsHint")}`}
                        >
                          {visual.icon}
                          <span>{visual.shortName}</span>
                        </span>
                      );
                    })()}
                    {onSort && (
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label={sortPrompt}
                        onClick={() => handleColumnSort(colName)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onSort(colName);
                          }
                        }}
                        className="flex flex-col items-center justify-center p-0.5 rounded hover:bg-surface-secondary transition-colors cursor-pointer ml-auto"
                      >
                        {displaySortState === "asc" && (
                          <ArrowUp size={14} className="text-blue-400" />
                        )}
                        {displaySortState === "desc" && (
                          <ArrowDown size={14} className="text-blue-400" />
                        )}
                        {displaySortState === "none" && (
                          <ArrowUpDown
                            size={14}
                            className="text-secondary/60 opacity-50 group-hover/header:opacity-100 transition-opacity"
                          />
                        )}
                      </span>
                    )}
                  </div>
                  {/* Header Distribution Mini-Bar */}
                  {data.length > 0 && (() => {
                    const dist = columnDistributionMap.get(colName);
                    if (!dist) return null;
                    const validPct = Math.round(dist.validRatio * 100);
                    return (
                      <div
                        className="w-full h-[2.5px] bg-surface-secondary/70 rounded-full overflow-hidden flex"
                        title={t("dataGrid.distributionTitle", { valid: dist.validCount, validPct, nulls: dist.nullCount, nullPct: 100 - validPct })}
                      >
                        <div style={{ width: `${validPct}%` }} className="bg-emerald-500/80 h-full" />
                        {dist.nullCount > 0 && (
                          <div style={{ width: `${100 - validPct}%` }} className="bg-amber-500/60 h-full" />
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            },
          }),
        ),
      [
        columns,
        columnHelper,
        t,
        sortClause,
        handleColumnSort,
        pkColumns,
        foreignKeys,
        columnMetadata,
        columnTypeMap,
      ],
    );

    const [parentViewportWidth, setParentViewportWidth] = useState(0);

    useEffect(() => {
      const el = parentRef.current;
      if (!el) return;
      const update = () => setParentViewportWidth(el.clientWidth);
      update();
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    // Memoize table data to prevent unnecessary re-renders
    const tableData = useMemo(
      () => mergedRows.map((r) => r.rowData),
      [mergedRows],
    );

    const columnVisibility = useMemo(
      () => computeColumnVisibility(hiddenColumns),
      [hiddenColumns],
    );

    const table = useReactTable({
      data: tableData,
      columns: tableColumns,
      getCoreRowModel: coreRowModel,
      state: { columnVisibility },
      onColumnVisibilityChange: () => {
        /* visibility is controlled externally via hiddenColumns */
      },
    });

    const { rows: tableRows } = table.getRowModel();

    const rowVirtualizer = useVirtualizer({
      count: tableRows.length,
      getScrollElement: () => parentRef.current,
      estimateSize: () => 35,
      overscan: 10,
    });

    // Track insertion count to auto-scroll to bottom when new rows are added
    const prevInsertionCountRef = useRef(0);
    useEffect(() => {
      const insertionCount = pendingInsertions
        ? Object.keys(pendingInsertions).length
        : 0;
      if (
        insertionCount > prevInsertionCountRef.current &&
        tableRows.length > 0
      ) {
        rowVirtualizer.scrollToIndex(tableRows.length - 1, { align: "end" });
      }
      prevInsertionCountRef.current = insertionCount;
    }, [pendingInsertions, tableRows.length, rowVirtualizer]);

    const handleContextMenu = useCallback(
      (
        e: React.MouseEvent,
        row: unknown[],
        rowIndex: number,
        colIndex: number,
        colName: string,
      ) => {
        if (tableName) {
          e.preventDefault();
          // Find the merged row corresponding to this DOM element
          const mergedRow = mergedRows.find((mr) => mr.rowData === row);
          setContextMenu({
            x: e.clientX,
            y: e.clientY,
            row,
            rowIndex,
            colIndex,
            colName,
            mergedRow,
          });
        }
      },
      [tableName, mergedRows],
    );

    const revertSelectedRow = useCallback(() => {
      if (!contextMenu) return;

      const isInsertion = contextMenu.mergedRow?.type === "insertion";
      const tempId = contextMenu.mergedRow?.tempId;

      // Handle insertion row revert (discard)
      if (isInsertion && tempId && onDiscardInsertion) {
        onDiscardInsertion(tempId);
        setContextMenu(null);
        return;
      }

      // For existing rows, need pkColumns
      if (!pkColumns || pkIndexMaps.length === 0) return;

      const pkMapVal = buildPkMap(pkColumns, contextMenu.row, pkIndexMaps);
      const pkValStr = serializePkKey(pkMapVal);

      // Handle pending deletion revert
      const isPendingDelete = pendingDeletions?.[pkValStr] !== undefined;
      if (isPendingDelete && onRevertDeletion) {
        onRevertDeletion(pkMapVal);
        setContextMenu(null);
        return;
      }

      // Handle pending changes revert
      const rowPendingChanges = pendingChanges?.[pkValStr];
      if (rowPendingChanges && onPendingChange) {
        // Revert all pending changes for this row by setting them to undefined
        Object.keys(rowPendingChanges.changes).forEach((colName) => {
          onPendingChange(pkMapVal, colName, undefined);
        });
        setContextMenu(null);
        return;
      }

      setContextMenu(null);
    }, [
      contextMenu,
      onPendingChange,
      onRevertDeletion,
      onDiscardInsertion,
      pkColumns,
      pkIndexMaps,
      pendingChanges,
      pendingDeletions,
    ]);

    const deleteRowsByIndices = useCallback((indicesToDelete: number[]) => {
      const pkVals: unknown[] = [];
      for (const idx of indicesToDelete) {
        const mergedRow = mergedRows[idx];
        if (!mergedRow) continue;

        if (mergedRow.type === "insertion" && mergedRow.tempId && onDiscardInsertion) {
          onDiscardInsertion(mergedRow.tempId);
        } else if (mergedRow.type === "existing" && pkColumns && pkIndexMaps.length > 0) {
          pkVals.push(buildPkMap(pkColumns, mergedRow.rowData, pkIndexMaps));
        }
      }

      // Use batch handler to avoid stale-closure overwrites when called per-row.
      if (pkVals.length > 0) {
        if (onMarkMultipleForDeletion) {
          onMarkMultipleForDeletion(pkVals);
        } else if (onMarkForDeletion) {
          pkVals.forEach((v) => onMarkForDeletion(v));
        }
      }
    }, [mergedRows, onDiscardInsertion, onMarkForDeletion, onMarkMultipleForDeletion, pkColumns, pkIndexMaps]);

    const deleteSelectedRow = useCallback(() => {
      if (!contextMenu) return;

      // If the right-clicked row is part of a multi-selection, delete all selected rows.
      // Otherwise fall back to deleting just the right-clicked row.
      const rightClickedIsSelected = selectedRowIndices.has(contextMenu.rowIndex);
      const indicesToDelete =
        rightClickedIsSelected && selectedRowIndices.size > 1
          ? Array.from(selectedRowIndices)
          : [contextMenu.rowIndex];

      deleteRowsByIndices(indicesToDelete);
      setContextMenu(null);
    }, [contextMenu, selectedRowIndices, deleteRowsByIndices]);

    const duplicateSelectedRow = useCallback(() => {
      if (!contextMenu || !onDuplicateRow) return;

      const mergedRow = contextMenu.mergedRow;
      const rowData: Record<string, unknown> = {};

      if (mergedRow?.type === "insertion" && mergedRow.tempId && pendingInsertions) {
        const insertion = pendingInsertions[mergedRow.tempId];
        if (insertion) {
          Object.assign(rowData, insertion.data);
        }
      } else {
        columns.forEach((col, idx) => {
          rowData[col] = contextMenu.row[idx];
        });
      }

      onDuplicateRow(rowData);
      setContextMenu(null);
    }, [contextMenu, columns, pendingInsertions, onDuplicateRow]);

    const openSidebarEditor = useCallback(() => {
      if (!contextMenu) return;
      const isInsertion = contextMenu.mergedRow?.type === "insertion";
      setSidebarRowData({
        data: buildRowDataWithPending(contextMenu.row, isInsertion ?? false),
        rowIndex: contextMenu.rowIndex,
      });
      setSidebarOpen(true);
      setContextMenu(null);
    }, [contextMenu, buildRowDataWithPending]);

    const openJsonEditor = useCallback(() => {
      if (!contextMenu) return;
      const isInsertion = contextMenu.mergedRow?.type === "insertion";

      openJsonViewerWindow(
        contextMenu.row[contextMenu.colIndex],
        contextMenu.row[contextMenu.colIndex],
        contextMenu.colName,
        contextMenu.row,
        contextMenu.rowIndex,
        isInsertion,
        contextMenu.mergedRow?.tempId,
        readonlyProp ?? false,
      );
      setContextMenu(null);
    }, [contextMenu, openJsonViewerWindow, readonlyProp]);

    // Unified handler for setting cell values from context menu actions
    const setCellValue = useCallback(
      (value: unknown) => {
        if (!contextMenu) return;
        const { colName, mergedRow } = contextMenu;
        const isInsertion = mergedRow?.type === "insertion";

        if (isInsertion && onPendingInsertionChange && mergedRow.tempId) {
          onPendingInsertionChange(mergedRow.tempId, colName, value);
        } else if (onPendingChange && pkIndexMaps.length > 0) {
          const pkMapVal = buildPkMap(pkColumns!, contextMenu.row, pkIndexMaps);
          onPendingChange(pkMapVal, colName, value);
        }
        setContextMenu(null);
      },
      [contextMenu, onPendingInsertionChange, onPendingChange, pkIndexMaps, pkColumns],
    );

    const setCellGenerate = useCallback(
      () => setCellValue(null),
      [setCellValue],
    );
    const setCellNull = useCallback(() => setCellValue(null), [setCellValue]);
    const setCellDefault = useCallback(() => {
      if (!contextMenu) return;
      const isInsertion = contextMenu.mergedRow?.type === "insertion";
      // For insertions, null triggers <default> display; for existing rows, use sentinel
      setCellValue(isInsertion ? null : USE_DEFAULT_SENTINEL);
    }, [contextMenu, setCellValue]);
    const setCellEmpty = useCallback(() => setCellValue(" "), [setCellValue]);

    const setCellServerNow = useCallback(() => {
      if (!contextMenu || !connectionId) return;
      const { colName, mergedRow, row } = contextMenu;
      const isInsertion = mergedRow?.type === "insertion";
      const colDataType = columnTypeMap?.get(colName) ?? "";
      const dateMode = getDateInputMode(colDataType);
      if (!dateMode) return;

      setContextMenu(null);
      invoke<string>("get_server_now", { connectionId })
        .then((raw) => {
          const formatted = formatDateTime(parseDateTime(raw), dateMode);
          if (isInsertion && onPendingInsertionChange && mergedRow?.tempId) {
            onPendingInsertionChange(mergedRow.tempId, colName, formatted);
          } else if (onPendingChange && pkIndexMaps.length > 0) {
            const pkMapVal = buildPkMap(pkColumns!, row, pkIndexMaps);
            onPendingChange(pkMapVal, colName, formatted);
          }
        })
        .catch((err) => {
          showAlert(String(err), { title: t("general.error"), kind: "error" });
        });
    }, [
      contextMenu,
      connectionId,
      columnTypeMap,
      onPendingInsertionChange,
      onPendingChange,
      pkIndexMaps,
      pkColumns,
      t,
      showAlert,
    ]);

    const copyToClipboard = useCallback(
      async (text: string) => {
        try {
          await copyTextToClipboard(text);
          // Optional: show a brief success message
          // showAlert(t("dataGrid.copied"), { title: t("common.success"), kind: "info" });
        } catch (e) {
          console.error("Copy failed:", e);
          showAlert(t("common.error") + ": " + e, {
            title: t("common.error"),
            kind: "error",
          });
        }
      },
      [t, showAlert],
    );

    const formatRows = useCallback(
      (rawRows: unknown[][], withHeaders = false) => {
        const rows = maskRowsForCopy(rawRows);
        if (copyFormat === "json") return rowsToJSON(rows, columns);
        if (copyFormat === "sql-insert")
          return rowsToSqlInsert(rows, columns, tableName ?? "table");
        if (copyFormat === "markdown")
          return rowsToMarkdownTable(rows, columns);
        if (copyFormat === "typescript")
          return rowsToTypeScriptInterface(tableName ?? "Record", columns, rows);
        if (withHeaders && csvIncludeHeaders)
          return rowsToCSVWithHeaders(rows, columns, "null", csvDelimiter);
        return rowsToCSV(rows, "null", csvDelimiter);
      },
      [columns, copyFormat, csvDelimiter, csvIncludeHeaders, tableName, maskRowsForCopy],
    );

    const copySelectedOrContextRow = useCallback(async () => {
      if (!contextMenu) return;

      const rows =
        selectedRowIndices.size > 0
          ? getSelectedRows(data, selectedRowIndices)
          : [contextMenu.row];

      await copyToClipboard(formatRows(rows, true));
    }, [contextMenu, selectedRowIndices, data, formatRows, copyToClipboard]);

    const copyHeaderName = useCallback(async () => {
      if (!headerContextMenu) return;
      await copyToClipboard(headerContextMenu.colName);
      setHeaderContextMenu(null);
    }, [headerContextMenu, copyToClipboard]);

    const copyHeaderNameQuoted = useCallback(async () => {
      if (!headerContextMenu) return;
      await copyToClipboard(`\`${headerContextMenu.colName}\``);
      setHeaderContextMenu(null);
    }, [headerContextMenu, copyToClipboard]);

    const copyHeaderNameTable = useCallback(async () => {
      if (!headerContextMenu) return;
      const tName = tableName ? `${tableName}.` : "";
      await copyToClipboard(`${tName}${headerContextMenu.colName}`);
      setHeaderContextMenu(null);
    }, [headerContextMenu, tableName, copyToClipboard]);

    const copySelectedCells = useCallback(async () => {
      if (selectedRowIndices.size === 0) return;
      await copyToClipboard(
        formatRows(getSelectedRows(data, selectedRowIndices), true),
      );
    }, [selectedRowIndices, data, formatRows, copyToClipboard]);

    const copyCellValue = useCallback(
      async (rowIndex: number, colIndex: number) => {
        const mergedRow = mergedRows[rowIndex];
        if (!mergedRow) return;
        const rawValue = mergedRow.rowData[colIndex];
        const colName = columns[colIndex];
        const colType = columnTypeMap?.get(colName);
        const colLength = columnLengthMap?.get(colName);
        const text =
          isMaskingEnabledProp && isSensitiveColumn(colName, maskingExtraColumns)
            ? maskSensitiveValue(rawValue, colName, maskingProfile)
            : formatCellValue(rawValue, "null", colType, colLength);
        await copyToClipboard(text);
      },
      [
        mergedRows,
        columns,
        columnTypeMap,
        columnLengthMap,
        copyToClipboard,
        isMaskingEnabledProp,
        maskingExtraColumns,
        maskingProfile,
      ],
    );

    const copyCellFromContext = useCallback(async () => {
      if (!contextMenu) return;
      await copyCellValue(contextMenu.rowIndex, contextMenu.colIndex);
      setContextMenu(null);
    }, [contextMenu, copyCellValue]);

    // Handle keyboard shortcuts
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        // CMD/CTRL + C
        if ((e.metaKey || e.ctrlKey) && e.key === "c") {
          // Only handle if not editing a cell
          if (!editingCell) {
            if (focusedCell) {
              e.preventDefault();
              copyCellValue(focusedCell.rowIndex, focusedCell.colIndex);
            } else if (selectedRowIndices.size > 0) {
              e.preventDefault();
              copySelectedCells();
            }
          }
        }

        // Delete / Backspace — delete selected rows
        if ((e.key === "Delete" || e.key === "Backspace") && !editingCell && !readonlyProp && selectedRowIndices.size > 0) {
          e.preventDefault();
          deleteRowsByIndices(Array.from(selectedRowIndices));
        }
      };

      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }, [editingCell, selectedRowIndices, focusedCell, copyCellValue, copySelectedCells, readonlyProp, deleteRowsByIndices]);


    const columnNameToIndexMap = useMemo(() => {
      const map = new Map<string, number>();
      columns.forEach((col, idx) => map.set(col, idx));
      return map;
    }, [columns]);

    const activeHighlightRules = useMemo(() => {
      const rules = highlightRulesProp ?? (highlightStorageKey ? loadHighlightRules(highlightStorageKey) : []);
      return rules.filter((r) => r.enabled);
    }, [highlightRulesProp, highlightStorageKey]);

    // Stable per-row dependency bundle. Memoizing it lets React.memo on MemoRow
    // skip re-rendering rows that didn't change during scroll.
    const rowCtx: RowCtx = useMemo(
      () => ({
        columns,
        hiddenColumns,
        autoIncrementColumns,
        defaultValueColumns,
        nullableColumns,
        pkColumns,
        pendingChanges,
        columnTypeMap,
        columnLengthMap,
        resultColorClassMap,
        isJsonCellTarget,
        fksByColumn,
        t,
        mergedRows,
        pkIndexMaps,
        parentViewportWidth,
        isMaskingEnabled: isMaskingEnabledProp,
        maskingProfile,
        maskingExtraColumns,
        showCellDataBars,
        colNumericBoundsMap,
        connectionId,
        driver: activeDriver,
        schema: activeSchema,
        activeHighlightRules,
        columnNameToIndexMap,
        readonly: readonlyProp,
        updateSelection,
        setFocusedCell,
        setExpandedCell,
        setEditingCell,
        setSidebarRowData,
        setSidebarOpen,
        handleRowClick,
        handleCellDoubleClick,
        handleContextMenu,
        handleEditCommit,
        handleKeyDown,
        onForeignKeyShowPanel,
        onForeignKeyHidePanel,
        onForeignKeyNavigate,
        onPendingChange,
        onPendingInsertionChange,
        openJsonViewerWindow,
        buildRowDataWithPending,
        editInputRef,
      }),
      [
        columns,
        hiddenColumns,
        autoIncrementColumns,
        defaultValueColumns,
        nullableColumns,
        pkColumns,
        pendingChanges,
        columnTypeMap,
        columnLengthMap,
        resultColorClassMap,
        isJsonCellTarget,
        fksByColumn,
        t,
        mergedRows,
        pkIndexMaps,
        parentViewportWidth,
        isMaskingEnabledProp,
        maskingProfile,
        maskingExtraColumns,
        showCellDataBars,
        colNumericBoundsMap,
        connectionId,
        activeDriver,
        activeSchema,
        activeHighlightRules,
        columnNameToIndexMap,
        readonlyProp,
        updateSelection,
        setFocusedCell,
        setExpandedCell,
        setEditingCell,
        setSidebarRowData,
        setSidebarOpen,
        handleRowClick,
        handleCellDoubleClick,
        handleContextMenu,
        handleEditCommit,
        handleKeyDown,
        onForeignKeyShowPanel,
        onForeignKeyHidePanel,
        onForeignKeyNavigate,
        onPendingChange,
        onPendingInsertionChange,
        openJsonViewerWindow,
        buildRowDataWithPending,
        editInputRef,
      ],
    );

    // Show "no data" if there are no columns (even with pending insertions, we can't render without column info)
    // OR if there are columns but no data and no pending insertions
    if (columns.length === 0) {
      return (
        <div className="h-full flex items-center justify-center text-muted">
          {t("dataGrid.noData")}
        </div>
      );
    }

    return (
      <>
        <div
          ref={parentRef}
          className="h-full w-full overflow-auto border border-default rounded bg-elevated relative"
        >
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              position: "relative",
            }}
          >
            <table
              className="w-full text-left border-collapse absolute top-0 left-0"
              style={{
                transform: `translateY(${rowVirtualizer.getVirtualItems()[0]?.start ?? 0}px)`,
              }}
            >
              <thead
                className="bg-base sticky top-0 z-10 shadow-sm"
                style={{
                  transform: `translateY(${-1 * (rowVirtualizer.getVirtualItems()[0]?.start ?? 0)}px)`,
                }}
              >
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    <th
                      onClick={handleSelectAll}
                      className="px-2 py-2 text-xs font-semibold text-muted border-b border-r border-default bg-base sticky left-0 z-20 text-center select-none w-[50px] min-w-[50px] cursor-pointer hover:bg-elevated"
                    >
                      #
                    </th>
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className="px-4 py-2 text-xs font-semibold text-secondary tracking-wider border-b border-r border-default last:border-r-0 whitespace-nowrap"
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setHeaderContextMenu({
                            x: e.clientX,
                            y: e.clientY,
                            colName: header.id,
                          });
                        }}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {tableRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={table.getVisibleLeafColumns().length || columns.length + 1}
                      className="text-center py-16 px-4"
                    >
                      <div className="flex flex-col items-center justify-center max-w-sm mx-auto text-center space-y-3">
                        <div className="w-12 h-12 rounded-xl bg-surface-secondary/80 border border-default flex items-center justify-center text-muted">
                          <TableProperties size={24} className="opacity-60" />
                        </div>
                        <div className="space-y-1">
                          <h4 className="text-sm font-medium text-primary">
                            {t("dataGrid.noDataTitle")}
                          </h4>
                          <p className="text-xs text-muted leading-relaxed">
                            {t("dataGrid.noDataDesc")}
                          </p>
                        </div>
                        {onAddRow && !readonlyProp && (
                          <button
                            type="button"
                            onClick={onAddRow}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white shadow-sm transition-colors"
                          >
                            <Plus size={14} />
                            <span>{t("dataGrid.addFirstRow")}</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const rowIndex = virtualRow.index;
                    const row = tableRows[rowIndex];
                    const rowOriginal = row.original as unknown[];
                    const isSelected = selectedRowIndices.has(rowIndex);
                    const mergedRow = mergedRows[rowIndex];
                    const isInsertion = mergedRow?.type === "insertion";
                    const pkVal =
                      pkIndexMaps.length > 0 && pkColumns
                        ? serializePkKey(buildPkMap(pkColumns, rowOriginal as unknown[], pkIndexMaps))
                        : null;
                    const isPendingDelete =
                      !isInsertion && pkVal
                        ? pendingDeletions?.[pkVal] !== undefined
                        : false;
                    const isRowEditing = editingCell?.rowIndex === rowIndex;
                    const isRowFocused = focusedCell?.rowIndex === rowIndex;
                    const isRowExpanded = expandedCell?.rowIndex === rowIndex;
                    return (
                      <MemoRow
                        key={row.id}
                        ctx={rowCtx}
                        rowIndex={rowIndex}
                        rowOriginal={rowOriginal}
                        isSelected={isSelected}
                        isInsertion={isInsertion}
                        isPendingDelete={isPendingDelete}
                        pkVal={pkVal}
                        editingColIndex={isRowEditing ? editingCell!.colIndex : null}
                        editingValue={isRowEditing ? editingCell!.value : undefined}
                        focusedColIndex={isRowFocused ? focusedCell!.colIndex : null}
                        expandedColIndex={isRowExpanded ? expandedCell!.colIndex : null}
                        expandedKind={isRowExpanded ? expandedCell!.kind : null}
                      />
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {contextMenu &&
            (() => {
              // Check if this row has any pending changes, deletions, or is an insertion
              const isInsertion = contextMenu.mergedRow?.type === "insertion";
              const pkVal =
                pkIndexMaps.length > 0 && pkColumns
                  ? serializePkKey(buildPkMap(pkColumns, contextMenu.row, pkIndexMaps))
                  : null;
              const hasPendingChanges =
                !isInsertion && pkVal && pendingChanges?.[pkVal] !== undefined;
              const hasPendingDeletion =
                !isInsertion &&
                pkVal &&
                pendingDeletions?.[pkVal] !== undefined;

              // Enable revert if there's any pending change, deletion, or insertion
              const canRevert =
                isInsertion || hasPendingChanges || hasPendingDeletion;

              const deleteRowCount = selectedRowIndices.has(contextMenu.rowIndex)
                ? selectedRowIndices.size
                : 1;

              // Determine which cell value options to show based on column properties
              const { colName } = contextMenu;
              const isAutoIncrement = autoIncrementColumns?.includes(colName);
              const isNullable = nullableColumns?.includes(colName);
              const hasDefault = defaultValueColumns?.includes(colName);

              // Build menu items dynamically
              const menuItems: ContextMenuItem[] = [];

              if (!readonlyProp) {
                // Cell value manipulation options (shown first for cell context)
                // SET GENERATED only for insertion rows, not for existing rows
                if (isAutoIncrement && isInsertion) {
                  menuItems.push({
                    label: t("dataGrid.setGenerate"),
                    icon: Sparkles,
                    action: setCellGenerate,
                  });
                }
                if (isNullable) {
                  menuItems.push({
                    label: t("dataGrid.setNull"),
                    icon: Ban,
                    action: setCellNull,
                  });
                }
                if (hasDefault) {
                  menuItems.push({
                    label: t("dataGrid.setDefault"),
                    icon: FileDigit,
                    action: setCellDefault,
                  });
                }
                // Always allow setting empty string, except for BLOB columns
                const colDataType = columnTypeMap?.get(colName) ?? "";
                if (!isBlobColumn(colDataType, columnLengthMap?.get(colName))) {
                  menuItems.push({
                    label: t("dataGrid.setEmpty"),
                    icon: Copy,
                    action: setCellEmpty,
                  });
                }
                if (getDateInputMode(colDataType) !== null) {
                  menuItems.push({
                    label: t("dataGrid.setServerNow"),
                    icon: Clock,
                    action: setCellServerNow,
                  });
                }
                if (isJsonColumn(colDataType)) {
                  menuItems.push({
                    label: t("contextMenu.openJsonEditor"),
                    icon: Braces,
                    action: openJsonEditor,
                  });
                }

                // Separator before row actions
                if (menuItems.length > 0) {
                  menuItems.push({ separator: true });
                }
              }

              const fkContextValue =
                contextMenu.row[contextMenu.colIndex];
              const fkForContextPreview = getForeignKeyForPreview(
                contextMenu.colName,
                fkContextValue,
                fksByColumn,
                { isInsertion },
              );
              if (fkForContextPreview) {
                if (onForeignKeyShowPanel) {
                  menuItems.push({
                    label: t("dataGrid.previewReferenced"),
                    icon: PanelBottomOpen,
                    action: () => {
                      setFocusedCell({
                        rowIndex: contextMenu.rowIndex,
                        colIndex: contextMenu.colIndex,
                      });
                      updateSelection(new Set());
                      onForeignKeyShowPanel(
                        fkForContextPreview,
                        fkContextValue,
                      );
                      setContextMenu(null);
                    },
                  });
                }
                if (onForeignKeyNavigate) {
                  menuItems.push({
                    label: t("dataGrid.openReferenced", {
                      table: fkForContextPreview.ref_table,
                    }),
                    icon: ExternalLink,
                    action: () => {
                      onForeignKeyNavigate(
                        fkForContextPreview,
                        fkContextValue,
                      );
                      setContextMenu(null);
                    },
                  });
                }
                if (onForeignKeyShowPanel || onForeignKeyNavigate) {
                  menuItems.push({ separator: true });
                }
              }

              // "Filter by this value" (issue #853): hidden for blobs/JSON
              // (their wire formats don't survive a WHERE comparison) and for
              // insertion rows, which have no stored value to filter on yet.
              const colDataType = columnTypeMap?.get(contextMenu.colName) ?? "";
              const contextCellValue = contextMenu.row[contextMenu.colIndex];
              if (onFilterByValue && tableName && !isInsertion) {
                const isBlobCell =
                  isBlobColumn(colDataType, columnLengthMap?.get(contextMenu.colName)) ||
                  isBlobWireFormat(contextCellValue);
                if (
                  !isBlobCell &&
                  !isJsonCellTarget(colDataType, contextCellValue)
                ) {
                  menuItems.push({
                    label: t("dataGrid.filterByValue"),
                    icon: Filter,
                    submenu: [
                      {
                        label: contextMenu.colName,
                        header: true,
                        mono: true,
                        hint: formatCellValueFilterHint(contextCellValue),
                      },
                      ...getCellValueFilterOperators(contextCellValue, {
                        columnType: colDataType,
                      }).map((op) => ({
                        label: t(CELL_VALUE_FILTER_LABEL_KEYS[op]),
                        badge: CELL_VALUE_FILTER_BADGES[op],
                        action: () => {
                          onFilterByValue(
                            contextMenu.colName,
                            op,
                            contextCellValue,
                            colDataType || undefined,
                          );
                          setContextMenu(null);
                        },
                      })),
                    ],
                  });
                  menuItems.push({ separator: true });
                }
              }

              menuItems.push({
                label: t("dataGrid.copyCell"),
                icon: Copy,
                action: copyCellFromContext,
              });

              menuItems.push({
                label: t("dataGrid.copySelectedRows"),
                icon: Copy,
                action: copySelectedOrContextRow,
              });

              menuItems.push({
                label: t("dataGrid.copyAs"),
                icon: Copy,
                submenu: [
                  {
                    label: "JSON",
                    action: async () => {
                      const rows = maskRowsForCopy(
                        selectedRowIndices.size > 0
                          ? getSelectedRows(data, selectedRowIndices)
                          : [contextMenu.row],
                        );
                      await copyToClipboard(rowsToJSON(rows, columns));
                      setContextMenu(null);
                    },
                  },
                  {
                    label: "SQL INSERT",
                    action: async () => {
                      const rows = maskRowsForCopy(
                        selectedRowIndices.size > 0
                          ? getSelectedRows(data, selectedRowIndices)
                          : [contextMenu.row],
                        );
                      await copyToClipboard(
                        rowsToSqlInsert(rows, columns, tableName ?? "table"),
                      );
                      setContextMenu(null);
                    },
                  },
                  {
                    label: t("dataGrid.copyCsvWithHeader"),
                    action: async () => {
                      const rows = maskRowsForCopy(
                        selectedRowIndices.size > 0
                          ? getSelectedRows(data, selectedRowIndices)
                          : [contextMenu.row],
                        );
                      await copyToClipboard(
                        rowsToCSVWithHeaders(rows, columns, "null", csvDelimiter),
                      );
                      setContextMenu(null);
                    },
                  },
                  {
                    label: "Markdown Table",
                    action: async () => {
                      const rows = maskRowsForCopy(
                        selectedRowIndices.size > 0
                          ? getSelectedRows(data, selectedRowIndices)
                          : [contextMenu.row],
                        );
                      await copyToClipboard(rowsToMarkdownTable(rows, columns));
                      setContextMenu(null);
                    },
                  },
                  {
                    label: "TypeScript Interface",
                    action: async () => {
                      const rows = maskRowsForCopy(
                        selectedRowIndices.size > 0
                          ? getSelectedRows(data, selectedRowIndices)
                          : [contextMenu.row],
                        );
                      await copyToClipboard(
                        rowsToTypeScriptInterface(tableName ?? "Record", columns, rows),
                      );
                      setContextMenu(null);
                    },
                  },
                ],
              });

              menuItems.push({
                label: t("dataGrid.inspectCell"),
                icon: Eye,
                action: () => {
                  setInspectorCell({
                    rowIndex: contextMenu.rowIndex,
                    colIndex: contextMenu.colIndex,
                    colName: contextMenu.colName,
                    value: contextMenu.row[contextMenu.colIndex],
                  });
                  setInspectorOpen(true);
                  setContextMenu(null);
                },
              });

              if (!readonlyProp) {
                menuItems.push(
                  {
                    label: t("contextMenu.openSidebar"),
                    icon: Edit,
                    action: openSidebarEditor,
                  },
                  {
                    label: t("dataGrid.duplicateRow"),
                    icon: CopyPlus,
                    action: duplicateSelectedRow,
                  },
                  {
                    label: deleteRowCount > 1
                      ? t("dataGrid.deleteRows", { count: deleteRowCount })
                      : t("dataGrid.deleteRow"),
                    icon: Trash2,
                    danger: true,
                    action: deleteSelectedRow,
                  },
                  {
                    label: t("dataGrid.revertSelected"),
                    icon: Undo,
                    action: revertSelectedRow,
                    disabled: !canRevert,
                  },
                );
              }

              return (
                <ContextMenu
                  x={contextMenu.x}
                  y={contextMenu.y}
                  onClose={() => setContextMenu(null)}
                  items={menuItems}
                >
                  <SlotAnchor
                    name="data-grid.context-menu.items"
                    context={{
                      connectionId,
                      tableName,
                      schema: activeSchema,
                      columnName: contextMenu.colName,
                      rowIndex: contextMenu.rowIndex,
                      rowData: mergedRows[contextMenu.rowIndex]
                        ?.rowData as unknown as
                        | Record<string, unknown>
                        | undefined,
                    }}
                    className="border-t border-default mt-1 pt-1"
                  />
                </ContextMenu>
              );
            })()}

          {headerContextMenu && (
            <ContextMenu
              x={headerContextMenu.x}
              y={headerContextMenu.y}
              onClose={() => setHeaderContextMenu(null)}
              items={[
                {
                  label: t("dataGrid.profileColumn"),
                  icon: BarChart2,
                  action: () => {
                    const colName = headerContextMenu.colName;
                    const colType = columnTypeMap?.get(colName);
                    const rowObjects = data.map((r) => {
                      const obj: Record<string, unknown> = {};
                      columns.forEach((col, idx) => { obj[col] = r[idx]; });
                      return obj;
                    });
                    const prof = profileColumn(colName, rowObjects, colType);
                    setSelectedColumnProfile(prof);
                    setIsProfileModalOpen(true);
                    setHeaderContextMenu(null);
                  },
                },
                {
                  label: t("dataGrid.hideColumn"),
                  icon: EyeOff,
                  action: () => hideColumn(headerContextMenu.colName),
                },
                ...(hiddenColumns.size > 0
                  ? [
                      ...[...hiddenColumns].map((col) => ({
                        label: t("dataGrid.showColumn", { col }),
                        icon: Eye,
                        action: () => toggleColumn(col),
                      })),
                      {
                        label: t("dataGrid.showAllColumns", {
                          count: hiddenColumns.size,
                        }),
                        icon: Eye,
                        action: showAllColumns,
                      },
                    ]
                  : []),
                {
                  label: t("dataGrid.copyColumnName"),
                  icon: Copy,
                  action: copyHeaderName,
                },
                {
                  label: t("dataGrid.copyColumnNameQuoted"),
                  icon: Copy,
                  action: copyHeaderNameQuoted,
                },
                {
                  label: t("dataGrid.copyColumnNameTable"),
                  icon: Copy,
                  action: copyHeaderNameTable,
                },
              ]}
            />
          )}

          {quickStatsState.isOpen && quickStatsState.profile && (
            <ColumnQuickStatsPopover
              isOpen={quickStatsState.isOpen}
              onClose={() => setQuickStatsState((prev) => ({ ...prev, isOpen: false }))}
              anchorRect={quickStatsState.anchorRect}
              profile={quickStatsState.profile}
              declaredType={quickStatsState.declaredType}
              onOpenFullModal={() => {
                setSelectedColumnProfile(quickStatsState.profile);
                setIsProfileModalOpen(true);
              }}
            />
          )}

          {isProfileModalOpen && selectedColumnProfile && (
            <ColumnProfileModal
              isOpen={isProfileModalOpen}
              onClose={() => setIsProfileModalOpen(false)}
              profile={selectedColumnProfile}
            />
          )}

          {/* Row Editor Sidebar */}
          {sidebarOpen &&
            sidebarRowData &&
            (() => {
              const mergedRow = mergedRows[sidebarRowData.rowIndex];
              const isInsertion = mergedRow?.type === "insertion";
              const originalRowData =
                mergedRow && mergedRow.type === "existing"
                  ? columns.reduce<Record<string, unknown>>((acc, col, idx) => {
                      acc[col] = mergedRow.rowData[idx];
                      return acc;
                    }, {})
                  : undefined;

              return (
                <RowEditorSidebar
                  isOpen={sidebarOpen}
                  onClose={() => {
                    setSidebarOpen(false);
                    setSidebarRowData(null);
                  }}
                  rowData={sidebarRowData.data}
                  originalRowData={originalRowData}
                  detectJsonInTextColumns={detectJsonInTextColumns}
                  rowIndex={sidebarRowData.rowIndex}
                  isInsertion={isInsertion}
                  columns={columns.map((colName, index) => ({
                    name: colName,
                    type: columnMetadata?.[index]?.data_type,
                    characterMaximumLength:
                      columnMetadata?.[index]?.character_maximum_length,
                  }))}
                  autoIncrementColumns={autoIncrementColumns}
                  defaultValueColumns={defaultValueColumns}
                  nullableColumns={nullableColumns}
                  focusField={sidebarRowData.focusField}
                  connectionId={connectionId}
                  tableName={tableName}
                  pkColumns={pkColumns}
                  schema={activeSchema}
                  onChange={(colName, value) => {
                    // Get the merged row to determine if it's an insertion or existing row
                    const mergedRow = mergedRows[sidebarRowData.rowIndex];
                    if (!mergedRow) return;

                    const isInsertion = mergedRow.type === "insertion";

                    // Apply change immediately
                    if (
                      isInsertion &&
                      onPendingInsertionChange &&
                      mergedRow.tempId
                    ) {
                      // Handle insertion row updates
                      onPendingInsertionChange(
                        mergedRow.tempId,
                        colName,
                        value,
                      );
                    } else if (
                      !isInsertion &&
                      onPendingChange &&
                      pkColumns &&
                      pkIndexMaps.length > 0
                    ) {
                      // Handle existing row updates
                      const rowData = mergedRow.rowData;
                      if (rowData) {
                        const pkMapVal = buildPkMap(pkColumns, rowData, pkIndexMaps);
                        onPendingChange(pkMapVal, colName, value);
                      }
                    }
                  }}
                />
              );
            })()}

          {inspectorOpen && inspectorCell && (
            <CellValueInspector
              isOpen={inspectorOpen}
              onClose={() => setInspectorOpen(false)}
              columnName={inspectorCell.colName}
              columnType={columnTypeMap?.get(inspectorCell.colName)}
              cellValue={inspectorValue}
              rowIndex={inspectorCell.rowIndex}
              readOnly={readonlyProp || inspectorIsMasked}
              onApplyValue={(val) => {
                const mergedRow = mergedRows[inspectorCell.rowIndex];
                if (!mergedRow) return;
                const isInsertion = mergedRow.type === "insertion";
                const colName = inspectorCell.colName;
                if (isInsertion && onPendingInsertionChange && mergedRow.tempId) {
                  onPendingInsertionChange(mergedRow.tempId, colName, val);
                } else if (!isInsertion && onPendingChange && pkColumns && pkIndexMaps.length > 0) {
                  const pkMapVal = buildPkMap(pkColumns, mergedRow.rowData, pkIndexMaps);
                  onPendingChange(pkMapVal, colName, val);
                }
              }}
            />
          )}
        </div>
      </>
    );
  },
);

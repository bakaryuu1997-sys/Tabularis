import React, { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Filter,
  ArrowUpDown,
  ListFilter,
  Plus,
  SlidersHorizontal,
  X,
  Play,
  Search,
  ChevronDown,
  RotateCcw,
  Highlighter,
} from "lucide-react";
import type { TableColumn } from "../../types/editor";
import {
  filterColumnSuggestions,
  getCurrentWordPrefix,
  replaceCurrentWord,
  buildStructuredFilterClause,
  buildSingleFilterClause,
  createEmptyFilter,
  buildGlobalSearchClause,
  isTextColumn,
} from "../../utils/filterBar";
import type { StructuredFilter } from "../../utils/filterBar";
import { formatSqlIdentifier } from "../../utils/identifiers";
import { formatSortClause } from "../../utils/tableToolbar";
import { FilterRow } from "./FilterRow";
import { SlotAnchor } from "./SlotAnchor";
import { useDatabase } from "../../hooks/useDatabase";
import { HighlightRulesModal } from "../modals/HighlightRulesModal";
import { type HighlightRule, loadHighlightRules, saveHighlightRules } from "../../utils/highlightRules";

export interface TableToolbarUpdate {
  filter: string;
  sort: string;
  limit: number | undefined;
  offset?: number;
  distinct?: boolean;
}

interface TableToolbarProps {
  initialFilter?: string;
  initialSort?: string;
  initialLimit?: number | null;
  initialOffset?: number | null;
  initialDistinct?: boolean;
  placeholderColumn: string;
  placeholderSort: string;
  defaultLimit: number;
  columnMetadata?: TableColumn[];
  onUpdate: (update: TableToolbarUpdate) => void;
  onRefresh?: () => void;
  isLoading?: boolean;
  highlightStorageKey?: string | null;
  tableName?: string | null;
  onHighlightRulesChange?: (rules: HighlightRule[]) => void;
}

interface TableToolbarInternalProps extends TableToolbarProps {
  panelOpen: boolean;
  onPanelOpenChange: (open: boolean) => void;
  advancedOpen: boolean;
  onAdvancedOpenChange: (open: boolean) => void;
  structuredFilters: StructuredFilter[];
  onStructuredFiltersChange: (filters: StructuredFilter[]) => void;
  appliedFilters: Record<string, boolean>;
  onTriggerApplied: (filterId: string) => void;
  onResetApplied: (filterId: string) => void;
  onResetAllApplied: () => void;
  highlightStorageKey?: string | null;
  tableName?: string | null;
  onHighlightRulesChange?: (rules: HighlightRule[]) => void;
}

// ─── Internal toolbar ─────────────────────────────────────────────────────────

const TableToolbarInternal = ({
  initialFilter,
  initialSort,
  initialLimit,
  initialOffset,
  initialDistinct,
  placeholderColumn,
  placeholderSort,
  defaultLimit,
  columnMetadata,
  panelOpen,
  onPanelOpenChange,
  advancedOpen,
  onAdvancedOpenChange,
  structuredFilters,
  onStructuredFiltersChange,
  appliedFilters,
  onTriggerApplied,
  onResetApplied,
  onResetAllApplied,
  onUpdate,
  onRefresh,
  isLoading,
  highlightStorageKey,
  tableName,
  onHighlightRulesChange,
}: TableToolbarInternalProps) => {
  const { t } = useTranslation();
  const { activeDriver } = useDatabase();

  const [isHighlightModalOpen, setIsHighlightModalOpen] = useState(false);
  const [highlightRules, setHighlightRules] = useState<HighlightRule[]>(() =>
    loadHighlightRules(highlightStorageKey ?? null)
  );

  useEffect(() => {
    setHighlightRules(loadHighlightRules(highlightStorageKey ?? null));
  }, [highlightStorageKey]);

  const activeHighlightCount = highlightRules.filter((r) => r.enabled).length;

  const handleRulesChange = (newRules: HighlightRule[]) => {
    setHighlightRules(newRules);
    saveHighlightRules(highlightStorageKey ?? null, newRules);
    onHighlightRulesChange?.(newRules);
  };

  const [filterInput, setFilterInput] = useState(initialFilter || "");
  const [sortInput, setSortInput] = useState(initialSort || "");
  const [limitInput, setLimitInput] = useState(
    initialLimit && initialLimit > 0 ? String(initialLimit) : ""
  );
  const [offsetInput, setOffsetInput] = useState(
    initialOffset && initialOffset > 0 ? String(initialOffset) : ""
  );
  const [distinctInput, setDistinctInput] = useState(initialDistinct ?? false);
  const [searchInput, setSearchInput] = useState("");

  // Autocomplete state — WHERE
  const [autocompleteOpen, setAutocompleteOpen] = useState(false);
  const [autocompleteItems, setAutocompleteItems] = useState<TableColumn[]>([]);
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);
  const filterInputRef = useRef<HTMLInputElement>(null);
  const autocompleteMouseDown = useRef(false);

  // Autocomplete state — ORDER BY
  const [sortAcOpen, setSortAcOpen] = useState(false);
  const [sortAcItems, setSortAcItems] = useState<TableColumn[]>([]);
  const [sortAcIndex, setSortAcIndex] = useState(0);
  const sortInputRef = useRef<HTMLInputElement>(null);
  const sortAcMouseDown = useRef(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const filtersButtonRef = useRef<HTMLButtonElement>(null);

  const columns = columnMetadata ?? [];
  const hasColumns = columns.length > 0;
  const activeFilterCount = structuredFilters.filter((f) => f.enabled !== false).length;

  // ── helpers ──────────────────────────────────────────────────────────────────

  const getLimitVal = useCallback(
    (limit: string) => (limit ? parseInt(limit, 10) : undefined),
    []
  );

  const getOffsetVal = useCallback(
    (offset: string) => {
      const n = offset ? parseInt(offset, 10) : undefined;
      return n && n > 0 ? n : undefined;
    },
    []
  );

  // Applies the given WHERE/ORDER BY/LIMIT together with the current advanced
  // options (OFFSET, DISTINCT). Explicit (button/Enter) only — never auto-runs.
  const commitSql = useCallback(
    (filter: string, sort: string, limit: string) => {
      onUpdate({
        filter,
        sort: formatSortClause(sort, activeDriver),
        limit: getLimitVal(limit),
        offset: getOffsetVal(offsetInput),
        distinct: distinctInput,
      });
    },
    [getLimitVal, getOffsetVal, onUpdate, activeDriver, offsetInput, distinctInput]
  );

  // Emits an already-built clause (structured-panel paths) together with the
  // current advanced options (OFFSET, DISTINCT).
  const emit = useCallback(
    (filter: string, sortFormatted: string, limit: number | undefined) => {
      onUpdate({
        filter,
        sort: sortFormatted,
        limit,
        offset: getOffsetVal(offsetInput),
        distinct: distinctInput,
      });
    },
    [onUpdate, getOffsetVal, offsetInput, distinctInput]
  );

  // Whether the current inputs differ from the last-applied (initial) values,
  // so the Apply button lights up exactly when applying would change the query.
  const isDirty =
    (filterInput || "") !== (initialFilter || "") ||
    (sortInput || "") !== (initialSort || "") ||
    (getLimitVal(limitInput) || undefined) !== (initialLimit || undefined) ||
    (getOffsetVal(offsetInput) || undefined) !== (initialOffset || undefined) ||
    (distinctInput || false) !== (initialDistinct || false);

  // ── click outside to close panel ─────────────────────────────────────────────

  useEffect(() => {
    if (!panelOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        filtersButtonRef.current &&
        !filtersButtonRef.current.contains(target)
      ) {
        closePanel();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  // closePanel is stable enough; adding it would cause infinite re-registration
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelOpen]);

  // ── panel helpers ─────────────────────────────────────────────────────────────

  const openPanel = () => {
    if (structuredFilters.length === 0 && hasColumns) {
      onStructuredFiltersChange([createEmptyFilter(columns)]);
    }
    onPanelOpenChange(true);
  };

  const closePanel = useCallback(() => {
    const clause = buildStructuredFilterClause(structuredFilters, activeDriver);
    setFilterInput(clause);
    onPanelOpenChange(false);
    emit(clause, formatSortClause(sortInput, activeDriver), getLimitVal(limitInput));
  }, [structuredFilters, sortInput, limitInput, getLimitVal, emit, onPanelOpenChange, activeDriver]);

  const togglePanel = () => {
    if (panelOpen) {
      closePanel();
    } else {
      openPanel();
    }
  };

  // ── structured filter actions ─────────────────────────────────────────────────

  // Applies all enabled filters — does NOT close panel
  const handleApplyAll = useCallback(() => {
    const clause = buildStructuredFilterClause(structuredFilters, activeDriver);
    emit(clause, formatSortClause(sortInput, activeDriver), getLimitVal(limitInput));
    structuredFilters.forEach((f) => {
      if (f.enabled !== false) {
        onTriggerApplied(f.id);
      } else {
        onResetApplied(f.id);
      }
    });
  }, [structuredFilters, sortInput, limitInput, getLimitVal, emit, onTriggerApplied, onResetApplied, activeDriver]);

  // Applies only that single row's filter — resets Applied on all others
  const handleApplySingle = useCallback(
    (filter: StructuredFilter) => {
      emit(
        buildSingleFilterClause(filter, activeDriver),
        formatSortClause(sortInput, activeDriver),
        getLimitVal(limitInput),
      );
      onResetAllApplied();
      onTriggerApplied(filter.id);
    },
    [sortInput, limitInput, getLimitVal, emit, onResetAllApplied, onTriggerApplied, activeDriver]
  );

  const handleUnset = () => {
    onStructuredFiltersChange([]);
    emit("", formatSortClause(sortInput, activeDriver), getLimitVal(limitInput));
  };

  const handleAddFilter = () => {
    if (!hasColumns) return;
    onStructuredFiltersChange([...structuredFilters, createEmptyFilter(columns)]);
  };

  const handleDuplicateFilter = (filter: StructuredFilter) => {
    const copy: StructuredFilter = {
      ...filter,
      id: `filter-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    };
    const idx = structuredFilters.findIndex((f) => f.id === filter.id);
    const next = [...structuredFilters];
    next.splice(idx === -1 ? structuredFilters.length : idx + 1, 0, copy);
    onStructuredFiltersChange(next);
  };

  const handleFilterChange = (index: number, updated: StructuredFilter) => {
    const next = [...structuredFilters];
    next[index] = updated;
    onStructuredFiltersChange(next);
    // Don't reset applied state when only the checkbox (enabled) changes
    const prev = structuredFilters[index];
    const onlyEnabledChanged =
      prev.column === updated.column &&
      prev.operator === updated.operator &&
      prev.value === updated.value &&
      prev.value2 === updated.value2;
    if (!onlyEnabledChanged) {
      onResetApplied(updated.id);
    }
  };

  const handleFilterRemove = (index: number) => {
    const removedId = structuredFilters[index].id;
    const next = structuredFilters.filter((_, i) => i !== index);
    onStructuredFiltersChange(next);
    onResetApplied(removedId);
  };

  const handlePanelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      closePanel();
    }
  };

  // ── SQL autocomplete ─────────────────────────────────────────────────────────

  const handleWhereChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFilterInput(value);

    if (!hasColumns) return;
    const cursorPos = e.target.selectionStart ?? value.length;
    const prefix = getCurrentWordPrefix(value, cursorPos);

    if (prefix.length > 0) {
      const suggestions = filterColumnSuggestions(columns, prefix);
      setAutocompleteItems(suggestions);
      setAutocompleteIndex(0);
      setAutocompleteOpen(suggestions.length > 0);
    } else {
      setAutocompleteOpen(false);
    }
  };

  const acceptSuggestion = (col: TableColumn) => {
    const input = filterInputRef.current;
    const cursorPos = input?.selectionStart ?? filterInput.length;
    const replacement = formatSqlIdentifier(col.name, activeDriver);
    const newValue = replaceCurrentWord(filterInput, cursorPos, replacement);
    setFilterInput(newValue);
    setAutocompleteOpen(false);

    setTimeout(() => {
      if (input) {
        input.focus();
        const before = filterInput.slice(0, cursorPos);
        const wordMatch = before.match(/[a-zA-Z0-9_]+$/);
        const wordStart = wordMatch ? cursorPos - wordMatch[0].length : cursorPos;
        input.setSelectionRange(wordStart + replacement.length, wordStart + replacement.length);
      }
    }, 0);
  };

  const handleWhereKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (autocompleteOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setAutocompleteIndex((i) => Math.min(i + 1, autocompleteItems.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setAutocompleteIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        acceptSuggestion(autocompleteItems[autocompleteIndex]);
        return;
      }
      if (e.key === "Escape") {
        setAutocompleteOpen(false);
        return;
      }
    }
    if (e.key === "Enter") {
      commitSql(filterInput, sortInput, limitInput);
    }
  };

  const handleWhereBlur = () => {
    if (autocompleteMouseDown.current) return;
    setAutocompleteOpen(false);
    // Intentionally does NOT run the query on blur: leaving the field (e.g. to
    // read the current table) must never wipe the results with a half-typed
    // clause. Changes are applied explicitly via the Apply button or Enter.
  };

  // Clear WHERE and re-run immediately — an empty clause is always valid, so
  // this is a safe one-click "show all rows" shortcut.
  const handleClearWhere = () => {
    setFilterInput("");
    setAutocompleteOpen(false);
    commitSql("", sortInput, limitInput);
    filterInputRef.current?.focus();
  };

  // Clear ORDER BY and re-run immediately.
  const handleClearSort = () => {
    setSortInput("");
    setSortAcOpen(false);
    commitSql(filterInput, "", limitInput);
    sortInputRef.current?.focus();
  };

  // ── global search (advanced row) ──────────────────────────────────────────────
  // Builds an OR-of-LIKE clause across all text columns and writes it into the
  // WHERE field so it stays visible/editable, then applies it. Reuses the normal
  // filter pipeline (no query-shape change).
  const hasTextColumns = columns.some((c) => isTextColumn(c.data_type));

  const applyGlobalSearch = () => {
    const term = searchInput.trim();
    const clause = buildGlobalSearchClause(columns, searchInput, activeDriver);
    // Non-empty term but nothing searchable (no text columns): do nothing.
    if (term && !clause) return;
    setFilterInput(clause);
    commitSql(clause, sortInput, limitInput);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      applyGlobalSearch();
    }
  };

  const handleClearSearch = () => {
    setSearchInput("");
    setFilterInput("");
    commitSql("", sortInput, limitInput);
  };

  // ── advanced options: DISTINCT + OFFSET ───────────────────────────────────────
  // DISTINCT is a deliberate toggle → apply immediately with the current form.
  const handleToggleDistinct = () => {
    const next = !distinctInput;
    setDistinctInput(next);
    onUpdate({
      filter: filterInput,
      sort: formatSortClause(sortInput, activeDriver),
      limit: getLimitVal(limitInput),
      offset: getOffsetVal(offsetInput),
      distinct: next,
    });
  };

  const handleOffsetKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") commitSql(filterInput, sortInput, limitInput);
  };

  // ── ORDER BY autocomplete ────────────────────────────────────────────────────

  const handleSortChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSortInput(value);
    if (!hasColumns) return;
    const cursorPos = e.target.selectionStart ?? value.length;
    const prefix = getCurrentWordPrefix(value, cursorPos);
    if (prefix.length > 0) {
      const suggestions = filterColumnSuggestions(columns, prefix);
      setSortAcItems(suggestions);
      setSortAcIndex(0);
      setSortAcOpen(suggestions.length > 0);
    } else {
      setSortAcOpen(false);
    }
  };

  const acceptSortSuggestion = (col: TableColumn) => {
    const input = sortInputRef.current;
    const cursorPos = input?.selectionStart ?? sortInput.length;
    const replacement = formatSqlIdentifier(col.name, activeDriver);
    const newValue = replaceCurrentWord(sortInput, cursorPos, replacement);
    setSortInput(newValue);
    setSortAcOpen(false);
    setTimeout(() => {
      if (input) {
        input.focus();
        const before = sortInput.slice(0, cursorPos);
        const wordMatch = before.match(/[a-zA-Z0-9_]+$/);
        const wordStart = wordMatch ? cursorPos - wordMatch[0].length : cursorPos;
        input.setSelectionRange(wordStart + replacement.length, wordStart + replacement.length);
      }
    }, 0);
  };

  const handleSortKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (sortAcOpen) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSortAcIndex((i) => Math.min(i + 1, sortAcItems.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSortAcIndex((i) => Math.max(i - 1, 0)); return; }
      if (e.key === "Enter") { e.preventDefault(); acceptSortSuggestion(sortAcItems[sortAcIndex]); return; }
      if (e.key === "Escape") { setSortAcOpen(false); return; }
    }
    if (e.key === "Enter") {
      if (!panelOpen) { commitSql(filterInput, sortInput, limitInput); } else { handleApplyAll(); }
    }
  };

  // ── shared ORDER BY / LIMIT ─────────────────────────────────────────────────

  const handleSortBlur = () => {
    if (sortAcMouseDown.current) return;
    setSortAcOpen(false);
    // Simple mode: do not auto-run on blur (see handleWhereBlur). When the
    // structured panel is open, ORDER BY still applies live alongside it.
    if (panelOpen) {
      emit(
        buildStructuredFilterClause(structuredFilters, activeDriver),
        formatSortClause(sortInput, activeDriver),
        getLimitVal(limitInput),
      );
    }
  };

  const handleLimitBlur = () => {
    // Simple mode: do not auto-run on blur (see handleWhereBlur). When the
    // structured panel is open, LIMIT still applies live alongside it.
    if (panelOpen) {
      emit(
        buildStructuredFilterClause(structuredFilters, activeDriver),
        formatSortClause(sortInput, activeDriver),
        getLimitVal(limitInput),
      );
    }
  };

  const handleSortLimitKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (!panelOpen) {
        commitSql(filterInput, sortInput, limitInput);
      } else {
        handleApplyAll();
      }
    }
  };

  // ── render ───────────────────────────────────────────────────────────────────

  return (
    <div className="relative">
      {/* Always-visible toolbar */}
      <div className="h-10 bg-elevated border-y border-default flex items-center px-2 gap-2">
        {/* Filters button */}
        {hasColumns && (
          <button
            ref={filtersButtonRef}
            onClick={togglePanel}
            title={t("toolbar.toggleFilterPanel")}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs border transition-all shrink-0 ${
              panelOpen
                ? "bg-blue-600/20 border-blue-500/50 text-blue-300"
                : "text-muted border-default hover:text-blue-300 hover:border-blue-500/40"
            }`}
          >
            <SlidersHorizontal size={12} />
            <span>{t("toolbar.filters")}</span>
            {activeFilterCount > 0 && (
              <span className="px-1 min-w-[16px] h-4 flex items-center justify-center rounded-full text-[10px] font-semibold bg-blue-500/30 text-blue-300 leading-none">
                {activeFilterCount}
              </span>
            )}
          </button>
        )}

        {/* WHERE input — hidden while panel is open */}
        {!panelOpen && (
          <div className="flex items-center gap-2 flex-1 bg-base border border-default rounded px-2 py-1 focus-within:border-blue-500/50 transition-colors relative">
            <Filter size={14} className="text-muted shrink-0" />
            <span className="text-xs text-blue-400 font-mono shrink-0">WHERE</span>
            <input
              ref={filterInputRef}
              type="text"
              value={filterInput}
              onChange={handleWhereChange}
              onBlur={handleWhereBlur}
              onKeyDown={handleWhereKeyDown}
              className="bg-transparent border-none outline-none text-xs text-secondary w-full placeholder:text-surface-tertiary font-mono"
              placeholder={`${placeholderColumn} > 5 AND status = 'active'`}
            />

            {filterInput && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleClearWhere}
                title={t("toolbar.clearField")}
                className="shrink-0 text-muted hover:text-secondary transition-colors"
              >
                <X size={12} />
              </button>
            )}

            {autocompleteOpen && autocompleteItems.length > 0 && (
              <ul
                className="absolute left-0 top-full mt-1 z-50 bg-elevated border border-default rounded-lg shadow-xl min-w-52 max-h-52 overflow-y-auto"
                onMouseDown={() => { autocompleteMouseDown.current = true; }}
                onMouseUp={() => { autocompleteMouseDown.current = false; }}
              >
                {autocompleteItems.map((col, idx) => (
                  <li
                    key={col.name}
                    className={`flex items-center justify-between px-3 py-1.5 text-xs cursor-pointer transition-colors first:rounded-t-lg last:rounded-b-lg ${
                      idx === autocompleteIndex
                        ? "bg-blue-600/25 text-blue-200"
                        : "text-secondary hover:bg-surface-secondary"
                    }`}
                    onMouseDown={(e) => { e.preventDefault(); acceptSuggestion(col); }}
                  >
                    <span className="font-mono">{col.name}</span>
                    <span className="text-muted ml-4 text-[10px] uppercase tracking-wide">{col.data_type}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* WHERE preview pill when panel is open */}
        {panelOpen && (
          <div className="flex items-center gap-1.5 flex-1 px-2 py-1 min-w-0">
            <Filter size={12} className="text-muted shrink-0" />
            <span className="text-xs text-muted font-mono truncate">
              {buildStructuredFilterClause(structuredFilters, activeDriver) || (
                <em className="not-italic opacity-50">{t("toolbar.noActiveFilters")}</em>
              )}
            </span>
          </div>
        )}

        {/* ORDER BY */}
        <div className="relative flex items-center gap-1.5 flex-1 bg-base border border-default rounded px-2 py-1 focus-within:border-blue-500/50 transition-colors">
          <ArrowUpDown size={14} className="text-muted shrink-0" />
          <span className="text-xs text-blue-400 font-mono shrink-0">ORDER BY</span>
          <input
            ref={sortInputRef}
            type="text"
            value={sortInput}
            onChange={handleSortChange}
            onBlur={handleSortBlur}
            onKeyDown={handleSortKeyDown}
            className="bg-transparent border-none outline-none text-xs text-secondary w-full placeholder:text-surface-tertiary font-mono"
            placeholder={`${placeholderSort} DESC`}
          />

          {sortInput && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleClearSort}
              title={t("toolbar.clearField")}
              className="shrink-0 text-muted hover:text-secondary transition-colors"
            >
              <X size={12} />
            </button>
          )}

          {sortAcOpen && sortAcItems.length > 0 && (
            <ul
              className="absolute left-0 top-full mt-1 z-50 bg-elevated border border-default rounded-lg shadow-xl min-w-52 max-h-52 overflow-y-auto"
              onMouseDown={() => { sortAcMouseDown.current = true; }}
              onMouseUp={() => { sortAcMouseDown.current = false; }}
            >
              {sortAcItems.map((col, idx) => (
                <li
                  key={col.name}
                  className={`flex items-center justify-between px-3 py-1.5 text-xs cursor-pointer transition-colors first:rounded-t-lg last:rounded-b-lg ${
                    idx === sortAcIndex
                      ? "bg-blue-600/25 text-blue-200"
                      : "text-secondary hover:bg-surface-secondary"
                  }`}
                  onMouseDown={(e) => { e.preventDefault(); acceptSortSuggestion(col); }}
                >
                  <span className="font-mono">{col.name}</span>
                  <span className="text-muted ml-4 text-[10px] uppercase tracking-wide">{col.data_type}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* LIMIT */}
        <div className="flex items-center gap-1.5 w-32 bg-base border border-default rounded px-2 py-1 focus-within:border-blue-500/50 transition-colors">
          <ListFilter size={14} className="text-muted shrink-0" />
          <span className="text-xs text-blue-400 font-mono shrink-0">LIMIT</span>
          <input
            type="number"
            value={limitInput}
            onChange={(e) => setLimitInput(e.target.value)}
            onBlur={handleLimitBlur}
            onKeyDown={handleSortLimitKeyDown}
            className="bg-transparent border-none outline-none text-xs text-secondary w-full placeholder:text-surface-tertiary font-mono"
            placeholder={String(defaultLimit)}
          />
        </div>

        {/* Advanced row toggle (search + more) */}
        {hasColumns && (
          <button
            onClick={() => onAdvancedOpenChange(!advancedOpen)}
            title={t("toolbar.advanced")}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs border transition-all shrink-0 ${
              advancedOpen
                ? "bg-blue-600/20 border-blue-500/50 text-blue-300"
                : "text-muted border-default hover:text-blue-300 hover:border-blue-500/40"
            }`}
          >
            <Search size={12} />
            <ChevronDown
              size={12}
              className={`transition-transform ${advancedOpen ? "rotate-180" : ""}`}
            />
          </button>
        )}

                
        {/* Conditional Highlight Rules Button */}
        {hasColumns && (
          <button
            type="button"
            onClick={() => setIsHighlightModalOpen(true)}
            title={t("highlight.buttonTitle")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs border transition-colors shrink-0 ${
              activeHighlightCount > 0
                ? "bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25"
                : "border-default text-muted hover:text-primary hover:bg-surface-secondary"
            }`}
          >
            <Highlighter size={12} className={activeHighlightCount > 0 ? "text-amber-400" : ""} />
            <span>{t("highlight.buttonLabel")}</span>
            {activeHighlightCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500/25 text-amber-200 text-[10px] font-semibold">
                {activeHighlightCount}
              </span>
            )}
          </button>
        )}

        {/* Refresh / Reload button */}
        <button
          type="button"
          onClick={() => {
            if (isDirty) {
              commitSql(filterInput, sortInput, limitInput);
            } else if (onRefresh) {
              onRefresh();
            } else {
              commitSql(filterInput, sortInput, limitInput);
            }
          }}
          disabled={isLoading}
          title={t("toolbar.refresh")}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs border border-default text-muted hover:text-primary hover:bg-surface-secondary transition-colors shrink-0 disabled:opacity-50"
        >
          <RotateCcw size={12} className={isLoading ? "animate-spin text-blue-400" : ""} />
          <span>{t("toolbar.refreshLabel")}</span>
        </button>

{/* Apply button — commits WHERE/ORDER BY/LIMIT explicitly (simple mode).
            Runs only on click/Enter so a half-typed clause never clears the
            currently shown table. Highlighted while there are unapplied edits. */}
        {!panelOpen && (
          <button
            onClick={() => commitSql(filterInput, sortInput, limitInput)}
            disabled={!isDirty}
            title={t("toolbar.applyHint")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium border transition-all shrink-0 ${
              isDirty
                ? "bg-blue-600/25 border-blue-500/60 text-blue-200 hover:bg-blue-600/35 hover:border-blue-400/70"
                : "text-muted border-default/60 opacity-50 cursor-not-allowed"
            }`}
          >
            <Play size={11} className={isDirty ? "fill-current" : ""} />
            <span>{t("toolbar.apply")}</span>
          </button>
        )}

        {/* Plugin extension slot */}
        <SlotAnchor
          name="data-grid.toolbar.actions"
          context={{}}
          className="flex items-center gap-1"
        />
      </div>

      {/* Advanced row (inline — pushes the grid down, never overlays it) */}
      {advancedOpen && hasColumns && (
        <div className="bg-elevated border-b border-default flex items-center px-2 py-1.5 gap-2">
          {/* Global search across all text columns */}
          <div className="flex items-center gap-2 flex-1 bg-base border border-default rounded px-2 py-1 focus-within:border-blue-500/50 transition-colors">
            <Search size={14} className="text-muted shrink-0" />
            <span className="text-xs text-blue-400 font-mono shrink-0">SEARCH</span>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              disabled={!hasTextColumns}
              className="bg-transparent border-none outline-none text-xs text-secondary w-full placeholder:text-surface-tertiary font-mono disabled:opacity-50"
              placeholder={
                hasTextColumns
                  ? t("toolbar.searchAllColumns")
                  : t("toolbar.noTextColumns")
              }
            />
            {searchInput && (
              <button
                type="button"
                onClick={handleClearSearch}
                title={t("toolbar.clearField")}
                className="shrink-0 text-muted hover:text-secondary transition-colors"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <button
            onClick={applyGlobalSearch}
            disabled={!hasTextColumns}
            title={t("toolbar.applyHint")}
            className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium border transition-all shrink-0 bg-blue-600/25 border-blue-500/60 text-blue-200 hover:bg-blue-600/35 hover:border-blue-400/70 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Search size={11} />
            <span>{t("toolbar.search")}</span>
          </button>

          <div className="w-px h-5 bg-default/60 shrink-0" />

          {/* DISTINCT toggle — applies immediately */}
          <button
            onClick={handleToggleDistinct}
            title={t("toolbar.distinctHint")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono border transition-all shrink-0 ${
              distinctInput
                ? "bg-blue-600/25 border-blue-500/60 text-blue-200"
                : "text-muted border-default hover:text-blue-300 hover:border-blue-500/40"
            }`}
          >
            <span
              className={`w-3 h-3 rounded-sm border flex items-center justify-center ${
                distinctInput ? "bg-blue-500/70 border-blue-400" : "border-default"
              }`}
            >
              {distinctInput && <span className="w-1.5 h-1.5 bg-white rounded-[1px]" />}
            </span>
            DISTINCT
          </button>

          {/* OFFSET (only effective together with LIMIT) */}
          <div className="flex items-center gap-1.5 w-36 bg-base border border-default rounded px-2 py-1 focus-within:border-blue-500/50 transition-colors shrink-0">
            <span className="text-xs text-blue-400 font-mono shrink-0">OFFSET</span>
            <input
              type="number"
              min={0}
              value={offsetInput}
              onChange={(e) => setOffsetInput(e.target.value)}
              onKeyDown={handleOffsetKeyDown}
              title={t("toolbar.offsetHint")}
              className="bg-transparent border-none outline-none text-xs text-secondary w-full placeholder:text-surface-tertiary font-mono"
              placeholder="0"
            />
          </div>
        </div>
      )}

      {/* Overlay filter panel */}
      {panelOpen && (
        <div
          ref={panelRef}
          onKeyDown={handlePanelKeyDown}
          className="absolute top-full left-0 z-50 mt-1 w-full min-w-[560px] max-w-4xl bg-elevated border border-default/80 rounded-lg overflow-hidden"
          style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.3)" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-default/60 bg-base/40">
            <div className="flex items-center gap-2">
              <SlidersHorizontal size={13} className="text-muted" />
              <span className="text-xs font-medium text-secondary">{t("toolbar.filterConditions")}</span>
              {structuredFilters.length > 0 && (
                <span className="text-[10px] text-muted">
                  {t("toolbar.activeOf", { active: activeFilterCount, total: structuredFilters.length })}
                </span>
              )}
            </div>
            <button
              onClick={closePanel}
              title={t("toolbar.closePanelEsc")}
              className="w-5 h-5 flex items-center justify-center rounded text-muted hover:text-secondary hover:bg-surface-secondary transition-colors"
            >
              <X size={12} />
            </button>
          </div>

          {/* Filter rows */}
          <div className="divide-y divide-default/30">
            {structuredFilters.length === 0 ? (
              <div className="flex items-center gap-2 px-3 py-3">
                <span className="text-xs text-muted">{t("toolbar.noFilters")}</span>
                <button
                  onClick={handleAddFilter}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  {t("toolbar.addFirstFilter")}
                </button>
              </div>
            ) : (
              structuredFilters.map((filter, idx) => (
                <FilterRow
                  key={filter.id}
                  filter={filter}
                  columns={columns}
                  onChange={(updated) => handleFilterChange(idx, updated)}
                  onRemove={() => handleFilterRemove(idx)}
                  onApplySingle={handleApplySingle}
                  onDuplicate={handleDuplicateFilter}
                  onEscape={closePanel}
                  isApplied={appliedFilters[filter.id] === true}
                  onTriggerApplied={() => onTriggerApplied(filter.id)}
                />
              ))
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-2 px-3 py-2 border-t border-default/60 bg-base/40">
            <button
              onClick={handleUnset}
              className="px-2.5 py-1 rounded text-xs text-muted border border-default/70 hover:text-secondary hover:border-default transition-colors"
            >
              {t("toolbar.unset")}
            </button>

            <button
              onClick={closePanel}
              title={t("toolbar.switchToSql")}
              className="px-2.5 py-1 rounded text-xs text-muted border border-default/70 hover:text-blue-300 hover:border-blue-500/50 transition-colors"
            >
              {t("toolbar.sql")}
            </button>

            <button
              onClick={handleAddFilter}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-xs text-muted border border-dashed border-default/70 hover:text-blue-300 hover:border-blue-500/50 transition-colors"
            >
              <Plus size={11} />
              {t("toolbar.addFilter")}
            </button>

            <div className="flex-1" />

            {/* Apply All — does NOT close panel */}
            <button
              onClick={handleApplyAll}
              className="px-3 py-1 rounded text-xs font-medium border transition-colors bg-blue-600/20 border-blue-500/50 text-blue-300 hover:bg-blue-600/30 hover:border-blue-400/70"
            >
              {t("toolbar.applyAll")}
            </button>
          </div>
        </div>
      )}

      {/* Conditional Highlight Rules Modal */}
      <HighlightRulesModal
        isOpen={isHighlightModalOpen}
        onClose={() => setIsHighlightModalOpen(false)}
        columns={columns.map((c) => c.name)}
        rules={highlightRules}
        onRulesChange={handleRulesChange}
        tableName={tableName ?? undefined}
      />
    </div>
  );
};

// ─── Public wrapper — panel state and filters lifted here to survive key-driven remounts ─────

export const TableToolbar = (props: TableToolbarProps) => {
  const [panelOpen, setPanelOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [structuredFilters, setStructuredFilters] = useState<StructuredFilter[]>([]);
  const [appliedFilters, setAppliedFilters] = useState<Record<string, boolean>>({});

  const handleTriggerApplied = useCallback((filterId: string) => {
    setAppliedFilters((prev) => ({ ...prev, [filterId]: true }));
  }, []);

  const handleResetApplied = useCallback((filterId: string) => {
    setAppliedFilters((prev) => { const next = { ...prev }; delete next[filterId]; return next; });
  }, []);

  const handleResetAllApplied = useCallback(() => {
    setAppliedFilters({});
  }, []);

  const stateKey = `${props.initialFilter}-${props.initialSort}-${props.initialLimit}-${props.initialOffset}-${props.initialDistinct}`;
  return (
    <TableToolbarInternal
      key={stateKey}
      {...props}
      panelOpen={panelOpen}
      onPanelOpenChange={setPanelOpen}
      advancedOpen={advancedOpen}
      onAdvancedOpenChange={setAdvancedOpen}
      structuredFilters={structuredFilters}
      onStructuredFiltersChange={setStructuredFilters}
      appliedFilters={appliedFilters}
      onTriggerApplied={handleTriggerApplied}
      onResetApplied={handleResetApplied}
      onResetAllApplied={handleResetAllApplied}
    />
  );
};

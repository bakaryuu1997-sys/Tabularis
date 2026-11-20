import { useState, useRef, useEffect, useMemo, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  Search,
  X,
  Table2 as TableIcon,
  FileCode,
  Network,
  BookOpen,
} from "lucide-react";
import clsx from "clsx";
import type { Tab } from "../../types/editor";
import { filterTabs } from "../../utils/tabScroll";

export interface TabSearchPopoverProps {
  leftTabs: Tab[];
  activeLeftTabId: string | null;
  onSelectLeftTab: (tabId: string) => void;
  onCloseLeftTab: (tabId: string) => void;
  rightTabs?: Tab[];
  activeRightTabId?: string | null;
  onSelectRightTab?: (tabId: string) => void;
  onCloseRightTab?: (tabId: string) => void;
  buttonClassName?: string;
}

export function TabSearchPopover({
  leftTabs,
  activeLeftTabId,
  onSelectLeftTab,
  onCloseLeftTab,
  rightTabs = [],
  activeRightTabId = null,
  onSelectRightTab,
  onCloseRightTab,
  buttonClassName,
}: TabSearchPopoverProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredLeftTabs = useMemo(() => filterTabs(leftTabs, query), [leftTabs, query]);
  const filteredRightTabs = useMemo(() => filterTabs(rightTabs, query), [rightTabs, query]);

  const totalFilteredCount = filteredLeftTabs.length + filteredRightTabs.length;
  // Keyboard highlight over the flattened list (left pane first, then right).
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const flatItems = useMemo(
    () => [
      ...filteredLeftTabs.map((tab) => ({ tab, pane: "left" as const })),
      ...filteredRightTabs.map((tab) => ({ tab, pane: "right" as const })),
    ],
    [filteredLeftTabs, filteredRightTabs],
  );
  const highlightedId = flatItems[Math.min(highlightedIndex, flatItems.length - 1)]?.tab.id;

  const selectItem = (item: (typeof flatItems)[number]) => {
    if (item.pane === "left") onSelectLeftTab(item.tab.id);
    else onSelectRightTab?.(item.tab.id);
    setIsOpen(false);
  };

  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (flatItems.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => (Math.min(i, flatItems.length - 1) + 1) % flatItems.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex(
        (i) => (Math.min(i, flatItems.length - 1) - 1 + flatItems.length) % flatItems.length,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      selectItem(flatItems[Math.min(highlightedIndex, flatItems.length - 1)]);
    }
  };
  const hasBothPanes = leftTabs.length > 0 && rightTabs.length > 0;

  // Handle outside click & escape key
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => searchInputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleToggle = () => {
    setIsOpen((prev) => {
      if (!prev) {
        setQuery("");
        setHighlightedIndex(0);
      }
      return !prev;
    });
  };

  const renderTabIcon = (type?: string) => {
    switch (type) {
      case "table":
        return <TableIcon size={13} className="text-blue-400 shrink-0" />;
      case "query_builder":
        return <Network size={13} className="text-purple-400 shrink-0" />;
      case "notebook":
        return <BookOpen size={13} className="text-orange-400 shrink-0" />;
      default:
        return <FileCode size={13} className="text-green-500 shrink-0" />;
    }
  };

  const renderTabItem = (
    tab: Tab,
    isActive: boolean,
    onSelect: () => void,
    onClose: () => void,
    closeLabel: string,
  ) => (
    <div
      key={tab.id}
      role="option"
      aria-selected={tab.id === highlightedId}
      onClick={() => {
        onSelect();
        setIsOpen(false);
      }}
      className={clsx(
        "group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors text-xs select-none",
        isActive || tab.id === highlightedId
          ? "bg-surface-secondary text-primary"
          : "text-secondary hover:bg-surface-secondary hover:text-primary",
        isActive && "font-medium",
      )}
    >
      {renderTabIcon(tab.type)}
      <span className="flex-1 truncate" title={tab.title}>
        {tab.title}
      </span>
      {isActive && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-medium shrink-0">
          {t("editor.allTabs.active", "Active")}
        </span>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        title={closeLabel}
        aria-label={closeLabel}
        className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-surface-tertiary text-muted hover:text-primary transition-opacity shrink-0"
      >
        <X size={12} />
      </button>
    </div>
  );

  return (
    <div className="relative h-full shrink-0" ref={popoverRef}>
      <button
        onClick={handleToggle}
        className={clsx(
          buttonClassName ||
            "flex items-center justify-center w-8 h-full border-l border-default transition-colors shrink-0",
          isOpen
            ? "text-primary bg-surface-secondary"
            : "text-muted hover:text-primary hover:bg-surface-secondary",
        )}
        title={t("editor.allTabs.tooltip", "Search and list all tabs")}
        aria-label={t("editor.allTabs.tooltip", "Search and list all tabs")}
      >
        <ChevronDown
          size={14}
          className={clsx("transition-transform duration-150", isOpen && "rotate-180")}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-80 max-h-[420px] bg-elevated border border-strong rounded-lg shadow-2xl z-50 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          {/* Header & Search Input */}
          <div className="p-2 border-b border-default bg-base flex items-center gap-2 shrink-0">
            <Search size={14} className="text-muted shrink-0 ml-1" />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlightedIndex(0);
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder={t("editor.allTabs.searchPlaceholder", "Search tabs...")}
              className="w-full bg-transparent text-xs text-primary placeholder-muted focus:outline-none"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="p-0.5 text-muted hover:text-primary transition-colors shrink-0"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Tab Lists */}
          <div role="listbox" className="overflow-y-auto flex-1 py-1 divide-y divide-default/40">
            {totalFilteredCount === 0 ? (
              <div className="py-6 text-center text-xs text-muted">
                {t("editor.allTabs.noTabs", "No tabs found")}
              </div>
            ) : (
              <>
                {filteredLeftTabs.length > 0 && (
                  <div>
                    {hasBothPanes && (
                      <div className="px-3 py-1 text-[10px] uppercase font-semibold text-muted bg-surface-secondary/40 tracking-wider">
                        {t("editor.allTabs.leftPane", "Main Editor")} ({filteredLeftTabs.length})
                      </div>
                    )}
                    {filteredLeftTabs.map((tab) =>
                      renderTabItem(
                        tab,
                        tab.id === activeLeftTabId,
                        () => onSelectLeftTab(tab.id),
                        () => onCloseLeftTab(tab.id),
                        t("editor.closeTab", "Close tab"),
                      ),
                    )}
                  </div>
                )}

                {filteredRightTabs.length > 0 && (
                  <div>
                    {hasBothPanes && (
                      <div className="px-3 py-1 text-[10px] uppercase font-semibold text-muted bg-surface-secondary/40 tracking-wider">
                        {t("editor.allTabs.rightPane", "Split Pane")} ({filteredRightTabs.length})
                      </div>
                    )}
                    {filteredRightTabs.map((tab) =>
                      renderTabItem(
                        tab,
                        tab.id === activeRightTabId,
                        () => onSelectRightTab?.(tab.id),
                        () => onCloseRightTab?.(tab.id),
                        t("editor.allTabs.moveToMain", "Move back to the main editor"),
                      ),
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

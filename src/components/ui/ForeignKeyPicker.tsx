import React, { useState, useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { Search, Loader2, X, Check, Ban, Edit3 } from "lucide-react";
import type { ForeignKey, QueryResult } from "../../types/editor";
import { quoteTableRef, quoteIdentifier } from "../../utils/identifiers";
import {
  detectLabelColumns,
  filterFkCandidates,
  type FkCandidate,
} from "../../utils/foreignKeyPicker";

interface ForeignKeyPickerProps {
  fk: ForeignKey;
  currentValue: unknown;
  connectionId?: string | null;
  driver?: string | null;
  schema?: string | null;
  nullable?: boolean;
  onSelect: (value: unknown) => void;
  onClose: () => void;
}

export const ForeignKeyPicker: React.FC<ForeignKeyPickerProps> = ({
  fk,
  currentValue,
  connectionId,
  driver,
  schema,
  nullable = false,
  onSelect,
  onClose,
}) => {
  const { t } = useTranslation();
  const [candidates, setCandidates] = useState<FkCandidate[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isManualInput, setIsManualInput] = useState(false);
  const [manualValue, setManualValue] = useState(String(currentValue ?? ""));

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Fetch candidates from referenced table
  useEffect(() => {
    let isCancelled = false;

    async function loadFkData() {
      if (!connectionId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const quotedTable = quoteTableRef(fk.ref_table, driver, schema);
        const quotedRefCol = quoteIdentifier(fk.ref_column, driver);
        // Load up to 60 rows ordered by ref column descending (recent entries)
        const query = `SELECT * FROM ${quotedTable} ORDER BY ${quotedRefCol} DESC LIMIT 60`;

        const result = await invoke<QueryResult>("execute_query", {
          connectionId,
          query,
          limit: 60,
          page: 1,
          ...(schema ? { schema } : {}),
        });

        if (isCancelled) return;

        const columns = result.columns || [];
        const rows = result.rows || [];
        const refColIdx = columns.indexOf(fk.ref_column);

        if (refColIdx === -1) {
          setError(
            t("foreignKeyPicker.columnNotFound", {
              defaultValue: `Không tìm thấy cột ${fk.ref_column} trong ${fk.ref_table}`,
            })
          );
          setIsLoading(false);
          return;
        }

        const { primaryLabel, secondaryLabel } = detectLabelColumns(columns, fk.ref_column);
        const primIdx = primaryLabel ? columns.indexOf(primaryLabel) : -1;
        const secIdx = secondaryLabel ? columns.indexOf(secondaryLabel) : -1;

        const items: FkCandidate[] = rows.map((row) => ({
          key: row[refColIdx],
          label: primIdx !== -1 && row[primIdx] !== null ? String(row[primIdx]) : undefined,
          secondaryLabel:
            secIdx !== -1 && row[secIdx] !== null ? String(row[secIdx]) : undefined,
        }));

        setCandidates(items);
      } catch (err: unknown) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    loadFkData();

    return () => {
      isCancelled = true;
    };
  }, [connectionId, fk, driver, schema, t]);

  // Filter candidates
  const filtered = useMemo(() => {
    return filterFkCandidates(candidates, search);
  }, [candidates, search]);

  // Auto focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, [isManualInput]);

  // Keep selected index in bound
  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }

    if (isManualInput) {
      if (e.key === "Enter") {
        e.preventDefault();
        onSelect(manualValue);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (filtered.length ? (prev + 1) % filtered.length : 0));
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        filtered.length ? (prev - 1 + filtered.length) % filtered.length : 0
      );
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (filtered.length > 0 && selectedIndex >= 0 && selectedIndex < filtered.length) {
        onSelect(filtered[selectedIndex].key);
      }
      return;
    }
  };

  return (
    <div
      onKeyDown={handleKeyDown}
      className="absolute left-0 top-full mt-1 z-50 w-80 max-w-[90vw] bg-elevated border border-default rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-100"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-default bg-surface-secondary/50">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] font-medium text-muted uppercase tracking-wider shrink-0">
            FK &rarr;
          </span>
          <span className="text-xs font-semibold text-primary font-mono truncate">
            {fk.ref_table}.{fk.ref_column}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded text-muted hover:text-primary hover:bg-surface-secondary transition-colors"
        >
          <X size={13} />
        </button>
      </div>

      {/* Manual Input Mode vs Picker Mode */}
      {isManualInput ? (
        <div className="p-3 space-y-2">
          <label className="block text-[11px] text-muted font-medium">
            {t("foreignKeyPicker.manualLabel", { defaultValue: "Nhập giá trị trực tiếp:" })}
          </label>
          <input
            ref={inputRef}
            type="text"
            value={manualValue}
            onChange={(e) => setManualValue(e.target.value)}
            className="w-full text-xs bg-base border border-blue-500 rounded px-2.5 py-1.5 text-primary outline-none font-mono"
            placeholder={String(currentValue ?? "")}
          />
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => setIsManualInput(false)}
              className="text-xs text-muted hover:text-primary transition-colors"
            >
              &larr; {t("foreignKeyPicker.backToPicker", { defaultValue: "Quay lại danh sách" })}
            </button>
            <button
              type="button"
              onClick={() => onSelect(manualValue)}
              className="px-3 py-1 text-xs font-medium rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors"
            >
              {t("common.apply", { defaultValue: "Áp dụng" })}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Search bar */}
          <div className="p-2 border-b border-default bg-base/50 flex items-center gap-2">
            <div className="flex items-center gap-1.5 flex-1 bg-base border border-default rounded-lg px-2.5 py-1 text-xs focus-within:border-blue-500 transition-colors">
              <Search size={13} className="text-muted shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("foreignKeyPicker.searchPlaceholder", {
                  defaultValue: "Tìm theo ID hoặc tên...",
                })}
                className="w-full bg-transparent border-none outline-none text-xs text-primary placeholder:text-muted/60 font-mono"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="text-muted hover:text-primary"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {nullable && (
              <button
                type="button"
                onClick={() => onSelect(null)}
                title={t("foreignKeyPicker.setNull", { defaultValue: "Đặt là NULL" })}
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border border-default text-muted hover:text-amber-400 hover:border-amber-500/40 hover:bg-amber-500/10 transition-colors shrink-0"
              >
                <Ban size={11} />
                <span>NULL</span>
              </button>
            )}
          </div>

          {/* List Candidates */}
          <div className="max-h-56 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-muted gap-2 text-xs">
                <Loader2 size={15} className="animate-spin text-blue-400" />
                <span>{t("common.loading", { defaultValue: "Đang tải dữ liệu tham chiếu..." })}</span>
              </div>
            ) : error ? (
              <div className="p-4 text-center text-xs text-red-400 space-y-2">
                <p>{error}</p>
                <button
                  type="button"
                  onClick={() => setIsManualInput(true)}
                  className="text-blue-400 underline hover:text-blue-300"
                >
                  {t("foreignKeyPicker.useManual", { defaultValue: "Nhập giá trị tay" })}
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted space-y-2">
                <p>{t("foreignKeyPicker.noMatch", { defaultValue: "Không có bản ghi phù hợp." })}</p>
                <button
                  type="button"
                  onClick={() => setIsManualInput(true)}
                  className="text-blue-400 underline hover:text-blue-300"
                >
                  {t("foreignKeyPicker.useManual", { defaultValue: "Nhập giá trị tay" })}
                </button>
              </div>
            ) : (
              <ul ref={listRef} className="py-1 divide-y divide-default/30">
                {filtered.map((item, idx) => {
                  const isCurrent = String(item.key) === String(currentValue);
                  const isHighlighted = idx === selectedIndex;

                  return (
                    <li
                      key={String(item.key) + "_" + idx}
                      onClick={() => onSelect(item.key)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`px-3 py-1.5 flex items-center justify-between text-xs cursor-pointer transition-colors ${
                        isHighlighted
                          ? "bg-blue-600/20 text-blue-200"
                          : "text-secondary hover:bg-surface-secondary"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {/* Key Badge */}
                        <span
                          className={`font-mono text-[11px] px-1.5 py-0.5 rounded border shrink-0 ${
                            isCurrent
                              ? "bg-blue-500/20 border-blue-500/50 text-blue-300 font-bold"
                              : "bg-surface-secondary border-default text-primary"
                          }`}
                        >
                          {String(item.key)}
                        </span>

                        {/* Label & Secondary Label */}
                        <div className="min-w-0 flex flex-col">
                          {item.label && (
                            <span className="font-medium truncate text-primary">
                              {item.label}
                            </span>
                          )}
                          {item.secondaryLabel && (
                            <span className="text-[10px] text-muted truncate">
                              {item.secondaryLabel}
                            </span>
                          )}
                        </div>
                      </div>

                      {isCurrent && (
                        <Check size={13} className="text-blue-400 shrink-0 ml-2" />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Footer toolbar: manual input switch */}
          <div className="px-3 py-1.5 border-t border-default bg-surface-secondary/40 flex items-center justify-between text-[11px] text-muted">
            <span>
              {t("foreignKeyPicker.totalCount", {
                defaultValue: `${filtered.length} bản ghi`,
                count: filtered.length,
              })}
            </span>
            <button
              type="button"
              onClick={() => setIsManualInput(true)}
              className="flex items-center gap-1 hover:text-blue-400 transition-colors"
            >
              <Edit3 size={11} />
              <span>{t("foreignKeyPicker.manualButton", { defaultValue: "Nhập tay" })}</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
};

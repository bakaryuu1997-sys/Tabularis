import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  Eye,
  Copy,
  Check,
  Code,
  FileText,
  Binary,
  RotateCcw,
  Sparkles,
  Search,
} from "lucide-react";
import { JsonTreeView } from "./JsonTreeView";
import { copyTextToClipboard } from "../../utils/clipboard";

export interface CellValueInspectorProps {
  isOpen: boolean;
  onClose: () => void;
  columnName: string;
  columnType?: string;
  cellValue: unknown;
  rowIndex?: number;
  readOnly?: boolean;
  onApplyValue?: (newValue: unknown) => void;
}

export function CellValueInspector({
  isOpen,
  onClose,
  columnName,
  columnType,
  cellValue,
  readOnly = false,
  onApplyValue,
}: CellValueInspectorProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"formatted" | "tree" | "hex">("formatted");
  const [editedText, setEditedText] = useState<string>("");
  const [wrapLines, setWrapLines] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const [treeSearchQuery, setTreeSearchQuery] = useState<string>("");
  const [applied, setApplied] = useState<boolean>(false);

  // Convert raw value to string
  const rawString = useMemo(() => {
    if (cellValue === null) return "null";
    if (cellValue === undefined) return "undefined";
    if (typeof cellValue === "object") {
      try {
        return JSON.stringify(cellValue, null, 2);
      } catch {
        return String(cellValue);
      }
    }
    return String(cellValue);
  }, [cellValue]);

  // Try parsing JSON if string
  const parsedJson = useMemo(() => {
    if (cellValue === null || cellValue === undefined) return null;
    if (typeof cellValue === "object") return cellValue;
    if (typeof cellValue === "string") {
      const trimmed = cellValue.trim();
      if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
        try {
          return JSON.parse(trimmed);
        } catch {
          return null;
        }
      }
    }
    return null;
  }, [cellValue]);

  // Detect base64
  const detectedBase64 = useMemo(() => {
    if (typeof cellValue !== "string" || cellValue.length < 8) return null;
    const trimmed = cellValue.trim();
    if (/^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length % 4 === 0) {
      try {
        const decoded = atob(trimmed);
        if (/^[\x20-\x7E\r\n\t]+$/.test(decoded)) {
          return decoded;
        }
      } catch {
        return null;
      }
    }
    return null;
  }, [cellValue]);

  // Detect URL encoded
  const detectedUrlEncoded = useMemo(() => {
    if (typeof cellValue !== "string" || !cellValue.includes("%")) return null;
    try {
      const decoded = decodeURIComponent(cellValue);
      if (decoded !== cellValue) return decoded;
    } catch {
      return null;
    }
    return null;
  }, [cellValue]);

  // Initialize edited text when cell changes
  const [syncedRawString, setSyncedRawString] = useState<string | null>(null);
  if (syncedRawString !== rawString) {
    setSyncedRawString(rawString);
    setEditedText(rawString);
    setApplied(false);
  }

  if (!isOpen) return null;

  const handleCopy = async (text: string) => {
    await copyTextToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFormatJson = () => {
    try {
      const parsed = JSON.parse(editedText);
      setEditedText(JSON.stringify(parsed, null, 2));
    } catch {
      // not valid json
    }
  };

  const handleCompactJson = () => {
    try {
      const parsed = JSON.parse(editedText);
      setEditedText(JSON.stringify(parsed));
    } catch {
      // not valid json
    }
  };

  const handleApply = () => {
    if (!onApplyValue || readOnly) return;
    let nextValue: unknown = editedText;
    if (editedText === "null" && cellValue === null) {
      nextValue = null;
    } else if (parsedJson !== null) {
      try {
        nextValue = JSON.parse(editedText);
      } catch {
        nextValue = editedText;
      }
    }
    onApplyValue(nextValue);
    setApplied(true);
    setTimeout(() => setApplied(false), 2000);
  };

  // Generate Hex dump representation
  const hexDump = () => {
    const text = typeof cellValue === "string" ? cellValue : rawString;
    const encoder = new TextEncoder();
    const bytes = encoder.encode(text);
    const lines: string[] = [];
    const chunkSize = 16;

    for (let i = 0; i < bytes.length; i += chunkSize) {
      const slice = bytes.slice(i, i + chunkSize);
      const offset = i.toString(16).padStart(8, "0");
      const hexParts: string[] = [];
      let ascii = "";

      for (let j = 0; j < chunkSize; j++) {
        if (j < slice.length) {
          const byte = slice[j];
          hexParts.push(byte.toString(16).padStart(2, "0").toUpperCase());
          ascii += byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : ".";
        } else {
          hexParts.push("  ");
        }
      }

      const hexGroup1 = hexParts.slice(0, 8).join(" ");
      const hexGroup2 = hexParts.slice(8, 16).join(" ");
      lines.push(`${offset}  ${hexGroup1}  ${hexGroup2}  |${ascii}|`);
    }

    return lines.length > 0 ? lines.join("\n") : t("cellInspector.hexEmpty");
  };

  const charCount = typeof cellValue === "string" ? cellValue.length : rawString.length;
  const lineCount = rawString.split(/\r?\n/).length;

  return (
    <aside
      className="fixed inset-y-0 right-0 z-40 w-full sm:w-[480px] lg:w-[560px] bg-elevated border-l border-default shadow-2xl flex flex-col animate-slide-in-right"
      aria-label={t("cellInspector.ariaLabel")}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-default bg-surface-secondary/40 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Eye size={16} className="text-cyan-400 shrink-0" />
          <h2 className="text-sm font-semibold text-primary truncate">
            {t("cellInspector.title")}
          </h2>
          <span className="font-mono text-xs px-2 py-0.5 rounded bg-cyan-950/40 text-cyan-300 border border-cyan-800/50 truncate max-w-[160px]">
            {columnName}
          </span>
          {columnType && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-tertiary text-muted uppercase">
              {columnType}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-muted hover:text-primary hover:bg-surface-secondary transition-colors"
          title={t("common.close")}
        >
          <X size={16} />
        </button>
      </div>

      {/* Info bar & Tab switcher */}
      <div className="px-4 py-2 border-b border-default bg-surface flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1 bg-surface-secondary rounded p-0.5 text-xs">
          <button
            onClick={() => setActiveTab("formatted")}
            className={`px-2.5 py-1 rounded flex items-center gap-1.5 font-medium transition-colors ${
              activeTab === "formatted"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-muted hover:text-primary"
            }`}
          >
            <FileText size={13} />
            <span>{t("cellInspector.tabText")}</span>
          </button>
          <button
            onClick={() => setActiveTab("tree")}
            disabled={parsedJson === null}
            className={`px-2.5 py-1 rounded flex items-center gap-1.5 font-medium transition-colors ${
              activeTab === "tree"
                ? "bg-blue-600 text-white shadow-sm"
                : parsedJson !== null
                ? "text-muted hover:text-primary"
                : "text-muted/40 cursor-not-allowed"
            }`}
            title={parsedJson === null ? t("cellInspector.notJson") : t("cellInspector.viewJsonTree")}
          >
            <Code size={13} />
            <span>JSON Tree</span>
          </button>
          <button
            onClick={() => setActiveTab("hex")}
            className={`px-2.5 py-1 rounded flex items-center gap-1.5 font-medium transition-colors ${
              activeTab === "hex"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-muted hover:text-primary"
            }`}
          >
            <Binary size={13} />
            <span>{t("cellInspector.tabHex")}</span>
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted font-mono">
          <span>{charCount} {t("cellInspector.characters")}</span>
          <span>·</span>
          <span>{lineCount} {t("cellInspector.lines")}</span>
        </div>
      </div>

      {/* Detected Decodings Banner */}
      {(detectedBase64 || detectedUrlEncoded) && (
        <div className="px-4 py-2 bg-purple-950/20 border-b border-purple-900/30 text-xs flex flex-col gap-1 shrink-0">
          {detectedBase64 && (
            <div className="flex items-center justify-between text-purple-300">
              <span className="flex items-center gap-1.5">
                <Sparkles size={12} className="text-purple-400" />
                <span>{t("cellInspector.base64Detected")}</span>
                <span className="font-mono text-purple-200 truncate max-w-[260px]">
                  {detectedBase64}
                </span>
              </span>
              <button
                onClick={() => setEditedText(detectedBase64)}
                className="text-[11px] underline hover:text-white"
              >
                {t("cellInspector.decode")}
              </button>
            </div>
          )}
          {detectedUrlEncoded && (
            <div className="flex items-center justify-between text-purple-300">
              <span className="flex items-center gap-1.5">
                <Sparkles size={12} className="text-purple-400" />
                <span>{t("cellInspector.urlEncodeDetected")}</span>
                <span className="font-mono text-purple-200 truncate max-w-[260px]">
                  {detectedUrlEncoded}
                </span>
              </span>
              <button
                onClick={() => setEditedText(detectedUrlEncoded)}
                className="text-[11px] underline hover:text-white"
              >
                {t("cellInspector.decode")}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Content Body */}
      <div className="flex-1 min-h-0 flex flex-col p-4 overflow-hidden">
        {activeTab === "formatted" && (
          <div className="flex-1 min-h-0 flex flex-col gap-2">
            <div className="flex items-center justify-between shrink-0 text-xs">
              <div className="flex items-center gap-2">
                {parsedJson !== null && (
                  <>
                    <button
                      onClick={handleFormatJson}
                      className="px-2 py-1 rounded bg-surface-secondary hover:bg-surface-tertiary text-secondary hover:text-primary border border-strong flex items-center gap-1"
                      title={t("cellInspector.prettifyJson")}
                    >
                      <Sparkles size={12} className="text-amber-400" />
                      <span>Format JSON</span>
                    </button>
                    <button
                      onClick={handleCompactJson}
                      className="px-2 py-1 rounded bg-surface-secondary hover:bg-surface-tertiary text-secondary hover:text-primary border border-strong"
                      title={t("cellInspector.minifyJson")}
                    >
                      Minify
                    </button>
                  </>
                )}
                <label className="flex items-center gap-1.5 cursor-pointer text-muted hover:text-secondary select-none">
                  <input
                    type="checkbox"
                    checked={wrapLines}
                    onChange={(e) => setWrapLines(e.target.checked)}
                    className="rounded accent-blue-500"
                  />
                  <span>{t("cellInspector.wordWrap")}</span>
                </label>
              </div>

              {editedText !== rawString && (
                <button
                  onClick={() => setEditedText(rawString)}
                  className="flex items-center gap-1 text-muted hover:text-secondary"
                  title={t("cellInspector.restoreTooltip")}
                >
                  <RotateCcw size={12} />
                  <span>{t("cellInspector.restore")}</span>
                </button>
              )}
            </div>

            <textarea
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              readOnly={readOnly}
              className={`flex-1 min-h-0 p-3 bg-surface-secondary border border-strong rounded font-mono text-xs text-primary leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                wrapLines ? "whitespace-pre-wrap break-all" : "whitespace-pre overflow-x-auto"
              }`}
              spellCheck={false}
            />
          </div>
        )}

        {activeTab === "tree" && parsedJson !== null && (
          <div className="flex-1 min-h-0 flex flex-col gap-2">
            <div className="relative shrink-0">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                type="text"
                value={treeSearchQuery}
                onChange={(e) => setTreeSearchQuery(e.target.value)}
                placeholder={t("cellInspector.searchPlaceholder")}
                className="w-full pl-8 pr-3 py-1.5 bg-surface-secondary border border-strong rounded text-xs text-primary placeholder-muted focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex-1 min-h-0 overflow-auto bg-surface-secondary border border-strong rounded p-2">
              <JsonTreeView
                value={parsedJson}
                readOnly={readOnly}
                searchQuery={treeSearchQuery}
                fillHeight
              />
            </div>
          </div>
        )}

        {activeTab === "hex" && (
          <div className="flex-1 min-h-0 overflow-auto bg-surface-secondary border border-strong rounded p-3 font-mono text-[11px] leading-relaxed text-secondary select-text">
            <pre className="whitespace-pre">{hexDump()}</pre>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="px-4 py-3 border-t border-default bg-surface-secondary/50 flex items-center justify-between shrink-0">
        <button
          onClick={() => handleCopy(editedText)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-surface hover:bg-surface-tertiary border border-strong text-xs font-medium text-secondary hover:text-primary transition-colors"
        >
          {copied ? (
            <>
              <Check size={14} className="text-green-400" />
              <span className="text-green-400">{t("cellInspector.copied")}</span>
            </>
          ) : (
            <>
              <Copy size={14} />
              <span>{t("cellInspector.copy")}</span>
            </>
          )}
        </button>

        {!readOnly && onApplyValue && (
          <button
            onClick={handleApply}
            disabled={editedText === rawString}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium text-white transition-colors"
          >
            {applied ? (
              <>
                <Check size={14} />
                <span>{t("cellInspector.saved")}</span>
              </>
            ) : (
              <span>{t("cellInspector.applyToCell")}</span>
            )}
          </button>
        )}
      </div>
    </aside>
  );
}

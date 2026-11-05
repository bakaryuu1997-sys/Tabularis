import { useState } from "react";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import type { TFunction } from "i18next";
import { buildSqlErrorPrompt } from "../../utils/aiSqlErrorFix";
import { requestAiPrompt } from "../../utils/aiRunBus";

interface ErrorDisplayProps {
  error: string;
  query?: string;
  t: TFunction;
}

export function ErrorDisplay({ error, query, t }: ErrorDisplayProps) {
  const [showDetails, setShowDetails] = useState(false);

  const separatorIndex = error.indexOf("\n\n");
  const hasDetails = separatorIndex !== -1 && separatorIndex < error.length - 2;
  const brief = hasDetails ? error.slice(0, separatorIndex) : error;
  const details = hasDetails ? error.slice(separatorIndex + 2) : "";

  const handleAskAi = () => {
    if (!query) return;
    const prompt = buildSqlErrorPrompt(query, error);
    requestAiPrompt(prompt);
  };

  return (
    <div className="p-4 text-red-400 font-mono text-sm bg-red-900/10 h-full overflow-auto">
      <div className="flex items-start justify-between gap-4">
        <div className="whitespace-pre-wrap flex-1">Error: {brief}</div>
        {query && query.trim().length > 0 && (
          <button
            type="button"
            onClick={handleAskAi}
            className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-600/20 text-blue-300 border border-blue-500/40 hover:bg-blue-600/30 text-xs font-sans font-medium cursor-pointer transition-colors"
            title={t("editor.askAiToFixHint", { defaultValue: "Ask AI to diagnose and fix this SQL query" })}
          >
            <Sparkles size={13} className="text-blue-400 shrink-0" />
            <span>{t("editor.askAiToFix")}</span>
          </button>
        )}
      </div>

      {hasDetails && (
        <>
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="mt-2 flex items-center gap-1 text-xs text-red-300/70 hover:text-red-300 transition-colors cursor-pointer"
          >
            {showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {showDetails
              ? t("editor.hideErrorDetails")
              : t("editor.showErrorDetails")}
          </button>
          {showDetails && (
            <div className="mt-2 whitespace-pre-wrap text-red-400/60 border-t border-red-400/20 pt-2">
              {details}
            </div>
          )}
        </>
      )}
    </div>
  );
}

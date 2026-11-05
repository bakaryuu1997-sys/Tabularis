import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Search,
  Zap,
  Copy,
  Check,
  X,
  ArrowRight,
  SlidersHorizontal,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { Modal } from "../ui/Modal";
import { copyTextToClipboard } from "../../utils/clipboard";
import {
  CATEGORIES,
  DEFAULT_TEMPLATES,
  resolveSql,
  type SqlTemplate,
  type SqlTemplateParam,
} from "../../utils/sqlTemplates";

export interface SqlTemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (sql: string) => void;
  tables?: string[];
  activeTable?: string | null;
}

export function SqlTemplatesModal({
  isOpen,
  onClose,
  onInsert,
  tables = [],
  activeTable,
}: SqlTemplatesModalProps) {
  const { t } = useTranslation();
  const templateName = (tmpl: SqlTemplate) => (tmpl.nameKey ? t(tmpl.nameKey) : tmpl.name);
  const templateDescription = (tmpl: SqlTemplate) =>
    tmpl.descriptionKey ? t(tmpl.descriptionKey) : tmpl.description;
  const paramLabel = (param: SqlTemplateParam) => (param.labelKey ? t(param.labelKey) : param.label);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Expanded parameter panels: Record<tmplId, boolean>
  const [openParamPanels, setOpenParamPanels] = useState<Record<string, boolean>>({});

  // Transient drafts: Record<tmplId, Record<paramKey, string>>
  // Never written to persistent storage, resets on close so original templates are ALWAYS preserved.
  const [customParams, setCustomParams] = useState<Record<string, Record<string, string>>>({});

  // Reset drafts whenever modal is closed or opened so original templates are 100% pristine
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (!isOpen) {
      setCustomParams({});
      setOpenParamPanels({});
      setSearch("");
    }
  }

  const filteredTemplates = useMemo(() => {
    return DEFAULT_TEMPLATES.filter((tmpl) => {
      const matchCat = selectedCategory === "all" || tmpl.category === selectedCategory;
      const term = search.trim().toLowerCase();
      const matchSearch =
        !term ||
        templateName(tmpl).toLowerCase().includes(term) ||
        templateDescription(tmpl).toLowerCase().includes(term) ||
        tmpl.sql.toLowerCase().includes(term);
      return matchCat && matchSearch;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the name/description getters only depend on `t`
  }, [search, selectedCategory, t]);

  const toggleParams = (id: string) => {
    setOpenParamPanels((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleParamChange = (tmplId: string, paramKey: string, value: string) => {
    setCustomParams((prev) => ({
      ...prev,
      [tmplId]: {
        ...(prev[tmplId] || {}),
        [paramKey]: value,
      },
    }));
  };

  const handleReset = (tmplId: string) => {
    setCustomParams((prev) => {
      const next = { ...prev };
      delete next[tmplId];
      return next;
    });
  };

  const handleCopy = async (tmpl: SqlTemplate) => {
    const finalSql = resolveSql(tmpl, customParams[tmpl.id], activeTable);
    await copyTextToClipboard(finalSql);
    setCopiedId(tmpl.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="bg-elevated border border-strong rounded-xl shadow-2xl w-[760px] max-w-[95vw] max-h-[88vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-default bg-base flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-amber-500/15 text-amber-400 rounded-lg">
              <Zap size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-primary">
                {t("editor.sqlTemplates.title")}
              </h2>
              <p className="text-xs text-muted">
                {t("editor.sqlTemplates.subtitle")}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted hover:text-primary hover:bg-surface-secondary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search & Category Filter */}
        <div className="p-4 border-b border-default bg-surface-secondary/40 flex flex-col gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("editor.sqlTemplates.searchPlaceholder")}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-surface-secondary border border-strong rounded-lg text-primary placeholder:text-muted focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-thin">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === cat.id
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-surface-secondary text-secondary hover:text-primary hover:bg-surface-tertiary"
                }`}
              >
                {t(cat.labelKey)}
              </button>
            ))}
          </div>
        </div>

        {/* Templates List */}
        <div className="p-4 flex-1 overflow-y-auto space-y-3.5 select-text">
          {filteredTemplates.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted italic">
              {t("editor.sqlTemplates.empty")}
            </div>
          ) : (
            filteredTemplates.map((tmpl) => {
              const tmplDrafts = customParams[tmpl.id] || {};
              const isCustomized = Boolean(
                Object.keys(tmplDrafts).length > 0 &&
                Object.values(tmplDrafts).some((v) => v !== "" && v !== undefined)
              );
              const isParamsOpen = Boolean(openParamPanels[tmpl.id]);
              const resolvedSql = resolveSql(tmpl, customParams[tmpl.id], activeTable);
              const categoryObj = CATEGORIES.find((c) => c.id === tmpl.category);

              return (
                <div
                  key={tmpl.id}
                  className="group p-3.5 rounded-xl border border-default bg-base hover:border-blue-500/40 hover:bg-surface-secondary/20 transition-all flex flex-col gap-3 shadow-sm"
                >
                  {/* Card Header & Actions */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-xs font-bold text-primary group-hover:text-blue-400 transition-colors">
                          {templateName(tmpl)}
                        </h4>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-secondary text-muted font-medium border border-default/50">
                          {categoryObj ? t(categoryObj.labelKey) : tmpl.category}
                        </span>
                        {isCustomized && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-semibold border border-amber-500/30 flex items-center gap-1">
                            <Sparkles size={10} />
                            {t("sqlTemplatesModal.customized")}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted mt-0.5">{templateDescription(tmpl)}</p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {tmpl.params && tmpl.params.length > 0 && (
                        <button
                          onClick={() => toggleParams(tmpl.id)}
                          className={`px-2 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1 border ${
                            isParamsOpen
                              ? "bg-blue-600/15 text-blue-400 border-blue-500/40"
                              : "bg-surface-secondary hover:bg-surface-tertiary text-secondary hover:text-primary border-default/60"
                          }`}
                          title={t("sqlTemplatesModal.fillTooltip")}
                        >
                          <SlidersHorizontal size={12} />
                          <span>{isParamsOpen ? t("sqlTemplatesModal.collapse") : t("sqlTemplatesModal.fillParams")}</span>
                        </button>
                      )}

                      {isCustomized && (
                        <button
                          onClick={() => handleReset(tmpl.id)}
                          className="p-1.5 rounded bg-surface-secondary hover:bg-surface-tertiary text-muted hover:text-amber-400 text-xs transition-colors flex items-center gap-1 border border-default/60"
                          title={t("sqlTemplatesModal.restoreTooltip")}
                        >
                          <RotateCcw size={12} />
                        </button>
                      )}

                      <button
                        onClick={() => handleCopy(tmpl)}
                        className="p-1.5 rounded bg-surface-secondary hover:bg-surface-tertiary text-secondary hover:text-primary text-xs transition-colors flex items-center gap-1 border border-default/60"
                        title={t("sqlTemplatesModal.copySql")}
                      >
                        {copiedId === tmpl.id ? (
                          <>
                            <Check size={12} className="text-emerald-400" />
                            <span className="text-[10px] text-emerald-400 font-medium">{t("sqlTemplatesModal.copied")}</span>
                          </>
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>

                      <button
                        onClick={() => {
                          onInsert(resolvedSql);
                          onClose();
                        }}
                        className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors flex items-center gap-1 shadow-sm"
                        title={t("sqlTemplatesModal.insertTooltip")}
                      >
                        <span>{t("sqlTemplatesModal.insert")}</span>
                        <ArrowRight size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Interactive Parameter Customization Form */}
                  {isParamsOpen && tmpl.params && (
                    <div className="p-3 bg-surface-secondary/70 border border-blue-500/20 rounded-lg flex flex-col gap-2.5 transition-all text-xs">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-primary border-b border-default/40 pb-1.5">
                        <span className="flex items-center gap-1 text-blue-400">
                          <SlidersHorizontal size={11} />
                          {t("sqlTemplatesModal.quickCustomize")}
                        </span>
                        {isCustomized && (
                          <button
                            onClick={() => handleReset(tmpl.id)}
                            className="text-muted hover:text-amber-400 text-[10px] flex items-center gap-1 transition-colors"
                          >
                            <RotateCcw size={10} />
                            {t("sqlTemplatesModal.restoreDefaults")}
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {tmpl.params.map((param) => {
                          const val = tmplDrafts[param.key] ?? "";
                          if (param.type === "multiline") {
                            return (
                              <div key={param.key} className="col-span-full flex flex-col gap-1">
                                <label className="text-[11px] font-medium text-secondary">
                                  {paramLabel(param)}:
                                </label>
                                <textarea
                                  rows={4}
                                  value={val || param.defaultValue}
                                  onChange={(e) =>
                                    handleParamChange(tmpl.id, param.key, e.target.value)
                                  }
                                  className="w-full px-2.5 py-1.5 bg-base border border-default rounded text-[11px] font-mono text-primary placeholder:text-muted/60 focus:outline-none focus:border-blue-500 resize-y"
                                />
                              </div>
                            );
                          }

                          return (
                            <div key={param.key} className="flex flex-col gap-1">
                              <label className="text-[11px] font-medium text-secondary">
                                {paramLabel(param)}:
                              </label>
                              <div className="relative">
                                <input
                                  type="text"
                                  list={param.type === "table" ? `db-tables-${tmpl.id}` : undefined}
                                  value={val}
                                  placeholder={
                                    param.type === "table" && activeTable && param.key === "tableName"
                                      ? activeTable
                                      : param.defaultValue
                                  }
                                  onChange={(e) =>
                                    handleParamChange(tmpl.id, param.key, e.target.value)
                                  }
                                  className="w-full px-2.5 py-1 bg-base border border-default rounded text-[11px] text-primary placeholder:text-muted/60 focus:outline-none focus:border-blue-500 font-mono"
                                />
                                {param.type === "table" && tables.length > 0 && (
                                  <datalist id={`db-tables-${tmpl.id}`}>
                                    {tables.map((tbl) => (
                                      <option key={tbl} value={tbl} />
                                    ))}
                                  </datalist>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* SQL Preview Box with Selectable & Copyable Text */}
                  <div className="relative">
                    <pre className="p-3 bg-surface-secondary/90 rounded-lg border border-default/60 text-[11px] font-mono text-secondary overflow-x-auto whitespace-pre selection:bg-blue-500/30 select-text cursor-text">
                      {resolvedSql}
                    </pre>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
}

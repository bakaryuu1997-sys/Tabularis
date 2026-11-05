import { useTranslation } from "react-i18next";
import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type KeyboardEvent,
  type ReactNode,
  type ReactElement,
} from "react";
import { invoke, Channel } from "@tauri-apps/api/core";
import { useNavigate } from "react-router-dom";
import Markdown from "react-markdown";
import {
  MessageCircle,
  X,
  Send,
  Loader2,
  Trash2,
  RefreshCw,
  Bot,
  Database,
  Settings as SettingsIcon,
  Copy,
  Check,
  FilePlus,
  Play,
  Square,
  Plus,
  ChevronDown,
  Pencil,
} from "lucide-react";
import clsx from "clsx";
import { useSettings } from "../../hooks/useSettings";
import { useDatabase } from "../../hooks/useDatabase";
import { useEditor } from "../../hooks/useEditor";
import { requestRunSql, onAiPrompt } from "../../utils/aiRunBus";
import { buildRichSchemaContext } from "../../utils/aiSchemaContext";
import { getProviderLabel } from "../../utils/settingsUI";
import { Select } from "../ui/Select";
import type { TableSchema } from "../../types/editor";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
}

const HISTORY_KEY = "tabularis.aiChat.history"; // legacy single-conversation key
const SESSIONS_KEY = "tabularis.aiChat.sessions";
const CURRENT_KEY = "tabularis.aiChat.current";
const SCHEMA_KEY = "tabularis.aiChat.useSchema";
const MAX_STORED = 100;
/// Untitled sessions keep an empty title and show a translated label. The Vietnamese
/// text is what older versions stored, so it is still recognised as "untitled".
const DEFAULT_TITLE = "";
const LEGACY_DEFAULT_TITLE = "Trò chuyện mới";
const isDefaultTitle = (title: string | undefined) =>
  !title || title === DEFAULT_TITLE || title === LEGACY_DEFAULT_TITLE;

function makeSession(messages: ChatMessage[] = []): ChatSession {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    title: DEFAULT_TITLE,
    messages,
    updatedAt: Date.now(),
  };
}

/// Load sessions from storage, migrating a legacy single conversation if found.
function loadInitialSessions(): { sessions: ChatSession[]; currentId: string } {
  try {
    const rawS = localStorage.getItem(SESSIONS_KEY);
    if (rawS) {
      const parsed = JSON.parse(rawS);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const sessions = parsed as ChatSession[];
        const saved = localStorage.getItem(CURRENT_KEY);
        const currentId =
          saved && sessions.some((s) => s.id === saved)
            ? saved
            : sessions[0].id;
        return { sessions, currentId };
      }
    }
    // Migrate the old single-conversation history into the first session.
    const legacy = localStorage.getItem(HISTORY_KEY);
    const msgs = legacy ? JSON.parse(legacy) : [];
    const first = makeSession(Array.isArray(msgs) ? (msgs as ChatMessage[]) : []);
    return { sessions: [first], currentId: first.id };
  } catch {
    const first = makeSession([]);
    return { sessions: [first], currentId: first.id };
  }
}

/// Translation keys of the starter prompts shown when the conversation is empty.
const SUGGESTION_KEYS = [
  "aiChat.suggestions.latestRows",
  "aiChat.suggestions.optimize",
  "aiChat.suggestions.explainColumns",
  "aiChat.suggestions.toPostgres",
] as const;



/// Recursively flatten a React node tree to its plain text (used to recover the
/// raw source of a fenced code block rendered by react-markdown).
function nodeText(node: ReactNode): string {
  if (node == null || node === false || node === true) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (typeof node === "object" && "props" in node) {
    return nodeText((node as ReactElement<{ children?: ReactNode }>).props.children);
  }
  return "";
}

const SQL_LANGS =
  /^(sql|pgsql|plpgsql|mysql|tsql|sqlite|postgres|postgresql|mariadb|mssql)$/;

/// A fenced code block with a Copy button and (for SQL) an "insert into editor"
/// action. Rendered in place of the default markdown `<pre>`.
function CodeBlock({
  children,
  onInsert,
  onRun,
  canInsert,
}: {
  children?: ReactNode;
  onInsert: (sql: string) => void;
  onRun: (sql: string) => void;
  canInsert: boolean;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  // react-markdown passes the inner <code> element as `children`.
  const codeEl = children as
    | ReactElement<{ className?: string; children?: ReactNode }>
    | undefined;
  const className = codeEl?.props?.className ?? "";
  const lang = /language-(\w+)/.exec(className)?.[1]?.toLowerCase() ?? "";
  const raw = nodeText(codeEl?.props?.children).replace(/\n$/, "");
  const sqlish = lang === "" || SQL_LANGS.test(lang);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="my-2 rounded-lg overflow-hidden border border-default bg-black/40">
      <div className="flex items-center justify-between px-2 py-1 border-b border-default/60">
        <span className="text-[10px] uppercase tracking-wide text-muted">
          {lang || "code"}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={copy}
            title={t("aiChat.copy")}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-secondary hover:text-primary hover:bg-surface-tertiary transition-colors"
          >
            {copied ? <Check size={11} /> : <Copy size={11} />}
            {copied ? t("aiChat.copied") : t("aiChat.copy")}
          </button>
          {sqlish && (
            <>
              <button
                onClick={() => onInsert(raw)}
                disabled={!canInsert}
                title={
                  canInsert
                    ? t("aiChat.insertTooltip")
                    : t("aiChat.openConnectionToInsert")
                }
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-blue-400 hover:text-blue-300 hover:bg-blue-900/20 disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                <FilePlus size={11} /> {t("aiChat.insert")}
              </button>
              <button
                onClick={() => onRun(raw)}
                disabled={!canInsert}
                title={
                  canInsert
                    ? t("aiChat.runTooltip")
                    : t("aiChat.openConnectionToRun")
                }
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-green-400 hover:text-green-300 hover:bg-green-900/20 disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                <Play size={11} /> {t("aiChat.runNow")}
              </button>
            </>
          )}
        </div>
      </div>
      <pre className="!m-0 !bg-transparent p-3 overflow-x-auto text-xs leading-relaxed">
        <code className={className}>{codeEl?.props?.children}</code>
      </pre>
    </div>
  );
}

const PROSE_CLASSES =
  "prose-notebook text-sm leading-relaxed break-words select-text " +
  "[&_h1]:text-base [&_h1]:font-bold [&_h1]:mb-2 [&_h1]:text-primary [&_h1]:select-text " +
  "[&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mb-1.5 [&_h2]:text-primary [&_h2]:select-text " +
  "[&_h3]:text-sm [&_h3]:font-medium [&_h3]:mb-1 [&_h3]:text-primary [&_h3]:select-text " +
  "[&_p]:mb-2 last:[&_p]:mb-0 [&_p]:select-text " +
  "[&_code]:bg-black/30 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono [&_code]:select-text " +
  "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2 [&_ul]:select-text " +
  "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2 [&_ol]:select-text " +
  "[&_li]:mb-1 [&_li]:select-text " +
  "[&_a]:text-blue-400 [&_a]:underline " +
  "[&_blockquote]:border-l-2 [&_blockquote]:border-muted [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-muted [&_blockquote]:select-text " +
  "[&_table]:border-collapse [&_table]:w-full [&_table]:mb-2 [&_table]:select-text " +
  "[&_th]:border [&_th]:border-default [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:text-xs [&_th]:select-text " +
  "[&_td]:border [&_td]:border-default [&_td]:px-2 [&_td]:py-1 [&_td]:text-xs [&_td]:select-text " +
  "[&_strong]:font-semibold [&_strong]:text-primary [&_em]:italic";

export function AiChatWidget() {
  const { t } = useTranslation();
  const { settings, updateSetting } = useSettings();
  const { activeConnectionId } = useDatabase();
  const { activeTab, addTab, updateTab } = useEditor();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [useSchema, setUseSchema] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SCHEMA_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const schemaCacheRef = useRef<Record<string, string>>({});
  const [schemaTableCount, setSchemaTableCount] = useState<number | null>(null);
  const [models, setModels] = useState<string[]>([]);

  // Multiple conversations ("sessions"). `messages` is the working buffer for
  // the current session; it is synced back into `sessions` (and persisted) by
  // the effect below.
  const [initial] = useState(loadInitialSessions);
  const [sessions, setSessions] = useState<ChatSession[]>(initial.sessions);
  const [currentId, setCurrentId] = useState<string>(initial.currentId);
  const [messages, setMessages] = useState<ChatMessage[]>(
    () =>
      initial.sessions.find((s) => s.id === initial.currentId)?.messages ?? [],
  );
  const [showSessions, setShowSessions] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedMsgIndex, setCopiedMsgIndex] = useState<number | null>(null);
  const [copiedError, setCopiedError] = useState(false);

  const handleCopyText = async (text: string, index?: number) => {
    try {
      await navigator.clipboard.writeText(text);
      if (typeof index === "number") {
        setCopiedMsgIndex(index);
        setTimeout(() => setCopiedMsgIndex(null), 1500);
      } else {
        setCopiedError(true);
        setTimeout(() => setCopiedError(false), 1500);
      }
    } catch {
      /* clipboard fallback */
    }
  };

  const cancelRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const rawCurrentTitle = sessions.find((s) => s.id === currentId)?.title ?? DEFAULT_TITLE;
  const currentTitle = isDefaultTitle(rawCurrentTitle) ? t("aiChat.defaultTitle") : rawCurrentTitle;

  const provider = settings.aiProvider;

  const loadModels = useCallback(
    async (force = false) => {
      if (!provider) return;
      try {
        const all = await invoke<Record<string, string[]>>("get_ai_models", {
          forceRefresh: force,
        });
        const custom = settings.aiCustomModels?.[provider];
        setModels(custom && custom.length > 0 ? custom : all[provider] || []);
      } catch (e) {
        console.error("Failed to load AI models for chat widget", e);
      }
    },
    [provider, settings.aiCustomModels],
  );

  useEffect(() => {
    if (open) loadModels(false);
  }, [open, loadModels]);

  // Sync the working buffer into the current session and persist all sessions
  // (but not on every streaming delta, to avoid thrashing storage).
  useEffect(() => {
    if (loading) return;
    setSessions((prev) => {
      const next = prev.map((s) =>
        s.id === currentId
          ? { ...s, messages: messages.slice(-MAX_STORED), updatedAt: Date.now() }
          : s,
      );
      try {
        localStorage.setItem(SESSIONS_KEY, JSON.stringify(next));
      } catch {
        /* storage full / unavailable */
      }
      return next;
    });
  }, [messages, loading, currentId]);

  // Persist which session is active.
  useEffect(() => {
    try {
      localStorage.setItem(CURRENT_KEY, currentId);
    } catch {
      /* ignore */
    }
  }, [currentId]);

  // Persist the schema-context toggle.
  useEffect(() => {
    try {
      localStorage.setItem(SCHEMA_KEY, useSchema ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [useSchema]);

  // Auto-scroll to the latest message.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Auto-grow the input textarea.
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
    }
  }, [input]);

  // Fetch (and cache) a rich schema string with foreign keys and sample data.
  const getSchemaContext = useCallback(async (): Promise<string> => {
    if (!useSchema || !activeConnectionId) return "";
    const cached = schemaCacheRef.current[activeConnectionId];
    if (cached !== undefined) return cached;
    try {
      const tables = await invoke<TableSchema[]>("get_schema_snapshot", {
        connectionId: activeConnectionId,
        schema: activeTab?.schema ?? undefined,
      });
      setSchemaTableCount(tables.length);
      const sampleData =
        activeTab?.activeTable &&
        activeTab.result?.rows?.length &&
        activeTab.result.columns
          ? {
              [activeTab.activeTable]: activeTab.result.rows
                .slice(0, 5)
                .map((row) => {
                  const obj: Record<string, unknown> = {};
                  activeTab.result!.columns.forEach((col, idx) => {
                    obj[col] = row[idx];
                  });
                  return obj;
                }),
            }
          : undefined;
      const ctx = buildRichSchemaContext(tables, { sampleData, maxTables: 500, maxCols: 100 });
      schemaCacheRef.current[activeConnectionId] = ctx;
      return ctx;
    } catch (e) {
      console.error("Failed to load schema for AI chat", e);
      return "";
    }
  }, [useSchema, activeConnectionId, activeTab]);

  const refreshSchema = useCallback(() => {
    if (activeConnectionId) {
      delete schemaCacheRef.current[activeConnectionId];
      void getSchemaContext();
    }
  }, [activeConnectionId, getSchemaContext]);

  // Append a SQL snippet to the current console tab (preserving what's already
  // there), or open a fresh console tab if none is active. Then jump to the
  // editor so the result is visible.
  const handleInsertSql = useCallback(
    (sql: string) => {
      const code = sql.trim();
      if (!code) return;
      if (!activeConnectionId) {
        setError(t("aiChat.errorNeedConnectionInsert"));
        return;
      }
      if (activeTab && activeTab.type === "console") {
        const existing = (activeTab.query ?? "").replace(/\s+$/, "");
        const next = existing ? `${existing}\n\n${code}` : code;
        updateTab(activeTab.id, { query: next });
      } else {
        addTab({ type: "console", query: code, title: "AI SQL" });
      }
      navigate("/editor");
    },
    [activeConnectionId, activeTab, updateTab, addTab, navigate, t],
  );

  // Insert the SQL and run it in one shot (via the Editor bridge), then jump to
  // the editor so the result is visible.
  const handleRunSql = useCallback(
    (sql: string) => {
      const code = sql.trim();
      if (!code) return;
      if (!activeConnectionId) {
        setError(t("aiChat.errorNeedConnectionRun"));
        return;
      }
      requestRunSql(code);
      navigate("/editor");
    },
    [activeConnectionId, navigate, t],
  );

  const mdComponents = useMemo(
    () => ({
      pre: (props: { children?: ReactNode }) => (
        <CodeBlock
          onInsert={handleInsertSql}
          onRun={handleRunSql}
          canInsert={!!activeConnectionId}
          {...props}
        />
      ),
    }),
    [handleInsertSql, handleRunSql, activeConnectionId],
  );

  const handleSend = async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || loading) return;
    if (!provider) {
      setError(t("aiChat.errorNoProvider"));
      return;
    }

    cancelRef.current = false;
    const userMsg: ChatMessage = { role: "user", content: text };
    const history = [...messages, userMsg];

    // Auto-name a still-unnamed session from its first user message.
    if (messages.every((m) => m.role !== "user")) {
      const title = text.replace(/\s+/g, " ").trim().slice(0, 40) || DEFAULT_TITLE;
      setSessions((prev) =>
        prev.map((s) =>
          s.id === currentId && isDefaultTitle(s.title)
            ? { ...s, title }
            : s,
        ),
      );
    }

    setMessages(history);
    setInput("");
    setError(null);
    setLoading(true);

    const schema = await getSchemaContext();

    // Append an empty assistant bubble that streaming deltas fill in.
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
    let acc = "";
    let rafId: number | null = null;
    const channel = new Channel<string>();
    channel.onmessage = (delta) => {
      if (cancelRef.current) return;
      acc += delta;
      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          rafId = null;
          setMessages((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] = { role: "assistant", content: acc };
            return copy;
          });
        });
      }
    };

    const req = {
      provider,
      model: settings.aiModel || "",
      messages: history,
      schema,
    };

    try {
      await invoke<string>("chat_ai_stream", { req, onEvent: channel });
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (cancelRef.current) return;
      // If the provider streamed nothing and backend fallback also came back
      // empty, surface a hint instead of a blank bubble.
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          role: "assistant",
          content: acc.trim() ? acc : t("aiChat.emptyResponse"),
        };
        return copy;
      });
    } catch (e) {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (cancelRef.current) return;
      // Drop the empty placeholder and show the error.
      setMessages((prev) => {
        const copy = [...prev];
        if (
          copy.length > 0 &&
          copy[copy.length - 1].role === "assistant" &&
          !copy[copy.length - 1].content
        ) {
          copy.pop();
        }
        return copy;
      });
      setError(String(e));
    } finally {
      if (!cancelRef.current) {
        setLoading(false);
        inputRef.current?.focus();
      }
    }
  };

  // Listen for prompts requested from external components (e.g. "Ask AI to fix error" button).
  useEffect(() => {
    return onAiPrompt((prompt) => {
      setOpen(true);
      void handleSend(prompt);
    });
  }, [handleSend]);

  // Client-side stop: ignore further deltas and finalize the current bubble.
  // (The backend request may run a moment longer, but its output is discarded.)
  const handleStop = () => {
    cancelRef.current = true;
    setLoading(false);
    setMessages((prev) => {
      const copy = [...prev];
      const last = copy[copy.length - 1];
      if (last && last.role === "assistant" && !last.content) {
        copy[copy.length - 1] = { role: "assistant", content: t("aiChat.stopped") };
      }
      return copy;
    });
    inputRef.current?.focus();
  };

  const handleClear = () => {
    if (loading) handleStop();
    setMessages([]);
    setError(null);
  };

  // --- Session management ---

  // Persist the current buffer into `sessions` before switching away from it.
  const flushCurrent = useCallback(
    (list: ChatSession[]) =>
      list.map((s) =>
        s.id === currentId ? { ...s, messages, updatedAt: Date.now() } : s,
      ),
    [currentId, messages],
  );

  const newChat = () => {
    if (loading) handleStop();
    const s = makeSession([]);
    setSessions((prev) => [s, ...flushCurrent(prev)]);
    setCurrentId(s.id);
    setMessages([]);
    setError(null);
    setShowSessions(false);
    inputRef.current?.focus();
  };

  const switchSession = (id: string) => {
    if (id === currentId) {
      setShowSessions(false);
      return;
    }
    if (loading) handleStop();
    const flushed = flushCurrent(sessions);
    const target = flushed.find((s) => s.id === id);
    setSessions(flushed);
    setCurrentId(id);
    setMessages(target?.messages ?? []);
    setError(null);
    setShowSessions(false);
  };

  const deleteSession = (id: string) => {
    const remaining = sessions.filter((s) => s.id !== id);
    if (remaining.length === 0) {
      const fresh = makeSession([]);
      setSessions([fresh]);
      setCurrentId(fresh.id);
      setMessages([]);
      return;
    }
    setSessions(remaining);
    if (id === currentId) {
      setCurrentId(remaining[0].id);
      setMessages(remaining[0].messages);
    }
  };

  const startRename = (s: ChatSession) => {
    setRenamingId(s.id);
    setRenameDraft(s.title);
  };

  const commitRename = () => {
    const id = renamingId;
    if (!id) return;
    const title = renameDraft.trim() || DEFAULT_TITLE;
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, title } : s)),
    );
    setRenamingId(null);
    setRenameDraft("");
  };

  const applySuggestion = (s: string) => {
    setInput(s);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!settings.aiEnabled) return null;

  return (
    <>
      {/* Floating launcher button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="AI Chat"
          className="fixed bottom-5 right-5 z-[60] flex items-center justify-center w-12 h-12 rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/30 transition-all hover:scale-105"
        >
          <MessageCircle size={22} />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-5 right-5 z-[60] flex flex-col w-[380px] max-w-[calc(100vw-2.5rem)] h-[560px] max-h-[calc(100vh-2.5rem)] bg-elevated border border-strong rounded-xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="relative flex items-center gap-2 px-3 py-2.5 border-b border-default bg-surface-secondary">
            <Bot size={18} className="text-blue-400 shrink-0" />
            <button
              onClick={() => setShowSessions((v) => !v)}
              title={t("aiChat.conversations")}
              className="flex flex-col min-w-0 flex-1 text-left"
            >
              <span className="flex items-center gap-1 text-sm font-medium text-primary leading-tight">
                <span className="truncate">{currentTitle}</span>
                <ChevronDown
                  size={13}
                  className={clsx(
                    "shrink-0 text-muted transition-transform",
                    showSessions && "rotate-180",
                  )}
                />
              </span>
              <span className="text-[11px] text-muted leading-tight truncate">
                {provider ? getProviderLabel(provider) : t("aiChat.notConfigured")}
              </span>
            </button>
            <div className="ml-auto flex items-center gap-1 shrink-0">
              <button
                onClick={newChat}
                title={t("aiChat.newConversation")}
                className="p-1.5 rounded-md text-secondary hover:text-primary hover:bg-surface-tertiary transition-colors"
              >
                <Plus size={16} />
              </button>
              <button
                onClick={handleClear}
                title={t("aiChat.clearConversation")}
                disabled={messages.length === 0}
                className="p-1.5 rounded-md text-secondary hover:text-primary hover:bg-surface-tertiary disabled:opacity-40 transition-colors"
              >
                <Trash2 size={15} />
              </button>
              <button
                onClick={() => setOpen(false)}
                title={t("aiChat.close")}
                className="p-1.5 rounded-md text-secondary hover:text-primary hover:bg-surface-tertiary transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Sessions dropdown */}
            {showSessions && (
              <div className="absolute left-2 right-2 top-full mt-1 z-10 max-h-72 overflow-y-auto bg-elevated border border-strong rounded-lg shadow-xl py-1">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className={clsx(
                      "group flex items-center gap-1 px-2 py-1.5 mx-1 rounded-md",
                      s.id === currentId
                        ? "bg-blue-600/10"
                        : "hover:bg-surface-tertiary",
                    )}
                  >
                    {renamingId === s.id ? (
                      <input
                        autoFocus
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename();
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        onBlur={commitRename}
                        className="flex-1 min-w-0 bg-base border border-strong rounded px-1.5 py-0.5 text-xs text-primary outline-none focus:border-blue-500"
                      />
                    ) : (
                      <button
                        onClick={() => switchSession(s.id)}
                        title={isDefaultTitle(s.title) ? t("aiChat.defaultTitle") : s.title}
                        className={clsx(
                          "flex-1 min-w-0 text-left text-xs truncate",
                          s.id === currentId
                            ? "text-blue-400 font-medium"
                            : "text-secondary",
                        )}
                      >
                        {isDefaultTitle(s.title) ? t("aiChat.defaultTitle") : s.title}
                      </button>
                    )}
                    {renamingId === s.id ? (
                      <button
                        onClick={commitRename}
                        title={t("aiChat.saveName")}
                        className="p-1 rounded text-green-400 hover:bg-surface-tertiary shrink-0"
                      >
                        <Check size={12} />
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => startRename(s)}
                          title={t("aiChat.rename")}
                          className="p-1 rounded text-muted hover:text-primary hover:bg-surface-tertiary opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => deleteSession(s.id)}
                          title={t("aiChat.deleteConversation")}
                          className="p-1 rounded text-muted hover:text-red-400 hover:bg-surface-tertiary opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        >
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Model quick-switch */}
          {provider && provider !== "ollama" && (
            <div className="flex items-center gap-2 px-3 py-2 border-b border-default">
              <span className="text-[11px] text-muted shrink-0">Model</span>
              <div className="flex-1 min-w-0">
                <Select
                  value={settings.aiModel}
                  options={models}
                  onChange={(val) => updateSetting("aiModel", val)}
                  placeholder={t("aiChat.pickModel")}
                  searchPlaceholder={t("aiChat.searchModel")}
                  noResultsLabel={t("aiChat.noModels")}
                />
              </div>
              <button
                onClick={() => loadModels(true)}
                title={t("aiChat.reloadModels")}
                className="p-1.5 rounded-md text-secondary hover:text-primary hover:bg-surface-tertiary transition-colors shrink-0"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          )}

          {/* DB schema context toggle */}
          {activeConnectionId && (
            <div className="flex items-center justify-between px-3 py-1.5 text-[11px] border-b border-default bg-surface/50">
              <button
                onClick={() => setUseSchema((v) => !v)}
                title={t("aiChat.schemaToggleTooltip")}
                className={clsx(
                  "flex items-center gap-1.5 transition-colors font-medium truncate",
                  useSchema
                    ? "text-blue-400 hover:text-blue-300"
                    : "text-muted hover:text-secondary",
                )}
              >
                <Database size={12} className="shrink-0" />
                <span className="truncate">
                  {useSchema
                    ? schemaTableCount !== null
                      ? t("aiChat.readingDbWithCount", { count: schemaTableCount })
                      : t("aiChat.readingDb")
                    : t("aiChat.noSchema")}
                </span>
              </button>
              {useSchema && (
                <button
                  onClick={refreshSchema}
                  title={t("aiChat.refreshSchema")}
                  className="p-1 rounded text-muted hover:text-primary hover:bg-surface-secondary transition-colors shrink-0 ml-1"
                >
                  <RefreshCw size={11} />
                </button>
              )}
            </div>
          )}

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-3 py-3 space-y-3 select-text chat-messages"
          >
            {messages.length === 0 && !error && (
              <div className="h-full flex flex-col items-center justify-center text-center gap-3 text-muted px-3 select-none">
                <Bot size={32} className="opacity-40" />
                <p className="text-sm">{t("aiChat.askAnything")}</p>
                {!provider ? (
                  <button
                    onClick={() => {
                      setOpen(false);
                      navigate("/settings");
                    }}
                    className="mt-1 inline-flex items-center gap-1.5 text-xs text-blue-400 hover:underline"
                  >
                    <SettingsIcon size={12} /> {t("aiChat.configureInSettings")}
                  </button>
                ) : (
                  <div className="flex flex-col gap-1.5 w-full mt-1">
                    {SUGGESTION_KEYS.map((key) => t(key)).map((s) => (
                      <button
                        key={s}
                        onClick={() => applySuggestion(s)}
                        className="text-left text-xs text-secondary hover:text-primary bg-surface-secondary hover:bg-surface-tertiary border border-default rounded-lg px-3 py-2 transition-colors truncate"
                      >
                        {s.trim()}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                className={clsx(
                  "flex group/msg relative",
                  m.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={clsx(
                    "max-w-[85%] rounded-xl px-3 py-2 select-text chat-bubble relative group/bubble",
                    m.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-surface-secondary text-secondary border border-default",
                  )}
                >
                  <button
                    onClick={() => handleCopyText(m.content, i)}
                    title={t("aiChat.copyMessage")}
                    className={clsx(
                      "absolute top-1.5 right-1.5 p-1 rounded opacity-0 group-hover/bubble:opacity-100 transition-opacity z-10",
                      m.role === "user"
                        ? "bg-blue-700/80 hover:bg-blue-800 text-white"
                        : "bg-surface-tertiary/90 hover:bg-surface-tertiary text-muted hover:text-primary shadow-sm border border-default/50",
                    )}
                  >
                    {copiedMsgIndex === i ? (
                      <Check size={12} className="text-green-300" />
                    ) : (
                      <Copy size={12} />
                    )}
                  </button>

                  {m.role === "user" ? (
                    <p className="text-sm whitespace-pre-wrap break-words select-text cursor-text pr-5">
                      {m.content}
                    </p>
                  ) : m.content ? (
                    <div className={clsx(PROSE_CLASSES, "select-text cursor-text pr-5")}>
                      <Markdown components={mdComponents}>{m.content}</Markdown>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-muted text-sm py-0.5 select-text">
                      <Loader2 size={14} className="animate-spin" />
                      {t("aiChat.answering")}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && messages[messages.length - 1]?.role === "user" && (
              <div className="flex justify-start">
                <div className="bg-surface-secondary border border-default rounded-xl px-3 py-2 flex items-center gap-2 text-muted text-sm select-text">
                  <Loader2 size={14} className="animate-spin" />
                  {t("aiChat.answering")}
                </div>
              </div>
            )}

            {error && (
              <div className="group/err relative text-xs text-red-400 bg-red-900/10 border border-red-900/20 rounded-lg px-3 py-2 pr-8 break-words select-text cursor-text">
                <span className="select-text cursor-text">{error}</span>
                <button
                  onClick={() => handleCopyText(error)}
                  title={t("aiChat.copyError")}
                  className="absolute top-1.5 right-1.5 p-1 rounded bg-red-900/30 hover:bg-red-900/60 text-red-300 hover:text-white transition-colors"
                >
                  {copiedError ? (
                    <Check size={12} className="text-green-400" />
                  ) : (
                    <Copy size={12} />
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-default p-2.5">
            <div className="flex items-end gap-2 bg-base border border-strong rounded-lg px-2 py-1.5 focus-within:border-blue-500 transition-colors">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder={t("aiChat.inputPlaceholder")}
                className="flex-1 bg-transparent text-sm text-primary resize-none outline-none max-h-[140px] py-1"
              />
              {loading ? (
                <button
                  onClick={handleStop}
                  className="shrink-0 p-1.5 rounded-md bg-red-600 hover:bg-red-500 text-white transition-colors"
                  title={t("aiChat.stop")}
                >
                  <Square size={16} fill="currentColor" />
                </button>
              ) : (
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim()}
                  className="shrink-0 p-1.5 rounded-md bg-blue-600 hover:bg-blue-500 disabled:bg-surface-secondary disabled:text-muted text-white transition-colors"
                  title={t("aiChat.send")}
                >
                  <Send size={16} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

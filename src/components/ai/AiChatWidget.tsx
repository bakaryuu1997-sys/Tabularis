import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent,
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
} from "lucide-react";
import clsx from "clsx";
import { useSettings } from "../../hooks/useSettings";
import { useDatabase } from "../../hooks/useDatabase";
import { getProviderLabel } from "../../utils/settingsUI";
import { Select } from "../ui/Select";
import type { TableSchema } from "../../types/editor";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/// Build a compact schema string to give the assistant DB context.
/// Capped to keep the prompt small.
function buildSchemaContext(tables: TableSchema[]): string {
  const MAX_TABLES = 40;
  const MAX_COLS = 30;
  const lines = tables.slice(0, MAX_TABLES).map((tbl) => {
    const cols = tbl.columns
      .slice(0, MAX_COLS)
      .map((c) => `${c.name} ${c.data_type}${c.is_pk ? " PK" : ""}`)
      .join(", ");
    const more =
      tbl.columns.length > MAX_COLS
        ? `, …+${tbl.columns.length - MAX_COLS} cols`
        : "";
    return `${tbl.name}(${cols}${more})`;
  });
  if (tables.length > MAX_TABLES) {
    lines.push(`… and ${tables.length - MAX_TABLES} more tables`);
  }
  return lines.join("\n");
}

const PROSE_CLASSES =
  "prose-notebook text-sm leading-relaxed break-words " +
  "[&_h1]:text-base [&_h1]:font-bold [&_h1]:mb-2 [&_h1]:text-primary " +
  "[&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mb-1.5 [&_h2]:text-primary " +
  "[&_h3]:text-sm [&_h3]:font-medium [&_h3]:mb-1 [&_h3]:text-primary " +
  "[&_p]:mb-2 last:[&_p]:mb-0 " +
  "[&_code]:bg-black/30 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono " +
  "[&_pre]:bg-black/40 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:mb-2 [&_pre_code]:bg-transparent [&_pre_code]:p-0 " +
  "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2 " +
  "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2 " +
  "[&_li]:mb-1 " +
  "[&_a]:text-blue-400 [&_a]:underline " +
  "[&_blockquote]:border-l-2 [&_blockquote]:border-muted [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-muted " +
  "[&_table]:border-collapse [&_table]:w-full [&_table]:mb-2 " +
  "[&_th]:border [&_th]:border-default [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:text-xs " +
  "[&_td]:border [&_td]:border-default [&_td]:px-2 [&_td]:py-1 [&_td]:text-xs " +
  "[&_strong]:font-semibold [&_strong]:text-primary [&_em]:italic";

export function AiChatWidget() {
  const { settings, updateSetting } = useSettings();
  const { activeConnectionId } = useDatabase();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [useSchema, setUseSchema] = useState(true);
  const schemaCacheRef = useRef<Record<string, string>>({});
  const [models, setModels] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  // Fetch (and cache) a compact schema string for the active connection.
  const getSchemaContext = useCallback(async (): Promise<string> => {
    if (!useSchema || !activeConnectionId) return "";
    const cached = schemaCacheRef.current[activeConnectionId];
    if (cached !== undefined) return cached;
    try {
      const tables = await invoke<TableSchema[]>("get_schema_snapshot", {
        connectionId: activeConnectionId,
      });
      const ctx = buildSchemaContext(tables);
      schemaCacheRef.current[activeConnectionId] = ctx;
      return ctx;
    } catch (e) {
      console.error("Failed to load schema for AI chat", e);
      return "";
    }
  }, [useSchema, activeConnectionId]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    if (!provider) {
      setError("Chưa cấu hình AI provider. Mở Settings › AI.");
      return;
    }

    const userMsg: ChatMessage = { role: "user", content: text };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput("");
    setError(null);
    setLoading(true);

    const schema = await getSchemaContext();

    // Append an empty assistant bubble that streaming deltas fill in.
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
    let acc = "";
    const channel = new Channel<string>();
    channel.onmessage = (delta) => {
      acc += delta;
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", content: acc };
        return copy;
      });
    };

    const req = {
      provider,
      model: settings.aiModel || "",
      messages: history,
      schema,
    };

    try {
      await invoke<string>("chat_ai_stream", { req, onEvent: channel });
      // If the provider streamed nothing and backend fallback also came back
      // empty, surface a hint instead of a blank bubble.
      if (!acc.trim()) {
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = {
            role: "assistant",
            content: "_(không có nội dung trả về)_",
          };
          return copy;
        });
      }
    } catch (e) {
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
      setLoading(false);
      inputRef.current?.focus();
    }
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
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-default bg-surface-secondary">
            <Bot size={18} className="text-blue-400 shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium text-primary leading-tight">
                AI Chat
              </span>
              <span className="text-[11px] text-muted leading-tight truncate">
                {provider ? getProviderLabel(provider) : "Chưa cấu hình"}
              </span>
            </div>
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={() => setMessages([])}
                title="Xóa hội thoại"
                disabled={messages.length === 0}
                className="p-1.5 rounded-md text-secondary hover:text-primary hover:bg-surface-tertiary disabled:opacity-40 transition-colors"
              >
                <Trash2 size={15} />
              </button>
              <button
                onClick={() => setOpen(false)}
                title="Đóng"
                className="p-1.5 rounded-md text-secondary hover:text-primary hover:bg-surface-tertiary transition-colors"
              >
                <X size={16} />
              </button>
            </div>
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
                  placeholder="Chọn model…"
                  searchPlaceholder="Tìm model…"
                  noResultsLabel="Không có model"
                />
              </div>
              <button
                onClick={() => loadModels(true)}
                title="Tải lại danh sách model"
                className="p-1.5 rounded-md text-secondary hover:text-primary hover:bg-surface-tertiary transition-colors shrink-0"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          )}

          {/* DB schema context toggle */}
          {activeConnectionId && (
            <button
              onClick={() => setUseSchema((v) => !v)}
              title="Cho AI biết schema của kết nối đang mở"
              className={clsx(
                "flex items-center gap-1.5 px-3 py-1.5 text-[11px] border-b border-default transition-colors",
                useSchema
                  ? "text-blue-400 hover:text-blue-300"
                  : "text-muted hover:text-secondary",
              )}
            >
              <Database size={12} />
              {useSchema
                ? "Đang gửi schema DB cho AI"
                : "Không gửi schema DB"}
            </button>
          )}

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-3 py-3 space-y-3"
          >
            {messages.length === 0 && !error && (
              <div className="h-full flex flex-col items-center justify-center text-center gap-2 text-muted px-4">
                <Bot size={32} className="opacity-40" />
                <p className="text-sm">Hỏi AI bất cứ điều gì.</p>
                {!provider && (
                  <button
                    onClick={() => {
                      setOpen(false);
                      navigate("/settings");
                    }}
                    className="mt-1 inline-flex items-center gap-1.5 text-xs text-blue-400 hover:underline"
                  >
                    <SettingsIcon size={12} /> Cấu hình AI trong Settings
                  </button>
                )}
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                className={clsx(
                  "flex",
                  m.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={clsx(
                    "max-w-[85%] rounded-xl px-3 py-2",
                    m.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-surface-secondary text-secondary border border-default",
                  )}
                >
                  {m.role === "user" ? (
                    <p className="text-sm whitespace-pre-wrap break-words">
                      {m.content}
                    </p>
                  ) : m.content ? (
                    <div className={PROSE_CLASSES}>
                      <Markdown>{m.content}</Markdown>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-muted text-sm py-0.5">
                      <Loader2 size={14} className="animate-spin" />
                      Đang trả lời…
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && messages[messages.length - 1]?.role === "user" && (
              <div className="flex justify-start">
                <div className="bg-surface-secondary border border-default rounded-xl px-3 py-2 flex items-center gap-2 text-muted text-sm">
                  <Loader2 size={14} className="animate-spin" />
                  Đang trả lời…
                </div>
              </div>
            )}

            {error && (
              <div className="text-xs text-red-400 bg-red-900/10 border border-red-900/20 rounded-lg px-3 py-2 break-words">
                {error}
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
                placeholder="Nhập tin nhắn… (Enter để gửi, Shift+Enter xuống dòng)"
                className="flex-1 bg-transparent text-sm text-primary resize-none outline-none max-h-[140px] py-1"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className="shrink-0 p-1.5 rounded-md bg-blue-600 hover:bg-blue-500 disabled:bg-surface-secondary disabled:text-muted text-white transition-colors"
                title="Gửi"
              >
                {loading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Send size={16} />
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

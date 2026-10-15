import { createContext } from "react";
import type { AppLanguage } from "../i18n/config";
import type { AutocompleteKeywordCase } from "../utils/autocomplete";

export type { AppLanguage };
export type CopyFormat = "csv" | "json" | "sql-insert";
export type AiProvider =
  | "openai"
  | "anthropic"
  | "openrouter"
  | "ollama"
  | "custom-openai"
  | "minimax"
  | "nine-router";
export type ERDiagramLayout = "LR" | "TB";

export interface PluginConfig {
  interpreter?: string;
  settings?: Record<string, unknown>;
}

export interface Settings {
  resultPageSize: number; // Changed from queryLimit to match backend config
  language: AppLanguage;
  /** IANA timezone name (e.g. "Asia/Tokyo") for rendering timestamps, or "auto" to follow the OS timezone. */
  displayTimezone?: string;
  fontFamily: string;
  fontSize: number;
  /** Colorize query result cell values by their data type. Default: false. */
  resultColorByType?: boolean;
  /** Per-type hex color overrides for result cell values (keys: number, string, date, boolean). */
  resultTypeColors?: Record<string, string>;
  aiEnabled: boolean;
  aiProvider: AiProvider | null;
  aiModel: string | null;
  aiCustomModels?: Record<string, string[]>;
  aiOllamaPort?: number;
  aiCustomOpenaiUrl?: string;
  aiCustomOpenaiModel?: string;
  aiNineRouterUrl?: string;
  aiNineRouterModel?: string;
  autoCheckUpdatesOnStartup?: boolean;
  loggingEnabled?: boolean;
  maxLogEntries?: number;
  erDiagramDefaultLayout?: ERDiagramLayout;
  copyFormat?: CopyFormat;
  csvDelimiter?: string;
  /** Whether copied CSV output includes a header row. Default: true. */
  csvIncludeHeaders?: boolean;
  activeExternalDrivers?: string[];
  plugins?: Record<string, PluginConfig>;
  editorTheme?: string;
  editorFontFamily?: string;
  editorFontSize?: number;
  editorLineHeight?: number;
  editorTabSize?: number;
  editorWordWrap?: boolean;
  /** Highlight invisible Unicode and look-alike characters in SQL. Default: true. */
  editorHighlightInvisibleCharacters?: boolean;
  editorShowLineNumbers?: boolean;
  editorAcceptSuggestionOnEnter?: boolean;
  /** Case of SQL keywords inserted by autocomplete. Default: "upper". */
  autocompleteKeywordCase?: AutocompleteKeywordCase;
  pingInterval?: number;
  queryHistoryMaxEntries?: number;
  showWelcome?: boolean;
  /** Reconnect to the last active connection on startup. Default: true. */
  autoConnectLastConnection?: boolean;
  /** Maximize the window on startup. Default: false. */
  startMaximized?: boolean;
  // AI / MCP safety
  aiAuditEnabled?: boolean;
  aiAuditMaxEntries?: number;
  aiSessionGapMinutes?: number;
  mcpReadonlyDefault?: boolean;
  mcpReadonlyConnections?: string[];
  mcpApprovalMode?: "off" | "writes_only" | "all";
  mcpApprovalTimeoutSeconds?: number;
  mcpPreflightExplain?: boolean;
  mcpApprovalAlwaysOnTop?: boolean;
  mcpApprovalNotifySound?: boolean;
}

export interface SettingsContextType {
  settings: Settings;
  updateSetting: <K extends keyof Settings>(
    key: K,
    value: Settings[K],
  ) => Promise<void>;
  isLoading: boolean;
  isLanguageReady: boolean;
  isLanguageSettled: boolean;
}

export const SettingsContext = createContext<SettingsContextType | undefined>(
  undefined,
);

export const DEFAULT_SETTINGS: Settings = {
  resultPageSize: 500,
  language: "auto",
  displayTimezone: "auto",
  fontFamily: "System",
  fontSize: 14,
  resultColorByType: false,
  resultTypeColors: {},
  aiEnabled: false,
  aiProvider: null,
  aiModel: null,
  aiCustomModels: undefined,
  aiOllamaPort: 11434,
  aiCustomOpenaiUrl: "",
  aiCustomOpenaiModel: "",
  aiNineRouterUrl: "http://localhost:20128/v1",
  aiNineRouterModel: "",
  loggingEnabled: true,
  maxLogEntries: 1000,
  copyFormat: "csv",
  csvDelimiter: ",",
  csvIncludeHeaders: true,
  erDiagramDefaultLayout: "LR",
  editorFontFamily: "JetBrains Mono",
  editorFontSize: 14,
  editorLineHeight: 1.5,
  editorTabSize: 2,
  editorWordWrap: true,
  editorHighlightInvisibleCharacters: true,
  editorShowLineNumbers: true,
  editorAcceptSuggestionOnEnter: true,
  autocompleteKeywordCase: "upper",
  pingInterval: 30,
  queryHistoryMaxEntries: 500,
  autoConnectLastConnection: true,
  startMaximized: false,
  aiAuditEnabled: true,
  aiAuditMaxEntries: 5000,
  aiSessionGapMinutes: 10,
  mcpReadonlyDefault: false,
  mcpReadonlyConnections: [],
  mcpApprovalMode: "writes_only",
  mcpApprovalTimeoutSeconds: 120,
  mcpPreflightExplain: true,
  mcpApprovalAlwaysOnTop: true,
  mcpApprovalNotifySound: true,
};

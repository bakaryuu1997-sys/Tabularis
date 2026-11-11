import { createContext } from "react";
import type { AppLanguage } from "../i18n/config";
import type { AutocompleteKeywordCase } from "../utils/autocomplete";
import type { MaskingProfile } from "../utils/dataMasking";

export type { AppLanguage, MaskingProfile };
export type CopyFormat = "csv" | "json" | "sql-insert" | "markdown" | "typescript";
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

/** CSV export file format presets; see `export/format.rs` for what each one writes. */
export type CsvEncodingPreset = "utf8" | "utf8-bom" | "shift_jis";

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
  /** File format of CSV exports: plain UTF-8 (default), UTF-8 with BOM for Excel, or Shift_JIS for older Japanese systems. */
  csvEncodingPreset?: CsvEncodingPreset;
  /** Zoom factor applied while presentation mode is on: 1.25, 1.5 or 1.75. Default: 1.25. */
  presentationZoom?: number;
  /** Whether copied CSV output includes a header row. Default: true. */
  csvIncludeHeaders?: boolean;
  /** PII Data Masking Profile: "smart" (partial mask), "full" (all bullets), "redacted" ([REDACTED]). Default: "smart". */
  maskingProfile?: MaskingProfile;
  /** Extra column names (or fragments) to treat as sensitive, separated by commas or new lines. Default: none. */
  maskingExtraColumns?: string;
  /** Whether to show subtle numeric distribution data bars in DataGrid cells. Default: true. */
  showCellDataBars?: boolean;
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
  resultColorByType: true,
  resultTypeColors: {},
  maskingProfile: "smart",
  maskingExtraColumns: "",
  showCellDataBars: true,
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
  csvEncodingPreset: "utf8",
  presentationZoom: 1.25,
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

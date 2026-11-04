import * as monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";

/**
 * Bundles Monaco with the app instead of letting @monaco-editor/loader fetch it from
 * cdn.jsdelivr.net at runtime. Loading remote code into a webview that can call Tauri
 * commands is a supply-chain risk, and it also breaks the editor when offline.
 *
 * Only the generic editor worker and the JSON worker are shipped; every other language
 * (SQL, Markdown, ...) uses the editor worker for its basic features.
 */
self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string): Worker {
    return label === "json" ? new JsonWorker() : new EditorWorker();
  },
};

loader.config({ monaco });

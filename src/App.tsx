import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { MainLayout } from "./components/layout/MainLayout";
import { ConnectionLayoutProvider } from "./contexts/ConnectionLayoutProvider";
import { KeybindingsProvider } from "./contexts/KeybindingsProvider";
import { PluginSlotProvider } from "./contexts/PluginSlotProvider";
import { PluginModalProvider } from "./contexts/PluginModalProvider";
import { AlertProvider } from "./contexts/AlertProvider";
import { Connections } from "./pages/Connections";
import { Editor } from "./pages/Editor";
import { McpPage } from "./pages/McpPage";
import { Settings } from "./pages/Settings";

// Secondary windows (schema diagram, visual explain, JSON viewer, task manager,
// detached results) are not on the startup path. Lazy-loading them keeps their
// heavy dependencies (xyflow/dagre, json-edit-react) out of the initial bundle
// so the main window opens faster; each loads on demand when its route opens.
const SchemaDiagramPage = lazy(() =>
  import("./pages/SchemaDiagramPage").then((m) => ({ default: m.SchemaDiagramPage })),
);
const TaskManagerPage = lazy(() =>
  import("./pages/TaskManagerPage").then((m) => ({ default: m.TaskManagerPage })),
);
const VisualExplainPage = lazy(() =>
  import("./pages/VisualExplainPage").then((m) => ({ default: m.VisualExplainPage })),
);
const JsonViewerPage = lazy(() =>
  import("./pages/JsonViewerPage").then((m) => ({ default: m.JsonViewerPage })),
);
const ResultsWindowPage = lazy(() =>
  import("./pages/ResultsWindowPage").then((m) => ({ default: m.ResultsWindowPage })),
);
import { ConnectionHealthMonitor } from "./components/ConnectionHealthMonitor";
import { EditorErrorBoundary } from "./components/ui/EditorErrorBoundary";
import { AiApprovalGate } from "./components/modals/AiApprovalGate";
import { SshAskpassGate } from "./components/modals/SshAskpassGate";
import { useResultTypeColors } from "./hooks/useResultTypeColors";

export function App() {
  useResultTypeColors();
  const [isDebugMode, setIsDebugMode] = useState(false);

  useEffect(() => {
    invoke<boolean>("is_debug_mode").then((debugMode) => {
      setIsDebugMode(debugMode);
    });
  }, []);

  useEffect(() => {
    if (isDebugMode) return;

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    document.addEventListener("contextmenu", handleContextMenu);

    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [isDebugMode]);

  return (
    <>
      <AlertProvider>
        <BrowserRouter>
          <ConnectionHealthMonitor />
          <KeybindingsProvider>
            <PluginSlotProvider>
              <PluginModalProvider>
                <ConnectionLayoutProvider>
                  <Suspense fallback={<div className="w-full h-full bg-base" />}>
                  <Routes>
                    <Route path="/" element={<MainLayout />}>
                      <Route
                        index
                        element={<Navigate to="/connections" replace />}
                      />
                      <Route path="connections" element={<Connections />} />
                      <Route
                        path="editor"
                        element={
                          <EditorErrorBoundary>
                            <Editor />
                          </EditorErrorBoundary>
                        }
                      />
                      <Route path="mcp" element={<McpPage />} />
                      <Route path="settings" element={<Settings />} />
                    </Route>
                    <Route
                      path="/schema-diagram"
                      element={<SchemaDiagramPage />}
                    />
                    <Route path="/task-manager" element={<TaskManagerPage />} />
                    <Route path="/visual-explain" element={<VisualExplainPage />} />
                    <Route path="/json-viewer" element={<JsonViewerPage />} />
                    <Route
                      path="/results-window"
                      element={<ResultsWindowPage />}
                    />
                  </Routes>
                  </Suspense>
                </ConnectionLayoutProvider>
              </PluginModalProvider>
            </PluginSlotProvider>
          </KeybindingsProvider>
        </BrowserRouter>
      </AlertProvider>

      {/* Auto-update, community and what's-new prompts removed in this build. */}

      <AiApprovalGate />
      <SshAskpassGate />
    </>
  );
}

import { useCallback, useState, type RefObject } from "react";
import type { Tab } from "../types/editor";
import { renameNotebook } from "../utils/notebookStore";

export interface UseTabRenameOptions {
  /** Always holds the latest tabs, so the callbacks stay stable. */
  tabsRef: RefObject<Tab[]>;
  updateTab: (tabId: string, patch: Partial<Tab>) => void;
}

/**
 * Inline renaming of a tab title. Renaming a notebook tab is also persisted to the notebook file,
 * which covers background tabs whose NotebookView is not mounted to sync the title itself.
 */
export function useTabRename({ tabsRef, updateTab }: UseTabRenameOptions) {
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabTitle, setEditingTabTitle] = useState("");

  const startTabRename = useCallback(
    (tabId: string) => {
      const tab = tabsRef.current.find((t) => t.id === tabId);
      if (!tab) return;
      setEditingTabId(tabId);
      setEditingTabTitle(tab.title);
    },
    [tabsRef],
  );

  const cancelTabRename = useCallback(() => setEditingTabId(null), []);

  const commitTabRename = useCallback(() => {
    const tabId = editingTabId;
    if (!tabId) return;
    setEditingTabId(null);
    const title = editingTabTitle.trim();
    const tab = tabsRef.current.find((t) => t.id === tabId);
    if (!tab || !title || title === tab.title) return;
    updateTab(tabId, { title });
    if (tab.type === "notebook" && tab.notebookId && tab.connectionId) {
      renameNotebook(tab.notebookId, tab.connectionId, title).catch((e) =>
        console.error("Failed to rename notebook:", e),
      );
    }
  }, [editingTabId, editingTabTitle, tabsRef, updateTab]);

  return {
    editingTabId,
    editingTabTitle,
    setEditingTabTitle,
    startTabRename,
    cancelTabRename,
    commitTabRename,
  };
}

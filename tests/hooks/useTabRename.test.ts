import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTabRename } from "../../src/hooks/useTabRename";
import { renameNotebook } from "../../src/utils/notebookStore";
import type { Tab } from "../../src/types/editor";

vi.mock("../../src/utils/notebookStore", () => ({ renameNotebook: vi.fn() }));

const tab = (overrides: Partial<Tab> = {}): Tab =>
  ({ id: "t1", title: "Old name", type: "console", connectionId: "c1", ...overrides }) as Tab;

function setup(tabs: Tab[]) {
  const updateTab = vi.fn();
  const tabsRef = { current: tabs };
  const hook = renderHook(() => useTabRename({ tabsRef, updateTab }));
  return { updateTab, ...hook };
}

describe("useTabRename", () => {
  beforeEach(() => {
    vi.mocked(renameNotebook).mockReset();
    vi.mocked(renameNotebook).mockResolvedValue(undefined as never);
  });

  it("starts editing with the current title", () => {
    const { result } = setup([tab()]);
    act(() => result.current.startTabRename("t1"));
    expect(result.current.editingTabId).toBe("t1");
    expect(result.current.editingTabTitle).toBe("Old name");
  });

  it("ignores an unknown tab", () => {
    const { result } = setup([tab()]);
    act(() => result.current.startTabRename("missing"));
    expect(result.current.editingTabId).toBeNull();
  });

  it("saves a trimmed new title and leaves edit mode", () => {
    const { result, updateTab } = setup([tab()]);
    act(() => result.current.startTabRename("t1"));
    act(() => result.current.setEditingTabTitle("  New name  "));
    act(() => result.current.commitTabRename());
    expect(updateTab).toHaveBeenCalledWith("t1", { title: "New name" });
    expect(result.current.editingTabId).toBeNull();
    expect(renameNotebook).not.toHaveBeenCalled();
  });

  it("does not update when the title is empty or unchanged", () => {
    const { result, updateTab } = setup([tab()]);
    act(() => result.current.startTabRename("t1"));
    act(() => result.current.setEditingTabTitle("   "));
    act(() => result.current.commitTabRename());
    act(() => result.current.startTabRename("t1"));
    act(() => result.current.commitTabRename());
    expect(updateTab).not.toHaveBeenCalled();
  });

  it("cancels without saving", () => {
    const { result, updateTab } = setup([tab()]);
    act(() => result.current.startTabRename("t1"));
    act(() => result.current.setEditingTabTitle("Other"));
    act(() => result.current.cancelTabRename());
    act(() => result.current.commitTabRename());
    expect(updateTab).not.toHaveBeenCalled();
    expect(result.current.editingTabId).toBeNull();
  });

  it("also persists the new name of a notebook tab", () => {
    const { result } = setup([tab({ type: "notebook", notebookId: "nb1" })]);
    act(() => result.current.startTabRename("t1"));
    act(() => result.current.setEditingTabTitle("Analysis"));
    act(() => result.current.commitTabRename());
    expect(renameNotebook).toHaveBeenCalledWith("nb1", "c1", "Analysis");
  });

  it("survives a failing notebook rename", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(renameNotebook).mockRejectedValue(new Error("read-only file"));
    const { result } = setup([tab({ type: "notebook", notebookId: "nb1" })]);
    act(() => result.current.startTabRename("t1"));
    act(() => result.current.setEditingTabTitle("Analysis"));
    act(() => result.current.commitTabRename());
    await Promise.resolve();
    await Promise.resolve();
    expect(error).toHaveBeenCalledWith("Failed to rename notebook:", expect.any(Error));
    error.mockRestore();
  });
});

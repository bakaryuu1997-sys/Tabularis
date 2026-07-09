import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SplitResultsPane } from "../../../src/components/ui/SplitResultsPane";
import type { Tab } from "../../../src/types/editor";

// Stub the heavy result renderer so the test stays fast and grid-free.
vi.mock("../../../src/components/ui/ResultEntryContent", () => ({
  ResultEntryContent: ({ onPageChange }: { onPageChange: (p: number) => void }) => (
    <button data-testid="entry" onClick={() => onPageChange(2)}>
      entry
    </button>
  ),
}));

// Stub the editable grid so the editable-mode test stays lightweight.
vi.mock("../../../src/components/ui/DataGrid", () => ({
  DataGrid: ({ readonly }: { readonly?: boolean }) => (
    <div data-testid="edit-grid" data-readonly={String(!!readonly)} />
  ),
}));

const baseTab = (overrides: Partial<Tab> = {}): Tab => ({
  id: "t1",
  title: "students",
  type: "table",
  query: "SELECT * FROM students",
  result: null,
  error: "",
  executionTime: null,
  page: 1,
  activeTable: "students",
  pkColumns: null,
  connectionId: "c1",
  ...overrides,
});

const defaultProps = {
  connectionId: "c1",
  copyFormat: "csv" as const,
  csvDelimiter: ",",
  csvIncludeHeaders: true,
  onPageChange: vi.fn(),
  onClose: vi.fn(),
  onFocusTab: vi.fn(),
  onSwap: vi.fn(),
};

describe("SplitResultsPane", () => {
  it("shows the pinned tab title and an empty prompt when there is no result", () => {
    render(<SplitResultsPane {...defaultProps} tab={baseTab()} />);
    expect(screen.getByText("students")).toBeInTheDocument();
    expect(screen.getByText("editor.split.empty")).toBeInTheDocument();
    expect(screen.queryByTestId("entry")).not.toBeInTheDocument();
  });

  it("renders the result entry when the tab has a result", () => {
    const tab = baseTab({
      result: {
        columns: ["id"],
        rows: [[1]],
        pagination: { page: 1, page_size: 100, total_rows: 1 },
      } as unknown as Tab["result"],
    });
    render(<SplitResultsPane {...defaultProps} tab={tab} />);
    expect(screen.getByTestId("entry")).toBeInTheDocument();
  });

  it("forwards page changes", () => {
    const onPageChange = vi.fn();
    const tab = baseTab({
      result: {
        columns: ["id"],
        rows: [[1]],
        pagination: { page: 1, page_size: 100, total_rows: 1 },
      } as unknown as Tab["result"],
    });
    render(
      <SplitResultsPane {...defaultProps} tab={tab} onPageChange={onPageChange} />,
    );
    fireEvent.click(screen.getByTestId("entry"));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("invokes onClose and onFocusTab from the header", () => {
    const onClose = vi.fn();
    const onFocusTab = vi.fn();
    render(
      <SplitResultsPane
        {...defaultProps}
        tab={baseTab()}
        onClose={onClose}
        onFocusTab={onFocusTab}
      />,
    );
    fireEvent.click(screen.getByText("students"));
    expect(onFocusTab).toHaveBeenCalled();
    fireEvent.click(screen.getByTitle("editor.split.close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("invokes onSwap from the swap button", () => {
    const onSwap = vi.fn();
    render(
      <SplitResultsPane {...defaultProps} tab={baseTab()} onSwap={onSwap} />,
    );
    fireEvent.click(screen.getByTitle("editor.split.swap"));
    expect(onSwap).toHaveBeenCalled();
  });

  it("renders an editable grid when editGridProps is provided", () => {
    const tab = baseTab({
      result: {
        columns: ["id"],
        rows: [[1]],
        pagination: { page: 1, page_size: 100, total_rows: 1, has_more: false },
      } as unknown as Tab["result"],
    });
    render(
      <SplitResultsPane
        {...defaultProps}
        tab={tab}
        editGridProps={{ readonly: false } as never}
      />,
    );
    const grid = screen.getByTestId("edit-grid");
    expect(grid).toBeInTheDocument();
    expect(grid.getAttribute("data-readonly")).toBe("false");
    // The read-only entry renderer must not be used in editable mode.
    expect(screen.queryByTestId("entry")).not.toBeInTheDocument();
  });

  it("shows an unsaved badge when the pinned tab has pending changes", () => {
    const tab = baseTab({
      result: {
        columns: ["id"],
        rows: [[1]],
        pagination: { page: 1, page_size: 100, total_rows: 1, has_more: false },
      } as unknown as Tab["result"],
      pendingChanges: {
        "1": { pkOriginalValue: 1, changes: { name: "x" } },
      },
    });
    render(
      <SplitResultsPane
        {...defaultProps}
        tab={tab}
        editGridProps={{ readonly: false } as never}
      />,
    );
    expect(screen.getByText("editor.split.unsaved")).toBeInTheDocument();
  });

  it("saves pending changes in place via onSave", () => {
    const onSave = vi.fn();
    const tab = baseTab({
      result: {
        columns: ["id"],
        rows: [[1]],
        pagination: { page: 1, page_size: 100, total_rows: 1, has_more: false },
      } as unknown as Tab["result"],
      pendingChanges: {
        "1": { pkOriginalValue: 1, changes: { name: "x" } },
      },
    });
    render(
      <SplitResultsPane
        {...defaultProps}
        tab={tab}
        editGridProps={{ readonly: false } as never}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByTitle("editor.split.save"));
    expect(onSave).toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  EditorToolbar,
  type EditorToolbarProps,
} from "../../../src/components/editor/EditorToolbar";
import type { Tab } from "../../../src/types/editor";

describe("EditorToolbar", () => {
  const baseTab: Tab = {
    id: "tab-1",
    type: "console",
    title: "Console 1",
    query: "SELECT * FROM users",
    isLoading: false,
    readOnly: false,
  };

  const defaultProps: EditorToolbarProps = {
    isNotebookTab: false,
    isTableTab: false,
    activeTab: baseTab,
    activeConnectionId: "conn-1",
    isMac: false,
    stopQuery: vi.fn(),
    onRun: vi.fn(),
    onRunDropdownToggle: vi.fn(),
    isRunDropdownOpen: false,
    onCloseRunDropdown: vi.fn(),
    dropdownQueries: [],
    onRunQuery: vi.fn(),
    onSaveQuery: vi.fn(),
    onEditParams: vi.fn(),
    exportMenuOpen: false,
    onToggleExportMenu: vi.fn(),
    onCloseExportMenu: vi.fn(),
    onExportExcel: vi.fn(),
    onExportCSV: vi.fn(),
    onExportJSON: vi.fn(),
    isMultiDb: false,
    selectedDatabases: ["test_db"],
    onSelectDatabase: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders null when isNotebookTab is true", () => {
    const { container } = render(
      <EditorToolbar {...defaultProps} isNotebookTab={true} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders Run button when query is not loading and not read-only", () => {
    render(<EditorToolbar {...defaultProps} />);

    const runBtn = screen.getByRole("button", { name: /editor\.run/i });
    expect(runBtn).toBeInTheDocument();
    expect(runBtn).not.toBeDisabled();

    fireEvent.click(runBtn);
    expect(defaultProps.onRun).toHaveBeenCalledTimes(1);
  });

  it("disables Run button when there is no active connection", () => {
    render(<EditorToolbar {...defaultProps} activeConnectionId={null} />);

    const runBtn = screen.getByRole("button", { name: /editor\.run/i });
    expect(runBtn).toBeDisabled();
  });

  it("renders Stop button when tab is loading and not read-only", () => {
    const loadingTab: Tab = { ...baseTab, isLoading: true };
    render(<EditorToolbar {...defaultProps} activeTab={loadingTab} />);

    const stopBtn = screen.getByRole("button", { name: /editor\.stop/i });
    expect(stopBtn).toBeInTheDocument();

    fireEvent.click(stopBtn);
    expect(defaultProps.stopQuery).toHaveBeenCalledTimes(1);
  });

  it("toggles run dropdown when dropdown arrow is clicked", () => {
    render(<EditorToolbar {...defaultProps} />);

    const chevronButtons = screen.getAllByRole("button");
    const dropdownToggle = chevronButtons.find((btn) =>
      btn.className.includes("rounded-r"),
    );
    expect(dropdownToggle).toBeDefined();

    if (dropdownToggle) {
      fireEvent.click(dropdownToggle);
      expect(defaultProps.onRunDropdownToggle).toHaveBeenCalledTimes(1);
    }
  });

  it("renders queries in run dropdown and triggers execution on query click", () => {
    const queries = ["SELECT 1", "SELECT 2"];
    render(
      <EditorToolbar
        {...defaultProps}
        isRunDropdownOpen={true}
        dropdownQueries={queries}
      />,
    );

    const queryBtn = screen.getByText("SELECT 1");
    fireEvent.click(queryBtn);

    expect(defaultProps.onRunQuery).toHaveBeenCalledWith("SELECT 1", 1);
    expect(defaultProps.onCloseRunDropdown).toHaveBeenCalledTimes(1);
  });

  it("triggers save query on save button click in dropdown", () => {
    const queries = ["SELECT 42"];
    render(
      <EditorToolbar
        {...defaultProps}
        isRunDropdownOpen={true}
        dropdownQueries={queries}
      />,
    );

    const saveBtn = screen.getByTitle("editor.saveThisQuery");
    fireEvent.click(saveBtn);

    expect(defaultProps.onSaveQuery).toHaveBeenCalledWith("SELECT 42");
    expect(defaultProps.onCloseRunDropdown).toHaveBeenCalledTimes(1);
  });

  it("disables parameters button when query has no parameters", () => {
    render(<EditorToolbar {...defaultProps} />);

    const paramsBtn = screen.getByTitle("editor.queryParameters");
    expect(paramsBtn).toBeDisabled();
  });

  it("enables parameters button when query has parameters and triggers click", () => {
    const paramTab: Tab = {
      ...baseTab,
      query: "SELECT * FROM users WHERE id = :id",
    };
    render(<EditorToolbar {...defaultProps} activeTab={paramTab} />);

    const paramsBtn = screen.getByTitle("editor.queryParameters");
    expect(paramsBtn).not.toBeDisabled();

    fireEvent.click(paramsBtn);
    expect(defaultProps.onEditParams).toHaveBeenCalledTimes(1);
  });

  it("disables export button when result has no rows", () => {
    render(<EditorToolbar {...defaultProps} />);

    const exportBtn = screen.getByRole("button", { name: /editor\.export/i });
    expect(exportBtn).toBeDisabled();
  });

  it("enables export button and handles dropdown choices when result has rows", () => {
    const resultTab: Tab = {
      ...baseTab,
      result: {
        rows: [{ id: 1 }],
        columns: ["id"],
        execution_time_ms: 10,
      },
    };

    const { rerender } = render(
      <EditorToolbar {...defaultProps} activeTab={resultTab} exportMenuOpen={false} />,
    );

    const exportBtn = screen.getByRole("button", { name: /editor\.export/i });
    expect(exportBtn).not.toBeDisabled();

    fireEvent.click(exportBtn);
    expect(defaultProps.onToggleExportMenu).toHaveBeenCalledTimes(1);

    // Open export menu
    rerender(
      <EditorToolbar {...defaultProps} activeTab={resultTab} exportMenuOpen={true} />,
    );

    const excelBtn = screen.getByRole("menuitem", { name: /Excel/i });
    const csvBtn = screen.getByRole("menuitem", { name: /CSV/i });
    const jsonBtn = screen.getByRole("menuitem", { name: /JSON/i });

    fireEvent.click(excelBtn);
    expect(defaultProps.onExportExcel).toHaveBeenCalledTimes(1);

    fireEvent.click(csvBtn);
    expect(defaultProps.onExportCSV).toHaveBeenCalledTimes(1);

    fireEvent.click(jsonBtn);
    expect(defaultProps.onExportJSON).toHaveBeenCalledTimes(1);
  });

  it("renders multi-database dropdown and switches active database", () => {
    render(
      <EditorToolbar
        {...defaultProps}
        isMultiDb={true}
        selectedDatabases={["db_prod", "db_dev"]}
      />,
    );

    const dbBtn = screen.getByTitle("editor.activeDatabase");
    expect(dbBtn).toHaveTextContent("db_prod");

    // Click to open dropdown
    fireEvent.click(dbBtn);

    const devOption = screen.getByRole("button", { name: "db_dev" });
    fireEvent.click(devOption);

    expect(defaultProps.onSelectDatabase).toHaveBeenCalledWith("db_dev");
  });

  it("displays connected and disconnected status correctly", () => {
    const { rerender } = render(
      <EditorToolbar {...defaultProps} activeConnectionId="conn-123" />,
    );
    expect(screen.getByText("editor.connected")).toBeInTheDocument();

    rerender(
      <EditorToolbar {...defaultProps} activeConnectionId={null} />,
    );
    expect(screen.getByText("editor.disconnected")).toBeInTheDocument();
  });
});

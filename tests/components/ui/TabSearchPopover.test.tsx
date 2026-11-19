import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TabSearchPopover } from "../../../src/components/ui/TabSearchPopover";
import type { Tab } from "../../../src/types/editor";

const mockTab = (id: string, title: string, type: Tab["type"] = "table"): Tab => ({
  id,
  title,
  type,
  query: `SELECT * FROM ${title}`,
  result: null,
  error: "",
  executionTime: null,
  page: 1,
  activeTable: title,
  pkColumns: null,
  connectionId: "conn1",
});

describe("TabSearchPopover", () => {
  const leftTabs = [
    mockTab("1", "users", "table"),
    mockTab("2", "Console 1", "console"),
  ];
  const rightTabs = [
    mockTab("3", "orders", "table"),
  ];

  it("renders trigger button and opens popover on click", () => {
    render(
      <TabSearchPopover
        leftTabs={leftTabs}
        activeLeftTabId="1"
        onSelectLeftTab={vi.fn()}
        onCloseLeftTab={vi.fn()}
      />,
    );

    const button = screen.getByRole("button", { name: /Search and list all tabs|editor\.allTabs\.tooltip/i });
    expect(button).toBeInTheDocument();

    // Not open yet
    expect(screen.queryByPlaceholderText(/Search tabs\.\.\.|editor\.allTabs\.searchPlaceholder/i)).not.toBeInTheDocument();

    // Click to open
    fireEvent.click(button);
    expect(screen.getByPlaceholderText(/Search tabs\.\.\.|editor\.allTabs\.searchPlaceholder/i)).toBeInTheDocument();
    expect(screen.getByText("users")).toBeInTheDocument();
    expect(screen.getByText("Console 1")).toBeInTheDocument();
  });

  it("filters tabs by search query", () => {
    render(
      <TabSearchPopover
        leftTabs={leftTabs}
        activeLeftTabId="1"
        onSelectLeftTab={vi.fn()}
        onCloseLeftTab={vi.fn()}
        rightTabs={rightTabs}
        activeRightTabId="3"
        onSelectRightTab={vi.fn()}
        onCloseRightTab={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Search and list all tabs|editor\.allTabs\.tooltip/i }));

    const searchInput = screen.getByPlaceholderText(/Search tabs\.\.\.|editor\.allTabs\.searchPlaceholder/i);
    fireEvent.change(searchInput, { target: { value: "order" } });

    expect(screen.queryByText("users")).not.toBeInTheDocument();
    expect(screen.queryByText("Console 1")).not.toBeInTheDocument();
    expect(screen.getByText("orders")).toBeInTheDocument();
  });

  it("calls onSelectLeftTab and closes when a left tab is clicked", () => {
    const onSelectLeftTab = vi.fn();
    render(
      <TabSearchPopover
        leftTabs={leftTabs}
        activeLeftTabId="1"
        onSelectLeftTab={onSelectLeftTab}
        onCloseLeftTab={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Search and list all tabs|editor\.allTabs\.tooltip/i }));
    fireEvent.click(screen.getByText("Console 1"));

    expect(onSelectLeftTab).toHaveBeenCalledWith("2");
    expect(screen.queryByPlaceholderText(/Search tabs\.\.\.|editor\.allTabs\.searchPlaceholder/i)).not.toBeInTheDocument();
  });

  it("calls onCloseLeftTab when X button is clicked", () => {
    const onCloseLeftTab = vi.fn();
    render(
      <TabSearchPopover
        leftTabs={leftTabs}
        activeLeftTabId="1"
        onSelectLeftTab={vi.fn()}
        onCloseLeftTab={onCloseLeftTab}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Search and list all tabs|editor\.allTabs\.tooltip/i }));
    const closeButtons = screen.getAllByTitle(/Close tab|editor\.closeTab/i);
    fireEvent.click(closeButtons[0]);

    expect(onCloseLeftTab).toHaveBeenCalledWith("1");
  });

  it("closes when Escape key is pressed", () => {
    render(
      <TabSearchPopover
        leftTabs={leftTabs}
        activeLeftTabId="1"
        onSelectLeftTab={vi.fn()}
        onCloseLeftTab={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Search and list all tabs|editor\.allTabs\.tooltip/i }));
    expect(screen.getByPlaceholderText(/Search tabs\.\.\.|editor\.allTabs\.searchPlaceholder/i)).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByPlaceholderText(/Search tabs\.\.\.|editor\.allTabs\.searchPlaceholder/i)).not.toBeInTheDocument();
  });
});

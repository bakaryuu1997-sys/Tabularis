import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, createEvent } from "@testing-library/react";
import { SplitResultsPane } from "../../../src/components/ui/SplitResultsPane";
import { tabDrag } from "../../../src/utils/tabDnd";
import type { Tab } from "../../../src/types/editor";

vi.mock("../../../src/components/ui/ResultEntryContent", () => ({ ResultEntryContent: () => <div /> }));
vi.mock("../../../src/components/ui/DataGrid", () => ({ DataGrid: () => <div /> }));

const tab = (id: string): Tab =>
  ({
    id,
    title: id,
    type: "table",
    query: `SELECT * FROM ${id}`,
    result: null,
    error: "",
    executionTime: null,
    page: 1,
    activeTable: id,
    pkColumns: null,
    connectionId: "c1",
  }) as Tab;

const pinned = ["orders", "products", "customers"].map(tab);

function renderPane(onDropTab = vi.fn()) {
  const utils = render(
    <SplitResultsPane
      tab={pinned[2]}
      pinnedTabs={pinned}
      activeSplitTabId="customers"
      connectionId="c1"
      copyFormat="csv"
      csvDelimiter=","
      csvIncludeHeaders
      onPageChange={vi.fn()}
      onClose={vi.fn()}
      onFocusTab={vi.fn()}
      onSwap={vi.fn()}
      onDropTab={onDropTab}
    />,
  );
  return { ...utils, onDropTab };
}

/** jsdom has no layout, so give the target a fixed box and fire the event at a chosen X. */
function dropAt(element: HTMLElement, clientX: number, type: "dragOver" | "drop") {
  element.getBoundingClientRect = () => ({ left: 0, width: 100, top: 0, height: 20, right: 100, bottom: 20, x: 0, y: 0, toJSON: () => ({}) });
  const event = createEvent[type](element, { dataTransfer: { dropEffect: "", effectAllowed: "", setData: vi.fn() } });
  // jsdom has no DragEvent, so the pointer position has to be attached by hand.
  Object.defineProperty(event, "clientX", { value: clientX });
  fireEvent(element, event);
}

const chip = (name: string) => screen.getByText(name).closest("div[draggable]") as HTMLElement;

describe("SplitResultsPane drag and drop", () => {
  beforeEach(() => tabDrag.clear());

  it("makes the pinned chips draggable", () => {
    renderPane();
    expect(chip("orders")).toHaveAttribute("draggable", "true");
  });

  it("starts a right-origin drag from a chip and clears it at the end", () => {
    renderPane();
    fireEvent.dragStart(chip("products"), { dataTransfer: { setData: vi.fn(), effectAllowed: "" } });
    expect(tabDrag.payload).toEqual({ tabId: "products", origin: "right" });
    fireEvent.dragEnd(chip("products"));
    expect(tabDrag.payload).toBeNull();
  });

  it("reorders when a pinned chip is dropped on another chip, before or after depending on the pointer", () => {
    const { onDropTab } = renderPane();
    tabDrag.start({ tabId: "customers", origin: "right" });
    dropAt(chip("orders"), 10, "drop");
    expect(onDropTab).toHaveBeenLastCalledWith({ kind: "reorder-right", draggedId: "customers", targetId: "orders", position: "before" });

    tabDrag.start({ tabId: "customers", origin: "right" });
    dropAt(chip("orders"), 90, "drop");
    expect(onDropTab).toHaveBeenLastCalledWith({ kind: "reorder-right", draggedId: "customers", targetId: "orders", position: "after" });
  });

  it("pins a tab dragged from the left strip when it is dropped on a chip", () => {
    const { onDropTab } = renderPane();
    tabDrag.start({ tabId: "reviews", origin: "left" });
    dropAt(chip("products"), 90, "drop");
    expect(onDropTab).toHaveBeenCalledWith({ kind: "pin-from-left", draggedId: "reviews", targetId: "products", position: "after" });
  });

  it("pins at the end when a left tab is dropped on the pane body", () => {
    const { container, onDropTab } = renderPane();
    tabDrag.start({ tabId: "reviews", origin: "left" });
    fireEvent.drop(container.firstElementChild as HTMLElement, { dataTransfer: {} });
    expect(onDropTab).toHaveBeenCalledWith({ kind: "pin-from-left", draggedId: "reviews", targetId: null, position: "after" });
  });

  it("shows a drop marker while a tab hovers a chip and removes it on leave", () => {
    const { container } = renderPane();
    tabDrag.start({ tabId: "customers", origin: "right" });
    dropAt(chip("orders"), 10, "dragOver");
    expect(container.querySelector(".bg-blue-400")).not.toBeNull();
    fireEvent.dragLeave(chip("orders"));
    expect(container.querySelector(".bg-blue-400")).toBeNull();
  });

  it("ignores drops that are not tab drags", () => {
    const { container, onDropTab } = renderPane();
    fireEvent.drop(container.firstElementChild as HTMLElement, { dataTransfer: {} });
    expect(onDropTab).not.toHaveBeenCalled();
  });

  it("is not draggable or droppable when no drop handler is provided", () => {
    render(
      <SplitResultsPane
        tab={pinned[2]}
        pinnedTabs={pinned}
        activeSplitTabId="customers"
        connectionId="c1"
        copyFormat="csv"
        csvDelimiter=","
        csvIncludeHeaders
        onPageChange={vi.fn()}
        onClose={vi.fn()}
        onFocusTab={vi.fn()}
        onSwap={vi.fn()}
      />,
    );
    expect(chip("orders")).toHaveAttribute("draggable", "false");
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ColumnQuickStatsPopover } from "../../../src/components/ui/ColumnQuickStatsPopover";
import type { ColumnProfileResult } from "../../../src/utils/columnProfiler";

describe("ColumnQuickStatsPopover", () => {
  const mockProfile: ColumnProfileResult = {
    columnName: "salary",
    inferredType: "number",
    totalRows: 100,
    nullCount: 5,
    nullPercentage: 5,
    distinctCount: 80,
    distinctPercentage: 80,
    numericStats: {
      min: 1000,
      max: 9500,
      avg: 4500,
      sum: 450000,
    },
    topFrequencies: [
      { value: "5000", count: 12, percentage: 12 },
      { value: "4000", count: 10, percentage: 10 },
      { value: "6000", count: 8, percentage: 8 },
    ],
  };

  const anchorRect = {
    top: 100,
    left: 200,
    bottom: 130,
    right: 250,
  };

  it("renders column quick stats with numeric details and distribution", () => {
    const handleClose = vi.fn();
    const handleOpenFull = vi.fn();

    render(
      <ColumnQuickStatsPopover
        isOpen={true}
        onClose={handleClose}
        anchorRect={anchorRect}
        profile={mockProfile}
        declaredType="numeric"
        onOpenFullModal={handleOpenFull}
      />
    );

    expect(screen.getByText("salary")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("80")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("1,000")).toBeInTheDocument();
    expect(screen.getByText("9,500")).toBeInTheDocument();

    const fullBtn = screen.getByText("columnProfile.viewFullReport");
    expect(fullBtn).toBeInTheDocument();
    fireEvent.click(fullBtn);

    expect(handleClose).toHaveBeenCalled();
    expect(handleOpenFull).toHaveBeenCalled();
  });

  it("closes when pressing Escape key", () => {
    const handleClose = vi.fn();

    render(
      <ColumnQuickStatsPopover
        isOpen={true}
        onClose={handleClose}
        anchorRect={anchorRect}
        profile={mockProfile}
      />
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("renders null when isOpen is false", () => {
    const { container } = render(
      <ColumnQuickStatsPopover
        isOpen={false}
        onClose={vi.fn()}
        anchorRect={anchorRect}
        profile={mockProfile}
      />
    );

    expect(container.firstChild).toBeNull();
  });
});

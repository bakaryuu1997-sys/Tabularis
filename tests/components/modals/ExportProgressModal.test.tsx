import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExportProgressModal } from "../../../src/components/modals/ExportProgressModal";

vi.mock("../../../src/components/ui/Modal", () => ({
  Modal: ({ isOpen, children }: { isOpen: boolean; children: ReactNode }) =>
    isOpen ? <div>{children}</div> : null,
}));

vi.mock("lucide-react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("lucide-react")>()),
}));

const baseProps = {
  isOpen: true,
  rowsProcessed: 1200,
  fileName: "result.csv",
  onCancel: vi.fn(),
  onClose: vi.fn(),
};

describe("ExportProgressModal", () => {
  it("shows a warning under a finished export", () => {
    render(<ExportProgressModal {...baseProps} status="completed" warningMessage="2 characters became ?" />);
    expect(screen.getByRole("alert")).toHaveTextContent("2 characters became ?");
    expect(screen.getByText("result.csv")).toBeInTheDocument();
  });

  it("shows no alert for a clean export", () => {
    render(<ExportProgressModal {...baseProps} status="completed" />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not show the warning while the export is still running or after an error", () => {
    const { rerender } = render(
      <ExportProgressModal {...baseProps} status="exporting" warningMessage="late warning" />,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    rerender(<ExportProgressModal {...baseProps} status="error" errorMessage="disk full" warningMessage="late warning" />);
    expect(screen.queryByText("late warning")).not.toBeInTheDocument();
    expect(screen.getByText("disk full")).toBeInTheDocument();
  });
});

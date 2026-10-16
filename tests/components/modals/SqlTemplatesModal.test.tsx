import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SqlTemplatesModal } from "../../../src/components/modals/SqlTemplatesModal";

describe("SqlTemplatesModal", () => {
  it("renders templates and filters by search query", () => {
    const onInsert = vi.fn();
    const onClose = vi.fn();

    render(
      <SqlTemplatesModal
        isOpen={true}
        onClose={onClose}
        onInsert={onInsert}
      />,
    );

    expect(screen.getByText(/SELECT \.\.\. FROM \.\.\. WHERE/)).toBeInTheDocument();
    expect(screen.getAllByText(/JOIN \.\.\. ON/)[0]).toBeInTheDocument();

    const searchInput = screen.getByRole("textbox");
    fireEvent.change(searchInput, { target: { value: "LIMIT" } });

    expect(screen.getByText(/Phân trang/)).toBeInTheDocument();
  });

  it("calls onInsert with sql when insert button clicked", () => {
    const onInsert = vi.fn();
    const onClose = vi.fn();

    render(
      <SqlTemplatesModal
        isOpen={true}
        onClose={onClose}
        onInsert={onInsert}
      />,
    );

    const insertBtns = screen.getAllByRole("button", { name: /Chèn vào code/ });
    fireEvent.click(insertBtns[0]);

    expect(onInsert).toHaveBeenCalledTimes(1);
    expect(onInsert).toHaveBeenCalledWith(expect.stringContaining("SELECT"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

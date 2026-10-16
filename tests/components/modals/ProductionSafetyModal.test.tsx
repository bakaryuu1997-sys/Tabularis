import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ProductionSafetyModal } from "../../../src/components/modals/ProductionSafetyModal";

describe("ProductionSafetyModal", () => {
  it("renders countdown timer and disables confirmation until 5 seconds elapse", () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    render(
      <ProductionSafetyModal
        isOpen={true}
        query="DROP TABLE users;"
        dangerReasons={["Câu lệnh DROP sẽ hủy bỏ cấu trúc bảng!"]}
        isProduction={true}
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    expect(screen.getByText(/PRODUCTION/)).toBeInTheDocument();
    expect(screen.getByText(/Câu lệnh DROP/)).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: /safety\.waiting/ });
    expect(confirmBtn).toBeDisabled();

    // Fast-forward 5 seconds
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    const activeConfirmBtn = screen.getByRole("button", { name: /safety\.confirmExecution/ });
    expect(activeConfirmBtn).not.toBeDisabled();

    fireEvent.click(activeConfirmBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("allows immediate cancellation", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    render(
      <ProductionSafetyModal
        isOpen={true}
        query="DELETE FROM users;"
        dangerReasons={["Câu lệnh DELETE không có WHERE!"]}
        isProduction={false}
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    const cancelBtn = screen.getByRole("button", { name: /common\.cancel/ });
    fireEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

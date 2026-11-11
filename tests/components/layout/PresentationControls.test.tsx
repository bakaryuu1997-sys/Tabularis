import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PresentationBanner } from "../../../src/components/layout/PresentationBanner";
import { PresentationToggle } from "../../../src/components/layout/sidebar/PresentationToggle";
import { PresentationContext } from "../../../src/contexts/PresentationContext";

vi.mock("lucide-react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("lucide-react")>()),
}));

const withState = (isPresentationMode: boolean) => {
  const toggle = vi.fn();
  const exit = vi.fn();
  const wrap = (node: React.ReactNode) => (
    <PresentationContext.Provider
      value={{ isPresentationMode, togglePresentationMode: toggle, exitPresentationMode: exit }}
    >
      {node}
    </PresentationContext.Provider>
  );
  return { toggle, exit, wrap };
};

describe("PresentationBanner", () => {
  it("renders nothing in normal mode", () => {
    const { wrap } = withState(false);
    render(wrap(<PresentationBanner />));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("tells the audience-facing user what is on and lets them exit", () => {
    const { wrap, exit } = withState(true);
    render(wrap(<PresentationBanner />));
    expect(screen.getByRole("status")).toHaveTextContent("presentation.banner");
    fireEvent.click(screen.getByText("presentation.exit"));
    expect(exit).toHaveBeenCalledTimes(1);
  });
});

describe("PresentationToggle", () => {
  it("reflects the state and toggles on click", () => {
    const off = withState(false);
    const { unmount } = render(off.wrap(<PresentationToggle />));
    const button = screen.getByRole("button", { name: "sidebar.presentationMode" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(button);
    expect(off.toggle).toHaveBeenCalledTimes(1);
    unmount();

    const on = withState(true);
    render(on.wrap(<PresentationToggle />));
    expect(screen.getByRole("button", { name: "sidebar.presentationMode" })).toHaveAttribute("aria-pressed", "true");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, renderHook } from "@testing-library/react";
import { useGlobalShortcuts } from "../../src/hooks/useGlobalShortcuts";

const state = vi.hoisted(() => ({
  toggle: vi.fn(),
  matches: vi.fn((_e: KeyboardEvent, _id: string) => false),
}));

vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("../../src/hooks/useKeybindings", () => ({
  useKeybindings: () => ({ matchesShortcut: state.matches, isMac: false }),
}));
vi.mock("../../src/hooks/useConnectionManager", () => ({
  useConnectionManager: () => ({ openConnections: [], handleSwitch: vi.fn() }),
}));
vi.mock("../../src/hooks/usePresentationMode", () => ({
  usePresentationMode: () => ({ togglePresentationMode: state.toggle }),
}));

describe("useGlobalShortcuts: presentation mode", () => {
  beforeEach(() => {
    state.toggle.mockReset();
    state.matches.mockReset();
    state.matches.mockImplementation((_e, id) => id === "toggle_presentation_mode");
  });

  it("toggles presentation mode on its shortcut", () => {
    renderHook(() => useGlobalShortcuts());
    fireEvent.keyDown(window, { key: "F5", ctrlKey: true, shiftKey: true });
    expect(state.toggle).toHaveBeenCalledTimes(1);
  });

  it("works while typing in an input or a code editor", () => {
    renderHook(() => useGlobalShortcuts());
    const input = document.createElement("textarea");
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: "F5", ctrlKey: true, shiftKey: true });
    expect(state.toggle).toHaveBeenCalledTimes(1);
    input.remove();
  });

  it("does nothing for other shortcuts", () => {
    state.matches.mockImplementation(() => false);
    renderHook(() => useGlobalShortcuts());
    fireEvent.keyDown(window, { key: "a" });
    expect(state.toggle).not.toHaveBeenCalled();
  });
});

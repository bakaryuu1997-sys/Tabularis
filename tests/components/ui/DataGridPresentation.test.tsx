import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DataGrid } from "../../../src/components/ui/DataGrid";
import { PresentationContext } from "../../../src/contexts/PresentationContext";
import { useDatabase } from "../../../src/hooks/useDatabase";
import { useAlert } from "../../../src/hooks/useAlert";
import { useSettings } from "../../../src/hooks/useSettings";
import { DEFAULT_SETTINGS } from "../../../src/contexts/SettingsContext";
import { copyTextToClipboard } from "../../../src/utils/clipboard";

// jsdom has no layout, so the real virtualizer renders no rows. Render every row instead.
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({ index, key: index, start: index * 32, size: 32, end: (index + 1) * 32 })),
    getTotalSize: () => count * 32,
    measureElement: () => undefined,
    scrollToIndex: () => undefined,
    scrollToOffset: () => undefined,
    measure: () => undefined,
  }),
}));

vi.mock("../../../src/utils/clipboard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/utils/clipboard")>()),
  copyTextToClipboard: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../src/hooks/useDatabase", () => ({ useDatabase: vi.fn() }));
vi.mock("../../../src/hooks/useAlert", () => ({ useAlert: vi.fn() }));
vi.mock("../../../src/hooks/useSettings", () => ({ useSettings: vi.fn() }));

const EMAIL = "alice.nguyen@example.com";

const renderGrid = (presenting: boolean, maskingProp?: boolean) =>
  render(
    <PresentationContext.Provider
      value={{
        isPresentationMode: presenting,
        togglePresentationMode: vi.fn(),
        exitPresentationMode: vi.fn(),
      }}
    >
      <DataGrid
        columns={["city", "email"]}
        data={[["Hanoi", EMAIL]]}
        isMaskingEnabled={maskingProp}
      />
    </PresentationContext.Provider>,
  );

describe("DataGrid in presentation mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useDatabase).mockReturnValue({
      activeSchema: "public",
      activeDriver: "postgres",
      connections: [],
    } as unknown as ReturnType<typeof useDatabase>);
    vi.mocked(useAlert).mockReturnValue({ showAlert: vi.fn() } as unknown as ReturnType<typeof useAlert>);
    vi.mocked(useSettings).mockReturnValue({
      settings: { ...DEFAULT_SETTINGS },
      updateSetting: vi.fn(),
      isLoading: false,
      loadSettings: vi.fn(),
      resetSettings: vi.fn(),
    });
  });

  it("shows sensitive values as they are in normal mode", () => {
    renderGrid(false);
    expect(screen.getByText(EMAIL)).toBeInTheDocument();
  });

  it("masks sensitive columns while presenting, even though the grid's own toggle is off", () => {
    renderGrid(true, false);
    expect(screen.queryByText(EMAIL)).not.toBeInTheDocument();
    // The non-sensitive column is untouched.
    expect(screen.getByText("Hanoi")).toBeInTheDocument();
  });

  it("still masks when the grid's own toggle is on and nobody is presenting", () => {
    renderGrid(false, true);
    expect(screen.queryByText(EMAIL)).not.toBeInTheDocument();
  });
});

describe("copying from a grid while masking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useDatabase).mockReturnValue({ activeSchema: "public", activeDriver: "postgres", connections: [] } as unknown as ReturnType<typeof useDatabase>);
    vi.mocked(useAlert).mockReturnValue({ showAlert: vi.fn() } as unknown as ReturnType<typeof useAlert>);
    vi.mocked(useSettings).mockReturnValue({
      settings: { ...DEFAULT_SETTINGS, maskingProfile: "full" },
      updateSetting: vi.fn(),
      isLoading: false,
      loadSettings: vi.fn(),
      resetSettings: vi.fn(),
    });
  });

  const copyFocusedCell = async (cellText: string) => {
    fireEvent.click(screen.getByText(cellText));
    fireEvent.keyDown(document, { key: "c", ctrlKey: true });
    await waitFor(() => expect(copyTextToClipboard).toHaveBeenCalled());
    return vi.mocked(copyTextToClipboard).mock.calls[0][0];
  };

  it("copies the real value normally", async () => {
    renderGrid(false);
    expect(await copyFocusedCell(EMAIL)).toBe(EMAIL);
  });

  it("copies the masked value of a sensitive cell while presenting", async () => {
    renderGrid(true);
    // The cell shows dots, so click the visible dots, not the real address.
    const text = await copyFocusedCell("••••••••");
    expect(text).toBe("••••••••");
    expect(text).not.toContain("alice");
  });

  it("still copies a non-sensitive cell as it is while presenting", async () => {
    renderGrid(true);
    expect(await copyFocusedCell("Hanoi")).toBe("Hanoi");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { GeneralTab } from "../../../src/components/settings/GeneralTab";
import { DEFAULT_SETTINGS } from "../../../src/contexts/SettingsContext";

const settingsState = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  updateSetting: vi.fn(),
}));

vi.mock("lucide-react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("lucide-react")>()),
}));

vi.mock("../../../src/hooks/useSettings", () => ({
  useSettings: () => ({ settings: settingsState.settings, updateSetting: settingsState.updateSetting }),
}));

describe("GeneralTab CSV file format", () => {
  beforeEach(() => {
    settingsState.updateSetting.mockReset();
    settingsState.settings = { ...DEFAULT_SETTINGS };
  });

  it("offers UTF-8, UTF-8 + BOM and Shift_JIS", () => {
    render(<GeneralTab />);
    for (const key of ["settings.csvEncodingUtf8", "settings.csvEncodingUtf8Bom", "settings.csvEncodingShiftJis"]) {
      expect(screen.getByText(key)).toBeInTheDocument();
    }
  });

  it("keeps plain UTF-8 as the default so existing exports do not change", () => {
    expect(DEFAULT_SETTINGS.csvEncodingPreset).toBe("utf8");
  });

  it.each([
    ["settings.csvEncodingUtf8Bom", "utf8-bom"],
    ["settings.csvEncodingShiftJis", "shift_jis"],
    ["settings.csvEncodingUtf8", "utf8"],
  ])("choosing %s saves %s", (label, value) => {
    render(<GeneralTab />);
    fireEvent.click(screen.getByText(label));
    expect(settingsState.updateSetting).toHaveBeenCalledWith("csvEncodingPreset", value);
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { LogsTab } from "../../../src/components/settings/LogsTab";

const showAlert = vi.fn();

vi.mock("lucide-react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("lucide-react")>()),
}));

vi.mock("../../../src/hooks/useSettings", () => ({
  useSettings: () => ({ settings: { maxLogEntries: 100 }, updateSetting: vi.fn() }),
}));

vi.mock("../../../src/hooks/useAlert", () => ({
  useAlert: () => ({ showAlert }),
}));

describe("LogsTab export", () => {
  beforeEach(() => {
    showAlert.mockReset();
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === "get_logs") return [];
      if (cmd === "get_log_settings") return { enabled: true, max_size: 1000, current_count: 0 };
      return null;
    });
  });

  it("lets the backend pick the destination instead of sending a path", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd) => {
      if (cmd === "get_logs") return [];
      if (cmd === "get_log_settings") return { enabled: true, max_size: 1000, current_count: 0 };
      if (cmd === "export_logs_with_dialog") return "/home/u/logs.log";
      return null;
    });

    render(<LogsTab />);
    fireEvent.click(screen.getByText("settings.exportLogs"));

    await waitFor(() => expect(showAlert).toHaveBeenCalledTimes(1));
    const call = vi.mocked(invoke).mock.calls.find(([cmd]) => cmd === "export_logs_with_dialog");
    expect(call?.[1]).toEqual({ defaultFileName: expect.stringMatching(/^tabularis_logs_\d{4}-\d{2}-\d{2}\.log$/) });
    expect(call?.[1]).not.toHaveProperty("filePath");
    expect(vi.mocked(invoke).mock.calls.some(([cmd]) => cmd === "export_logs")).toBe(false);
  });

  it("shows no success message when the save dialog is cancelled", async () => {
    render(<LogsTab />);
    fireEvent.click(screen.getByText("settings.exportLogs"));

    await waitFor(() =>
      expect(vi.mocked(invoke).mock.calls.some(([cmd]) => cmd === "export_logs_with_dialog")).toBe(true),
    );
    expect(showAlert).not.toHaveBeenCalled();
  });
});

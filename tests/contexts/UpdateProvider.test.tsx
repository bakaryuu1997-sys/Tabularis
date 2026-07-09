import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import React from "react";
import { UpdateProvider } from "../../src/contexts/UpdateProvider";
import { useUpdate } from "../../src/hooks/useUpdate";
import { invoke } from "@tauri-apps/api/core";

// Auto-update is intentionally disabled in this build: the provider must never
// contact the backend.
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <UpdateProvider>{children}</UpdateProvider>
);

describe("UpdateProvider (auto-update disabled)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exposes a disabled, up-to-date state and never contacts the backend", () => {
    const { result } = renderHook(() => useUpdate(), { wrapper });
    expect(result.current.updateInfo).toBeNull();
    expect(result.current.isUpToDate).toBe(true);
    expect(result.current.isChecking).toBe(false);
    expect(result.current.isDownloading).toBe(false);
    expect(result.current.installationSource).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("checkForUpdates / downloadAndInstall / dismissUpdate are no-ops", async () => {
    const { result } = renderHook(() => useUpdate(), { wrapper });
    await result.current.checkForUpdates(true);
    await result.current.downloadAndInstall();
    await result.current.dismissUpdate();
    expect(invoke).not.toHaveBeenCalled();
    expect(result.current.updateInfo).toBeNull();
  });
});

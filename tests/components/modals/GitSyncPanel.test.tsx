import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { GitSyncPanel } from "../../../src/components/modals/team-sync/GitSyncPanel";

vi.mock("lucide-react", async (importOriginal) => ({ ...(await importOriginal<typeof import("lucide-react")>()) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
const showAlert = vi.fn();
vi.mock("../../../src/hooks/useAlert", () => ({ useAlert: () => ({ showAlert }) }));

const status = {
  branch: "main",
  remote_url: "https://github.com/org/team.git",
  has_upstream: true,
  ahead: 0,
  behind: 2,
  bundle_exists: true,
  bundle_dirty: false,
};

describe("GitSyncPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("tabularis.teamSync.repoPath", "/home/me/team");
  });

  it("shows the repository status for the remembered folder", async () => {
    vi.mocked(invoke).mockResolvedValue(status);
    render(<GitSyncPanel connections={[]} queries={[]} onBundleLoaded={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("main")).toBeInTheDocument());
    expect(screen.getByText("https://github.com/org/team.git")).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith("team_git_status", { repoPath: "/home/me/team" });
  });

  it("pulls, then hands the bundle to the import preview", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "team_git_status") return status;
      if (cmd === "team_git_pull") return "Updating";
      if (cmd === "team_git_read_bundle") return '{"version":"2.0"}';
      throw new Error(cmd);
    });
    const onBundleLoaded = vi.fn();
    render(<GitSyncPanel connections={[]} queries={[]} onBundleLoaded={onBundleLoaded} />);
    await waitFor(() => expect(screen.getByText("main")).toBeInTheDocument());

    fireEvent.click(screen.getByText("teamSync.git.pullAction"));
    await waitFor(() => expect(onBundleLoaded).toHaveBeenCalledWith('{"version":"2.0"}'));
    expect(invoke).toHaveBeenCalledWith("team_git_pull", { repoPath: "/home/me/team" });
  });

  it("never includes passwords when no passphrase is set", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "team_git_status") return status;
      if (cmd === "team_git_publish") return { committed: true, pushed: true, push_skipped_reason: null };
      throw new Error(cmd);
    });
    const conn = { id: "c1", name: "Prod", params: { driver: "postgres", database: "d", password: "hunter2" } };
    render(<GitSyncPanel connections={[conn]} queries={[]} onBundleLoaded={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("main")).toBeInTheDocument());

    fireEvent.click(screen.getByText("teamSync.git.publishAndPush"));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("team_git_publish", expect.anything()));
    const call = vi.mocked(invoke).mock.calls.find(([cmd]) => cmd === "team_git_publish")!;
    const args = call[1] as { content: string; push: boolean };
    expect(args.content).not.toContain("hunter2");
    expect(args.push).toBe(true);
  });

  it("disables actions until a repository is selected", () => {
    localStorage.removeItem("tabularis.teamSync.repoPath");
    render(<GitSyncPanel connections={[]} queries={[]} onBundleLoaded={vi.fn()} />);
    expect(screen.getByText("teamSync.git.pullAction").closest("button")).toBeDisabled();
    expect(screen.getByText("teamSync.git.publishAndPush").closest("button")).toBeDisabled();
    expect(invoke).not.toHaveBeenCalled();
  });
});

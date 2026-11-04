import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  describeSyncState,
  loadRememberedRepoPath,
  rememberRepoPath,
  teamGitPublish,
  teamGitPull,
  teamGitReadBundle,
  teamGitStatus,
} from "../../src/utils/teamGitSync";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("describeSyncState", () => {
  it.each([
    [{ has_upstream: false, ahead: 0, behind: 0 }, "no_upstream"],
    [{ has_upstream: true, ahead: 0, behind: 0 }, "up_to_date"],
    [{ has_upstream: true, ahead: 2, behind: 0 }, "ahead"],
    [{ has_upstream: true, ahead: 0, behind: 3 }, "behind"],
    [{ has_upstream: true, ahead: 1, behind: 1 }, "diverged"],
  ])("maps %j to %s", (status, expected) => {
    expect(describeSyncState(status)).toBe(expected);
  });
});

describe("Git sync command wrappers", () => {
  beforeEach(() => vi.mocked(invoke).mockReset());

  it("passes camelCase arguments to the matching Tauri commands", async () => {
    vi.mocked(invoke).mockResolvedValue(null);
    await teamGitStatus("/repo");
    await teamGitPull("/repo");
    await teamGitReadBundle("/repo");
    await teamGitPublish("/repo", "{}", "msg", true);
    expect(invoke).toHaveBeenNthCalledWith(1, "team_git_status", { repoPath: "/repo" });
    expect(invoke).toHaveBeenNthCalledWith(2, "team_git_pull", { repoPath: "/repo" });
    expect(invoke).toHaveBeenNthCalledWith(3, "team_git_read_bundle", { repoPath: "/repo" });
    expect(invoke).toHaveBeenNthCalledWith(4, "team_git_publish", {
      repoPath: "/repo",
      content: "{}",
      commitMessage: "msg",
      push: true,
    });
  });
});

describe("remembered repository path", () => {
  it("round-trips through localStorage", () => {
    localStorage.removeItem("tabularis.teamSync.repoPath");
    expect(loadRememberedRepoPath()).toBe("");
    rememberRepoPath("/home/me/team-repo");
    expect(loadRememberedRepoPath()).toBe("/home/me/team-repo");
  });

  it("does not throw when storage is unavailable", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const setSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadRememberedRepoPath()).toBe("");
    expect(() => rememberRepoPath("/x")).not.toThrow();
    spy.mockRestore();
    setSpy.mockRestore();
  });
});

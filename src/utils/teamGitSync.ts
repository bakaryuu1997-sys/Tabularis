import { invoke } from "@tauri-apps/api/core";

/** Mirrors the Rust `GitRepoStatus` struct. */
export interface GitRepoStatus {
  branch: string | null;
  remote_url: string | null;
  has_upstream: boolean;
  ahead: number;
  behind: number;
  bundle_exists: boolean;
  bundle_dirty: boolean;
}

/** Mirrors the Rust `GitPublishResult` struct. */
export interface GitPublishResult {
  committed: boolean;
  pushed: boolean;
  push_skipped_reason: string | null;
}

export const DEFAULT_COMMIT_MESSAGE = "chore: sync Tabularis workspace";
const REPO_PATH_STORAGE_KEY = "tabularis.teamSync.repoPath";

export const teamGitStatus = (repoPath: string) =>
  invoke<GitRepoStatus>("team_git_status", { repoPath });

export const teamGitPull = (repoPath: string) => invoke<string>("team_git_pull", { repoPath });

export const teamGitReadBundle = (repoPath: string) =>
  invoke<string | null>("team_git_read_bundle", { repoPath });

export const teamGitPublish = (repoPath: string, content: string, commitMessage: string, push: boolean) =>
  invoke<GitPublishResult>("team_git_publish", { repoPath, content, commitMessage, push });

/** The repository folder is a per-machine convenience, so it lives in localStorage only. */
export function loadRememberedRepoPath(): string {
  try {
    return localStorage.getItem(REPO_PATH_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function rememberRepoPath(path: string): void {
  try {
    localStorage.setItem(REPO_PATH_STORAGE_KEY, path);
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the feature still works without it.
  }
}

/** Short human-readable relation to the upstream branch, used for a status badge. */
export function describeSyncState(status: Pick<GitRepoStatus, "has_upstream" | "ahead" | "behind">):
  | "no_upstream"
  | "up_to_date"
  | "ahead"
  | "behind"
  | "diverged" {
  if (!status.has_upstream) return "no_upstream";
  if (status.ahead > 0 && status.behind > 0) return "diverged";
  if (status.behind > 0) return "behind";
  if (status.ahead > 0) return "ahead";
  return "up_to_date";
}

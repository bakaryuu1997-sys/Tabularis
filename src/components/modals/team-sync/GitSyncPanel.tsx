import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { Download, FolderOpen, GitBranch, Loader2, RefreshCw, Upload } from "lucide-react";
import type { SavedConnection } from "../../../contexts/DatabaseContext";
import type { SavedQuery } from "../../../contexts/SavedQueriesContext";
import { useAlert } from "../../../hooks/useAlert";
import { exportTeamWorkspaceBundle } from "../../../utils/teamWorkspaceSync";
import {
  DEFAULT_COMMIT_MESSAGE,
  describeSyncState,
  loadRememberedRepoPath,
  rememberRepoPath,
  teamGitPublish,
  teamGitPull,
  teamGitReadBundle,
  teamGitStatus,
  type GitRepoStatus,
} from "../../../utils/teamGitSync";

export interface GitSyncPanelProps {
  connections: SavedConnection[];
  queries: SavedQuery[];
  /** Called with the bundle read from the repository so the Import tab can preview and apply it. */
  onBundleLoaded: (json: string) => void;
}

export const GitSyncPanel: React.FC<GitSyncPanelProps> = ({ connections, queries, onBundleLoaded }) => {
  const { t } = useTranslation();
  const { showAlert } = useAlert();

  const [repoPath, setRepoPath] = useState(loadRememberedRepoPath);
  const [status, setStatus] = useState<GitRepoStatus | null>(null);
  const [busy, setBusy] = useState<"status" | "pull" | "publish" | null>(null);

  const [passphrase, setPassphrase] = useState("");
  const [includePasswords, setIncludePasswords] = useState(false);
  const [commitMessage, setCommitMessage] = useState(DEFAULT_COMMIT_MESSAGE);
  const [push, setPush] = useState(true);

  const refreshStatus = useCallback(
    async (path: string) => {
      if (!path) return;
      setBusy("status");
      try {
        setStatus(await teamGitStatus(path));
      } catch (err) {
        setStatus(null);
        showAlert(String(err), { kind: "error" });
      } finally {
        setBusy(null);
      }
    },
    [showAlert],
  );

  useEffect(() => {
    if (repoPath) void refreshStatus(repoPath);
    // Only refresh when the panel opens; later changes go through the explicit handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePickFolder = async () => {
    const picked = await open({ directory: true, multiple: false, defaultPath: repoPath || undefined });
    if (typeof picked !== "string") return;
    setRepoPath(picked);
    rememberRepoPath(picked);
    await refreshStatus(picked);
  };

  const handlePull = async () => {
    setBusy("pull");
    try {
      if (status?.has_upstream) await teamGitPull(repoPath);
      const bundle = await teamGitReadBundle(repoPath);
      if (bundle === null) {
        showAlert(t("teamSync.git.noBundle"), { kind: "warning" });
      } else {
        onBundleLoaded(bundle);
        showAlert(t("teamSync.git.pulled"), { kind: "info" });
      }
      setStatus(await teamGitStatus(repoPath));
    } catch (err) {
      showAlert(String(err), { kind: "error" });
    } finally {
      setBusy(null);
    }
  };

  const handlePublish = async () => {
    setBusy("publish");
    try {
      const json = await exportTeamWorkspaceBundle(connections, queries, {
        passphrase: passphrase.trim() || undefined,
        includePasswords: includePasswords && passphrase.trim().length > 0,
      });
      const result = await teamGitPublish(repoPath, json, commitMessage, push);
      if (!result.committed) {
        showAlert(t("teamSync.git.nothingToCommit"), { kind: "info" });
      } else if (result.pushed) {
        showAlert(t("teamSync.git.committedAndPushed"), { kind: "info" });
      } else if (push && result.push_skipped_reason === "no_remote") {
        showAlert(t("teamSync.git.committedNoRemote"), { kind: "warning" });
      } else {
        showAlert(t("teamSync.git.committed"), { kind: "info" });
      }
      setStatus(await teamGitStatus(repoPath));
    } catch (err) {
      showAlert(String(err), { kind: "error" });
    } finally {
      setBusy(null);
    }
  };

  const syncState = status ? describeSyncState(status) : null;
  const hasRepo = repoPath.length > 0 && status !== null;
  const canPublish = hasRepo && commitMessage.trim().length > 0 && busy === null;

  return (
    <div className="space-y-4 text-xs">
      <div className="p-4 rounded-lg bg-surface-secondary border border-default space-y-3">
        <h3 className="font-semibold text-sm text-primary flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-blue-400" />
          {t("teamSync.git.repoTitle")}
        </h3>
        <p className="text-muted leading-relaxed">{t("teamSync.git.repoHelp")}</p>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={repoPath}
            placeholder={t("teamSync.git.noRepo")}
            className="flex-1 px-3 py-2 bg-base border border-strong rounded-lg text-primary font-mono"
          />
          <button
            onClick={handlePickFolder}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface hover:bg-surface-secondary border border-default text-primary font-medium"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            {t("teamSync.git.chooseFolder")}
          </button>
          <button
            disabled={!repoPath || busy !== null}
            onClick={() => refreshStatus(repoPath)}
            title={t("teamSync.git.refresh")}
            className="p-2 rounded-lg bg-surface hover:bg-surface-secondary border border-default text-primary disabled:opacity-50"
          >
            {busy === "status" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </button>
        </div>

        {status && (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-muted">
            <dt>{t("teamSync.git.branch")}</dt>
            <dd className="font-mono text-primary">{status.branch ?? t("teamSync.git.detached")}</dd>
            <dt>{t("teamSync.git.remote")}</dt>
            <dd className="font-mono text-primary break-all">{status.remote_url ?? t("teamSync.git.noRemote")}</dd>
            <dt>{t("teamSync.git.state")}</dt>
            <dd className="text-primary">
              {t(`teamSync.git.states.${syncState}`, { ahead: status.ahead, behind: status.behind })}
            </dd>
            <dt>{t("teamSync.git.bundleFile")}</dt>
            <dd className="text-primary">
              {status.bundle_exists
                ? status.bundle_dirty
                  ? t("teamSync.git.bundleDirty")
                  : t("teamSync.git.bundleClean")
                : t("teamSync.git.bundleMissing")}
            </dd>
          </dl>
        )}
      </div>

      <div className="p-4 rounded-lg bg-surface-secondary border border-default space-y-3">
        <h3 className="font-semibold text-sm text-primary flex items-center gap-2">
          <Download className="w-4 h-4 text-emerald-400" />
          {t("teamSync.git.pullTitle")}
        </h3>
        <p className="text-muted leading-relaxed">{t("teamSync.git.pullHelp")}</p>
        <button
          disabled={!hasRepo || busy !== null}
          onClick={handlePull}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-50"
        >
          {busy === "pull" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          {t("teamSync.git.pullAction")}
        </button>
      </div>

      <div className="p-4 rounded-lg bg-surface-secondary border border-default space-y-3">
        <h3 className="font-semibold text-sm text-primary flex items-center gap-2">
          <Upload className="w-4 h-4 text-amber-400" />
          {t("teamSync.git.publishTitle")}
        </h3>
        <p className="text-muted leading-relaxed">{t("teamSync.git.publishHelp")}</p>

        <label className="block space-y-1">
          <span className="text-muted">{t("teamSync.git.passphrase")}</span>
          <input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            className="w-full px-3 py-2 bg-base border border-strong rounded-lg text-primary"
          />
        </label>
        <label className="flex items-center gap-2 text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={includePasswords}
            disabled={passphrase.trim().length === 0}
            onChange={(e) => setIncludePasswords(e.target.checked)}
          />
          {t("teamSync.git.includePasswords")}
        </label>
        {passphrase.trim().length === 0 && (
          <p className="text-amber-400">{t("teamSync.git.unencryptedWarning")}</p>
        )}

        <label className="block space-y-1">
          <span className="text-muted">{t("teamSync.git.commitMessage")}</span>
          <input
            value={commitMessage}
            maxLength={200}
            onChange={(e) => setCommitMessage(e.target.value)}
            className="w-full px-3 py-2 bg-base border border-strong rounded-lg text-primary"
          />
        </label>
        <label className="flex items-center gap-2 text-muted cursor-pointer">
          <input type="checkbox" checked={push} onChange={(e) => setPush(e.target.checked)} />
          {t("teamSync.git.pushAfterCommit")}
        </label>

        <button
          disabled={!canPublish}
          onClick={handlePublish}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-50"
        >
          {busy === "publish" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          {push ? t("teamSync.git.publishAndPush") : t("teamSync.git.publishOnly")}
        </button>
      </div>
    </div>
  );
};

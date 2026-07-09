import { type ReactNode } from "react";
import { UpdateContext } from "./UpdateContext";

/**
 * Auto-update is intentionally DISABLED in this personal build. The provider
 * keeps the same context shape (so consumers keep working) but never contacts
 * any update endpoint, never checks on startup, and never installs anything —
 * this build will never be replaced by an upstream/official release.
 */
export const UpdateProvider = ({ children }: { children: ReactNode }) => {
  const noop = async () => {
    /* auto-update disabled */
  };

  return (
    <UpdateContext.Provider
      value={{
        updateInfo: null,
        isChecking: false,
        isDownloading: false,
        downloadProgress: 0,
        checkForUpdates: noop,
        downloadAndInstall: noop,
        dismissUpdate: noop,
        error: null,
        isUpToDate: true,
        installationSource: null,
      }}
    >
      {children}
    </UpdateContext.Provider>
  );
};

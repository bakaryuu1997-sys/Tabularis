import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { PresentationContext } from "./PresentationContext";
import { useSettings } from "../hooks/useSettings";
import { normalizePresentationZoom } from "../utils/presentation";

const ROOT_CLASS = "presentation-mode";

async function setWebviewZoom(factor: number): Promise<void> {
  try {
    await getCurrentWebview().setZoom(factor);
  } catch (error) {
    // Zoom is cosmetic: without it presentation mode still masks data and hides connection details.
    console.warn("[Presentation] Could not change the zoom:", error);
  }
}

/**
 * Holds the presentation-mode switch. The state lives only in memory, so the app always starts in normal
 * mode, and turning it on zooms this window (Settings > Appearance picks the factor) and marks the root element.
 * Everything else (masking, hidden connection details, read-only) is read from the context by the components.
 */
export const PresentationProvider = ({ children }: { children: ReactNode }) => {
  const { settings } = useSettings();
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const zoom = normalizePresentationZoom(settings.presentationZoom);
  const zoomedRef = useRef(false);

  const togglePresentationMode = useCallback(() => setIsPresentationMode((on) => !on), []);
  const exitPresentationMode = useCallback(() => setIsPresentationMode(false), []);

  useEffect(() => {
    document.documentElement.classList.toggle(ROOT_CLASS, isPresentationMode);
    return () => document.documentElement.classList.remove(ROOT_CLASS);
  }, [isPresentationMode]);

  useEffect(() => {
    if (isPresentationMode) {
      zoomedRef.current = true;
      void setWebviewZoom(zoom);
    } else if (zoomedRef.current) {
      zoomedRef.current = false;
      void setWebviewZoom(1);
    }
  }, [isPresentationMode, zoom]);

  // Never leave the window zoomed if the provider goes away while presenting.
  useEffect(
    () => () => {
      if (zoomedRef.current) void setWebviewZoom(1);
    },
    [],
  );

  const value = useMemo(
    () => ({ isPresentationMode, togglePresentationMode, exitPresentationMode }),
    [isPresentationMode, togglePresentationMode, exitPresentationMode],
  );

  return <PresentationContext.Provider value={value}>{children}</PresentationContext.Provider>;
};

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { PresentationContext } from "./PresentationContext";
import { useSettings } from "../hooks/useSettings";
import { normalizePresentationZoom } from "../utils/presentation";

const ROOT_CLASS = "presentation-mode";

/** Sent to every window when presentation mode is switched on or off by the user. */
export const PRESENTATION_CHANGED_EVENT = "tabularis://presentation-changed";
/** Sent by a window that has just opened; a window that is presenting answers with the changed event. */
export const PRESENTATION_REQUEST_EVENT = "tabularis://presentation-request";

interface PresentationChangedPayload {
  enabled: boolean;
}

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
 *
 * Every window has its own provider (results windows, the ER diagram and others are separate webviews), so a
 * change made in one is broadcast to the others, and a window that opens while presenting asks for the state.
 */
export const PresentationProvider = ({ children }: { children: ReactNode }) => {
  const { settings } = useSettings();
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const zoom = normalizePresentationZoom(settings.presentationZoom);
  const zoomedRef = useRef(false);
  const stateRef = useRef(false);

  /** A change made here: apply it and tell the other windows. */
  const setMode = useCallback((enabled: boolean) => {
    stateRef.current = enabled;
    setIsPresentationMode(enabled);
    emit(PRESENTATION_CHANGED_EVENT, { enabled } satisfies PresentationChangedPayload).catch(() => undefined);
  }, []);

  const togglePresentationMode = useCallback(() => setMode(!stateRef.current), [setMode]);
  const exitPresentationMode = useCallback(() => setMode(false), [setMode]);

  // Follow the other windows, and ask for the current state once at start-up.
  useEffect(() => {
    let disposed = false;
    const unlisteners: Array<() => void> = [];
    const track = (pending: Promise<() => void>) => {
      pending
        .then((unlisten) => (disposed ? unlisten() : unlisteners.push(unlisten)))
        .catch(() => undefined);
    };

    track(
      listen<PresentationChangedPayload>(PRESENTATION_CHANGED_EVENT, (event) => {
        const enabled = event.payload?.enabled === true;
        stateRef.current = enabled;
        setIsPresentationMode(enabled);
      }),
    );
    track(
      listen(PRESENTATION_REQUEST_EVENT, () => {
        if (stateRef.current) {
          emit(PRESENTATION_CHANGED_EVENT, { enabled: true } satisfies PresentationChangedPayload).catch(
            () => undefined,
          );
        }
      }),
    );
    emit(PRESENTATION_REQUEST_EVENT).catch(() => undefined);

    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

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

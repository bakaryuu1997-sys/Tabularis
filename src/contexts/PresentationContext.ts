import { createContext } from "react";

export interface PresentationContextType {
  /** True while the app is set up for screen sharing: data masked, connection details hidden, read-only, zoomed. */
  isPresentationMode: boolean;
  togglePresentationMode: () => void;
  exitPresentationMode: () => void;
}

/** The default is "not presenting", so components outside the provider (other windows, tests) keep working. */
export const PresentationContext = createContext<PresentationContextType>({
  isPresentationMode: false,
  togglePresentationMode: () => undefined,
  exitPresentationMode: () => undefined,
});

import type { SafeModeLevel } from "./sqlSafety";

/** Zoom factors offered for presentation mode (Settings > Appearance). */
export const PRESENTATION_ZOOM_OPTIONS = [1.25, 1.5, 1.75] as const;

export const DEFAULT_PRESENTATION_ZOOM = 1.25;

/** Returns a supported zoom factor; anything else (missing, hand-edited config) becomes the default. */
export function normalizePresentationZoom(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return (PRESENTATION_ZOOM_OPTIONS as readonly number[]).includes(n) ? n : DEFAULT_PRESENTATION_ZOOM;
}

/** Shown in place of a host, user or path while presenting. */
export const HIDDEN_DETAIL = "••••••••";

/** Replaces a connection detail (host:port, user@host, key path) with dots while presenting. */
export function hideDetail(text: string, presenting: boolean): string {
  return presenting && text ? HIDDEN_DETAIL : text;
}

/**
 * Safe Mode level in force. Presenting always means read-only: a stray click or paste during a screen share
 * must not be able to change data, whatever level the connection normally uses.
 */
export function effectiveSafeMode(level: SafeModeLevel, presenting: boolean): SafeModeLevel {
  return presenting ? "readonly" : level;
}

/** PII masking is on when the user turned it on or while presenting. */
export function isMaskingActive(userEnabled: boolean | null | undefined, presenting: boolean): boolean {
  return presenting || !!userEnabled;
}

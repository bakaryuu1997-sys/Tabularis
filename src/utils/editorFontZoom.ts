export const MIN_EDITOR_FONT_SIZE = 9;
export const MAX_EDITOR_FONT_SIZE = 36;
export const DEFAULT_EDITOR_FONT_SIZE = 14;

/** Clamp font size to allowed range. */
export function clampFontSize(
  size: number,
  min: number = MIN_EDITOR_FONT_SIZE,
  max: number = MAX_EDITOR_FONT_SIZE,
): number {
  if (!Number.isFinite(size)) return DEFAULT_EDITOR_FONT_SIZE;
  return Math.min(max, Math.max(min, Math.round(size)));
}

/** Zoom in font size by given step. */
export function zoomInFontSize(currentSize: number, step: number = 1): number {
  return clampFontSize(currentSize + step);
}

/** Zoom out font size by given step. */
export function zoomOutFontSize(currentSize: number, step: number = 1): number {
  return clampFontSize(currentSize - step);
}

/** Reset font size to default. */
export function resetFontSize(
  defaultSize: number = DEFAULT_EDITOR_FONT_SIZE,
): number {
  return clampFontSize(defaultSize);
}

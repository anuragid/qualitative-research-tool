/**
 * Noise texture utilities for the methodex design system.
 * Provides CSS class names and the folder color mapping.
 */

// Folder color pairs: saturated (tab) + pastel (body)
export const FOLDER_COLORS = [
  { tab: "var(--color-brand-mustard)", body: "var(--color-brand-pale-gold)", name: "mustard" },
  { tab: "var(--color-brand-forest)", body: "var(--color-brand-pale-green)", name: "forest" },
  { tab: "var(--color-brand-maroon)", body: "var(--color-brand-lavender)", name: "maroon" },
  { tab: "var(--color-brand-crimson)", body: "var(--color-brand-peach)", name: "crimson" },
  { tab: "var(--color-brand-burnt-orange)", body: "var(--color-brand-pale-yellow)", name: "burnt-orange" },
  { tab: "var(--color-brand-olive)", body: "var(--color-brand-sage)", name: "olive" },
] as const;

/** Get folder color pair by index (cycles through 6 colors) */
export function getFolderColor(index: number) {
  return FOLDER_COLORS[index % FOLDER_COLORS.length];
}

/** Noise texture intensity levels */
export type NoiseIntensity = "light" | "medium" | "heavy";

/** Get noise CSS classes */
export function getNoiseClasses(intensity: NoiseIntensity = "medium"): string {
  return `noise-texture noise-${intensity}`;
}

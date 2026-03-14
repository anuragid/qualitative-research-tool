import { describe, it, expect } from "vitest";
import { FOLDER_COLORS, getFolderColor, getNoiseClasses } from "./noise";

describe("FOLDER_COLORS", () => {
  it("has exactly 6 entries", () => {
    expect(FOLDER_COLORS).toHaveLength(6);
  });

  it("each entry has tab, body, and name properties", () => {
    for (const color of FOLDER_COLORS) {
      expect(color).toHaveProperty("tab");
      expect(color).toHaveProperty("body");
      expect(color).toHaveProperty("name");
    }
  });

  it("all tab colors reference CSS variables", () => {
    for (const color of FOLDER_COLORS) {
      expect(color.tab).toMatch(/^var\(--color-/);
    }
  });

  it("all body colors reference CSS variables", () => {
    for (const color of FOLDER_COLORS) {
      expect(color.body).toMatch(/^var\(--color-/);
    }
  });
});

describe("getFolderColor", () => {
  it("returns first color pair for index 0", () => {
    expect(getFolderColor(0)).toBe(FOLDER_COLORS[0]);
  });

  it("returns last color pair for index 5", () => {
    expect(getFolderColor(5)).toBe(FOLDER_COLORS[5]);
  });

  it("cycles back to first color for index 6 (index % 6)", () => {
    expect(getFolderColor(6)).toBe(FOLDER_COLORS[0]);
  });

  it("cycles correctly for index 12", () => {
    expect(getFolderColor(12)).toBe(FOLDER_COLORS[0]);
  });
});

describe("getNoiseClasses", () => {
  it('returns "noise-texture noise-medium" with no argument', () => {
    expect(getNoiseClasses()).toBe("noise-texture noise-medium");
  });

  it('returns "noise-texture noise-light" for intensity "light"', () => {
    expect(getNoiseClasses("light")).toBe("noise-texture noise-light");
  });

  it('returns "noise-texture noise-heavy" for intensity "heavy"', () => {
    expect(getNoiseClasses("heavy")).toBe("noise-texture noise-heavy");
  });
});

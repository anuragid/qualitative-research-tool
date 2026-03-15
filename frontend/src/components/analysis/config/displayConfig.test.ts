// displayConfig.test.ts
import { describe, it, expect } from "vitest";
import {
  chunkTypeStyles,
  confidenceStyles,
  sortOptions,
  filterOptions,
  ANALYSIS_STEPS,
} from "./displayConfig";

describe("displayConfig", () => {
  it("chunkTypeStyles has all 4 types", () => {
    expect(Object.keys(chunkTypeStyles)).toEqual(
      expect.arrayContaining(["quote", "fact", "context", "observation"])
    );
  });

  it("each chunk type style has border, badge, and icon", () => {
    for (const style of Object.values(chunkTypeStyles)) {
      expect(style).toHaveProperty("border");
      expect(style).toHaveProperty("badge");
      expect(style).toHaveProperty("icon");
    }
  });

  it("confidenceStyles has high, medium, low", () => {
    expect(Object.keys(confidenceStyles)).toEqual(["high", "medium", "low"]);
  });

  it("sortOptions exist for all analysis steps", () => {
    for (const step of ANALYSIS_STEPS) {
      expect(sortOptions[step]).toBeDefined();
      expect(sortOptions[step].length).toBeGreaterThan(0);
    }
  });

  it("filterOptions exist for all analysis steps", () => {
    for (const step of ANALYSIS_STEPS) {
      expect(filterOptions[step]).toBeDefined();
    }
  });

  it("each sort option has field and label", () => {
    for (const step of ANALYSIS_STEPS) {
      for (const opt of sortOptions[step]) {
        expect(opt).toHaveProperty("field");
        expect(opt).toHaveProperty("label");
      }
    }
  });
});

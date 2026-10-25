// displayConfig.contrast.test.ts
// Every analysis badge's text must clear WCAG AA (4.5:1) against its own fill, in
// both themes, on the card and page surfaces the analysis views put badges on.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { badgeVariants } from "@/components/ui/badge";
import {
  chunkTypeStyles,
  insightTypeStyles,
  priorityStyles,
  confidenceStyles,
  frequencyStyles,
  relationshipTypeStyles,
  consistencyStyles,
  scopeStyles,
  fallbackBadgeStyle,
  countBadgeStyle,
} from "./displayConfig";
import { textContrast, themeTokens } from "@/test/contrast";

// Read from disk: Vitest stubs CSS imports, even `?raw` ones, to empty strings.
const themes = themeTokens(readFileSync(resolve(__dirname, "../../../index.css"), "utf8"));

const badges: [string, string][] = [
  ...Object.entries(chunkTypeStyles).map(([k, s]): [string, string] => [`chunk type ${k}`, s.badge]),
  ...Object.entries(insightTypeStyles).map(([k, s]): [string, string] => [`insight type ${k}`, s]),
  ...Object.entries(priorityStyles).map(([k, s]): [string, string] => [`priority ${k}`, s.badge]),
  ...Object.entries(confidenceStyles).map(([k, s]): [string, string] => [`confidence ${k}`, s]),
  ...Object.entries(frequencyStyles).map(([k, s]): [string, string] => [`frequency ${k}`, s]),
  ...Object.entries(relationshipTypeStyles).map(([k, s]): [string, string] => [`relationship ${k}`, s]),
  ...Object.entries(consistencyStyles).map(([k, s]): [string, string] => [`consistency ${k}`, s]),
  ...Object.entries(scopeStyles).map(([k, s]): [string, string] => [`scope ${k}`, s]),
  ["unknown chunk type", fallbackBadgeStyle],
  ["video count", countBadgeStyle],
  ["reference chip (outline badge)", badgeVariants({ variant: "outline" })],
];

describe.each(Object.entries(themes))("analysis badge contrast, %s theme", (_theme, tokens) => {
  it.each(badges)("%s", (_name, classes) => {
    for (const surface of ["card", "background"]) {
      expect(textContrast(classes, tokens, surface), `on ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

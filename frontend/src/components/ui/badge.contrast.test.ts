// badge.contrast.test.ts
// Every Badge variant's text must clear WCAG AA (4.5:1) against its own fill, at rest
// and hovered, in both themes, on the card and page surfaces. The filled Button variants
// share the same fill/text pairs (destructive above all), so they're checked here too.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { badgeVariants } from "./badge";
import { buttonVariants } from "./button";
import { textContrast, themeTokens } from "@/test/contrast";

// Read from disk: Vitest stubs CSS imports, even `?raw` ones, to empty strings.
const themes = themeTokens(readFileSync(resolve(__dirname, "../../index.css"), "utf8"));

const badgeVariantNames = ["default", "secondary", "destructive", "outline", "success", "warning"] as const;
const buttonVariantNames = ["default", "destructive"] as const;

const cases: [string, string][] = [
  ...badgeVariantNames.map((variant): [string, string] => [`Badge ${variant}`, badgeVariants({ variant })]),
  ...buttonVariantNames.map((variant): [string, string] => [`Button ${variant}`, buttonVariants({ variant })]),
];

describe.each(Object.entries(themes))("Badge and Button contrast, %s theme", (_theme, tokens) => {
  describe.each([
    ["at rest", false],
    ["hovered", true],
  ])("%s", (_state, hover) => {
    it.each(cases)("%s", (_name, classes) => {
      for (const surface of ["card", "background"]) {
        expect(textContrast(classes, tokens, surface, { hover }), `on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  });
});

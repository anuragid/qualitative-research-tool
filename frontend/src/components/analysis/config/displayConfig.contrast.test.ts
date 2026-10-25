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

// Read from disk: Vitest stubs CSS imports, even `?raw` ones, to empty strings.
const indexCss = readFileSync(resolve(__dirname, "../../../index.css"), "utf8");

type Rgba = [number, number, number, number];

const colorTokens = (block: string): Record<string, string> =>
  Object.fromEntries(
    [...block.matchAll(/--color-([\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()])
  );

const lightTokens = colorTokens(indexCss.match(/@theme \{([\s\S]*?)\n\}/)![1]);
const themes = {
  light: lightTokens,
  dark: { ...lightTokens, ...colorTokens(indexCss.match(/\n\.dark \{([\s\S]*?)\n\}/)![1]) },
};

function parseColor(value: string): Rgba {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16));
    return [r, g, b, 1];
  }
  const rgb = value.match(/^rgba?\(([^)]+)\)$/);
  if (rgb) {
    const [r, g, b, a = 1] = rgb[1].split(",").map(Number);
    return [r, g, b, a];
  }
  throw new Error(`Unsupported colour token value: ${value}`);
}

// Paint `top` over an opaque `bottom`, the way the browser composites sRGB colours.
const over = ([r, g, b, a]: Rgba, bottom: Rgba): Rgba => [
  r * a + bottom[0] * (1 - a),
  g * a + bottom[1] * (1 - a),
  b * a + bottom[2] * (1 - a),
  1,
];

function luminance([r, g, b]: Rgba) {
  const linear = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(a: Rgba, b: Rgba) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Resolve a badge's `bg-*` and `text-*` colour classes (with any /NN opacity) to
// token values. Non-colour classes like `text-label` have no token and are skipped.
function badgeColors(classes: string, tokens: Record<string, string>) {
  let bg: Rgba = [0, 0, 0, 0];
  let text: Rgba | undefined;
  for (const cls of classes.split(/\s+/)) {
    const match = cls.match(/^(bg|text)-([\w-]+?)(?:\/(\d+))?$/);
    if (!match || !(match[2] in tokens)) continue;
    const [r, g, b, a] = parseColor(tokens[match[2]]);
    const color: Rgba = [r, g, b, match[3] ? (a * Number(match[3])) / 100 : a];
    if (match[1] === "bg") bg = color;
    else text = color;
  }
  return { bg, text };
}

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
    const { bg, text } = badgeColors(classes, tokens);
    expect(text, "badge sets no text colour token").toBeDefined();
    for (const surface of ["card", "background"]) {
      const fill = over(bg, parseColor(tokens[surface]));
      expect(contrast(over(text!, fill), fill), `on ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

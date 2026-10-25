// contrast.ts
// Shared by the *.contrast.test.ts files: resolve Tailwind colour classes to the token
// values in index.css and measure WCAG contrast the way the browser composites them.
// Pure on purpose (no node:fs) so the app's tsconfig, which has no Node types, accepts it.

type Rgba = [number, number, number, number];
type Tokens = Record<string, string>;

const colorTokens = (block: string): Tokens =>
  Object.fromEntries(
    [...block.matchAll(/--color-([\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()])
  );

/** Light (`@theme`) and dark (`@theme` + `.dark`) colour tokens from index.css's source. */
export function themeTokens(indexCss: string): Record<"light" | "dark", Tokens> {
  const light = colorTokens(indexCss.match(/@theme \{([\s\S]*?)\n\}/)![1]);
  return {
    light,
    dark: { ...light, ...colorTokens(indexCss.match(/\n\.dark \{([\s\S]*?)\n\}/)![1]) },
  };
}

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

// Resolve the `bg-*` and `text-*` colour classes (with any /NN opacity) to token values.
// Non-colour classes like `text-label` have no token and are skipped, as are variant-
// prefixed ones, except that `hover:` (or `[a&]:hover:`) classes apply when `hover` is set.
function resolveColors(classes: string, tokens: Tokens, hover: boolean) {
  let bg: Rgba = [0, 0, 0, 0];
  let text: Rgba | undefined;
  const all = classes.split(/\s+/);
  const base = all.filter((cls) => !cls.includes(":"));
  const hovered = all.flatMap((cls) => cls.match(/^(?:\[a&\]:)?hover:([^:]+)$/)?.[1] ?? []);
  for (const cls of hover ? [...base, ...hovered] : base) {
    const match = cls.match(/^(bg|text)-([\w-]+?)(?:\/(\d+))?$/);
    if (!match || !(match[2] in tokens)) continue;
    const [r, g, b, a] = parseColor(tokens[match[2]]);
    const color: Rgba = [r, g, b, match[3] ? (a * Number(match[3])) / 100 : a];
    if (match[1] === "bg") bg = color;
    else text = color;
  }
  return { bg, text };
}

/** Contrast of `classes`' text on its own fill, laid over the `surface` colour token. */
export function textContrast(
  classes: string,
  tokens: Tokens,
  surface: string,
  { hover = false } = {}
) {
  const { bg, text } = resolveColors(classes, tokens, hover);
  if (!text) throw new Error(`Sets no text colour token: ${classes}`);
  const fill = over(bg, parseColor(tokens[surface]));
  return contrast(over(text, fill), fill);
}

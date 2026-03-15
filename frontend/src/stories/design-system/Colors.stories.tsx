import type { Meta, StoryObj } from "@storybook/react-vite";

const BRAND_SATURATED = [
  { name: "Mustard", var: "--color-brand-mustard", hex: "#D3A848" },
  { name: "Forest", var: "--color-brand-forest", hex: "#5D9F55" },
  { name: "Maroon", var: "--color-brand-maroon", hex: "#7D4D54" },
  { name: "Crimson", var: "--color-brand-crimson", hex: "#A11735" },
  { name: "Burnt Orange", var: "--color-brand-burnt-orange", hex: "#D25600" },
  { name: "Olive", var: "--color-brand-olive", hex: "#B8AC00" },
];

const BRAND_PASTEL = [
  { name: "Pale Blue", var: "--color-brand-pale-blue", hex: "#DBE5F0" },
  { name: "Pale Green", var: "--color-brand-pale-green", hex: "#EBF0D6" },
  { name: "Lavender", var: "--color-brand-lavender", hex: "#D7D8E8" },
  { name: "Sage", var: "--color-brand-sage", hex: "#C8CAC0" },
  { name: "Pale Gold", var: "--color-brand-pale-gold", hex: "#F0DAA7" },
  { name: "Pale Yellow", var: "--color-brand-pale-yellow", hex: "#F0E587" },
];

function ColorSwatch({ name, cssVar, hex }: { name: string; cssVar: string; hex: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="w-20 h-20 rounded-xl noise-texture noise-medium"
        style={{ backgroundColor: `var(${cssVar})` }}
      />
      <span className="text-ui text-base-55">{name}</span>
      <code className="text-[10px] text-base-40">{hex}</code>
    </div>
  );
}

function ColorsPage() {
  return (
    <div className="p-8 bg-surface-page space-y-12">
      <div>
        <h2 className="text-h3 mb-6">Brand — Saturated</h2>
        <div className="flex gap-6 flex-wrap">
          {BRAND_SATURATED.map((c) => (
            <ColorSwatch key={c.name} name={c.name} cssVar={c.var} hex={c.hex} />
          ))}
        </div>
      </div>
      <div>
        <h2 className="text-h3 mb-6">Brand — Pastel</h2>
        <div className="flex gap-6 flex-wrap">
          {BRAND_PASTEL.map((c) => (
            <ColorSwatch key={c.name} name={c.name} cssVar={c.var} hex={c.hex} />
          ))}
        </div>
      </div>
    </div>
  );
}

const meta: Meta = {
  title: "Design System/Colors",
  component: ColorsPage,
};
export default meta;

type Story = StoryObj;
export const Default: Story = {};

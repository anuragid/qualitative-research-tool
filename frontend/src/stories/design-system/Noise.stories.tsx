import type { Meta, StoryObj } from "@storybook/react-vite";

const BRAND_COLORS = [
  { name: "Mustard", var: "--color-brand-mustard", hex: "#D3A848" },
  { name: "Forest", var: "--color-brand-forest", hex: "#5D9F55" },
  { name: "Maroon", var: "--color-brand-maroon", hex: "#7D4D54" },
  { name: "Crimson", var: "--color-brand-crimson", hex: "#A11735" },
  { name: "Burnt Orange", var: "--color-brand-burnt-orange", hex: "#D25600" },
  { name: "Olive", var: "--color-brand-olive", hex: "#B8AC00" },
  { name: "Pale Blue", var: "--color-brand-pale-blue", hex: "#DBE5F0" },
  { name: "Pale Green", var: "--color-brand-pale-green", hex: "#EBF0D6" },
  { name: "Lavender", var: "--color-brand-lavender", hex: "#D7D8E8" },
  { name: "Sage", var: "--color-brand-sage", hex: "#C8CAC0" },
  { name: "Pale Gold", var: "--color-brand-pale-gold", hex: "#F0DAA7" },
  { name: "Pale Yellow", var: "--color-brand-pale-yellow", hex: "#F0E587" },
];

const INTENSITIES = ["light", "medium", "heavy"] as const;

function NoiseSwatch({ name, cssVar, intensity }: { name: string; cssVar: string; intensity: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`w-20 h-20 rounded-xl noise-texture noise-${intensity}`}
        style={{ backgroundColor: `var(${cssVar})` }}
      />
      <span className="text-[10px] text-text-placeholder">{name}</span>
    </div>
  );
}

function NoisePage() {
  return (
    <div className="p-8 bg-surface-page space-y-12">
      {INTENSITIES.map((intensity) => (
        <div key={intensity}>
          <h2 className="text-h3 mb-2 capitalize">{intensity} Noise</h2>
          <p className="text-ui text-text-tertiary mb-6">
            noise-texture noise-{intensity} (--noise-opacity: {intensity === "light" ? "0.25" : intensity === "medium" ? "0.4" : "0.55"})
          </p>
          <div className="flex gap-4 flex-wrap">
            {BRAND_COLORS.map((c) => (
              <NoiseSwatch key={`${c.name}-${intensity}`} name={c.name} cssVar={c.var} intensity={intensity} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const meta: Meta = {
  title: "Design System/Noise",
  component: NoisePage,
};
export default meta;

type Story = StoryObj;
export const Default: Story = {};

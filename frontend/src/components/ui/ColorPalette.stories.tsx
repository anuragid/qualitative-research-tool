import type { Meta, StoryObj } from "@storybook/react-vite";

const colors = [
  { name: "Primary", bg: "bg-primary", fg: "text-primary-foreground", token: "--primary" },
  { name: "Secondary", bg: "bg-secondary", fg: "text-secondary-foreground", token: "--secondary" },
  { name: "Accent", bg: "bg-accent", fg: "text-accent-foreground", token: "--accent" },
  { name: "Muted", bg: "bg-muted", fg: "text-muted-foreground", token: "--muted" },
  { name: "Destructive", bg: "bg-destructive", fg: "text-destructive-foreground", token: "--destructive" },
  { name: "Success", bg: "bg-success", fg: "text-success-foreground", token: "--success" },
  { name: "Warning", bg: "bg-warning", fg: "text-warning-foreground", token: "--warning" },
  { name: "Info", bg: "bg-info", fg: "text-info-foreground", token: "--info" },
];

const surfaces = [
  { name: "Background", bg: "bg-background", fg: "text-foreground", token: "--background" },
  { name: "Card", bg: "bg-card", fg: "text-card-foreground", token: "--card" },
  { name: "Popover", bg: "bg-popover", fg: "text-popover-foreground", token: "--popover" },
];

const charts = [
  { name: "Chart 1 (Teal)", bg: "bg-chart-1" },
  { name: "Chart 2 (Amber)", bg: "bg-chart-2" },
  { name: "Chart 3 (Purple)", bg: "bg-chart-3" },
  { name: "Chart 4 (Green)", bg: "bg-chart-4" },
  { name: "Chart 5 (Coral)", bg: "bg-chart-5" },
];

function ColorSwatch({ name, bg, fg, token }: { name: string; bg: string; fg?: string; token?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className={`${bg} ${fg || "text-white"} rounded-lg p-4 h-20 flex items-end`}>
        <span className="text-sm font-medium">{name}</span>
      </div>
      {token && <span className="text-xs text-muted-foreground font-mono">{token}</span>}
    </div>
  );
}

const meta = {
  title: "Design System/Color Palette",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const SemanticColors: Story = {
  render: () => (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-semibold mb-4">Semantic Colors</h3>
        <div className="grid grid-cols-4 gap-4">
          {colors.map((c) => <ColorSwatch key={c.name} {...c} />)}
        </div>
      </div>
      <div>
        <h3 className="text-lg font-semibold mb-4">Surfaces</h3>
        <div className="grid grid-cols-3 gap-4">
          {surfaces.map((c) => <ColorSwatch key={c.name} {...c} />)}
        </div>
      </div>
      <div>
        <h3 className="text-lg font-semibold mb-4">Chart / Dimension Colors</h3>
        <div className="grid grid-cols-5 gap-4">
          {charts.map((c) => <ColorSwatch key={c.name} {...c} />)}
        </div>
      </div>
      <div>
        <h3 className="text-lg font-semibold mb-4">Borders &amp; Utilities</h3>
        <div className="flex gap-4">
          <div className="rounded-lg border-2 border-border p-4 w-32 text-center text-sm">border-border</div>
          <div className="rounded-lg border-2 border-input p-4 w-32 text-center text-sm">border-input</div>
          <div className="rounded-lg border-2 border-ring p-4 w-32 text-center text-sm">border-ring</div>
        </div>
      </div>
    </div>
  ),
};

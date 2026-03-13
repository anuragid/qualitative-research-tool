import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Design System/Typography",
  parameters: { layout: "padded" },
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const TypeScale: Story = {
  render: () => (
    <div className="space-y-6">
      <div>
        <span className="text-xs text-muted-foreground font-mono">display -- 36px / 700</span>
        <p className="text-4xl font-bold">Methodex Design System</p>
      </div>
      <div>
        <span className="text-xs text-muted-foreground font-mono">h1 -- 30px / 600</span>
        <p className="text-3xl font-semibold">Page Title</p>
      </div>
      <div>
        <span className="text-xs text-muted-foreground font-mono">h2 -- 24px / 600</span>
        <p className="text-2xl font-semibold">Section Heading</p>
      </div>
      <div>
        <span className="text-xs text-muted-foreground font-mono">h3 -- 20px / 600</span>
        <p className="text-xl font-semibold">Card Title</p>
      </div>
      <div>
        <span className="text-xs text-muted-foreground font-mono">h4 -- 16px / 600</span>
        <p className="text-base font-semibold">Widget Title</p>
      </div>
      <div>
        <span className="text-xs text-muted-foreground font-mono">body -- 14px / 400</span>
        <p className="text-sm">Default body text for descriptions, transcript content, and general reading.</p>
      </div>
      <div>
        <span className="text-xs text-muted-foreground font-mono">body-sm -- 13px / 400</span>
        <p className="text-[13px]">Secondary body text for supporting information.</p>
      </div>
      <div>
        <span className="text-xs text-muted-foreground font-mono">caption -- 12px / 400</span>
        <p className="text-xs text-muted-foreground">Timestamps, metadata, table headers</p>
      </div>
      <div>
        <span className="text-xs text-muted-foreground font-mono">mono -- Geist Mono</span>
        <p className="font-mono text-sm">const analysis = await runPipeline(videoId);</p>
      </div>
    </div>
  ),
};

export const FontWeights: Story = {
  render: () => (
    <div className="space-y-3">
      <p className="font-normal">Regular (400) -- Body text, descriptions</p>
      <p className="font-medium">Medium (500) -- Labels, emphasis</p>
      <p className="font-semibold">Semibold (600) -- Headings, card titles</p>
      <p className="font-bold">Bold (700) -- Display text, callouts</p>
    </div>
  ),
};

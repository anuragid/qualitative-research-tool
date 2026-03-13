import type { Meta, StoryObj } from "@storybook/react";

const SHADOWS = [
  { name: "Subtle", token: "--shadow-subtle", usage: "Hover cards" },
  { name: "Card", token: "--shadow-card", usage: "Document page cards" },
  { name: "Block", token: "--shadow-block", usage: "Feature blocks, elevated cards" },
  { name: "Popup", token: "--shadow-popup", usage: "Frosted glass menus" },
  { name: "Hover", token: "--shadow-hover", usage: "Hover-elevated elements" },
];

function ShadowCard({ name, token, usage }: { name: string; token: string; usage: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="w-48 h-32 rounded-2xl bg-surface-card"
        style={{ boxShadow: `var(${token})` }}
      />
      <span className="text-ui font-semibold">{name}</span>
      <code className="text-[10px] text-base-40">{token}</code>
      <span className="text-label text-base-55">{usage}</span>
    </div>
  );
}

function ShadowsPage() {
  return (
    <div className="p-8 bg-surface-page space-y-8">
      <h2 className="text-h3 mb-6">Shadow Tokens</h2>
      <div className="flex gap-10 flex-wrap">
        {SHADOWS.map((s) => (
          <ShadowCard key={s.name} name={s.name} token={s.token} usage={s.usage} />
        ))}
      </div>
    </div>
  );
}

const meta: Meta = {
  title: "Design System/Shadows",
  component: ShadowsPage,
};
export default meta;

type Story = StoryObj;
export const Default: Story = {};

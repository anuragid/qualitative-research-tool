import type { Meta, StoryObj } from "@storybook/react-vite";

function TypographyPage() {
  return (
    <div className="p-8 bg-surface-page space-y-8">
      <div>
        <span className="text-label text-text-tertiary mb-2 block">text-h1 — DM Serif Display 48px</span>
        <h1 className="text-h1">The quick brown fox jumps</h1>
      </div>
      <div>
        <span className="text-label text-text-tertiary mb-2 block">text-h2 — DM Serif Display 36px</span>
        <h2 className="text-h2">The quick brown fox jumps</h2>
      </div>
      <div>
        <span className="text-label text-text-tertiary mb-2 block">text-h3 — DM Serif Display 28px</span>
        <h3 className="text-h3">The quick brown fox jumps</h3>
      </div>
      <div>
        <span className="text-label text-text-tertiary mb-2 block">text-h4 — DM Serif Display 22px</span>
        <h4 className="text-h4">The quick brown fox jumps</h4>
      </div>
      <hr className="border-border" />
      <div>
        <span className="text-label text-text-tertiary mb-2 block">Body — Inter 16px</span>
        <p>The quick brown fox jumps over the lazy dog. This is body text at the default size.</p>
      </div>
      <div>
        <span className="text-label text-text-tertiary mb-2 block">text-ui — Inter 13px/500</span>
        <p className="text-ui">UI text for buttons, controls, and navigation items</p>
      </div>
      <div>
        <span className="text-label text-text-tertiary mb-2 block">text-label — Inter 12px/600</span>
        <p className="text-label">Section labels and metadata</p>
      </div>
      <div>
        <span className="text-label text-text-tertiary mb-2 block">text-section — Inter 14px/500 uppercase</span>
        <p className="text-section">Section Header</p>
      </div>
    </div>
  );
}

const meta: Meta = {
  title: "Design System/Typography",
  component: TypographyPage,
};
export default meta;

type Story = StoryObj;
export const Default: Story = {};

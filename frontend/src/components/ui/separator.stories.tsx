import type { Meta, StoryObj } from "@storybook/react-vite";
import { Separator } from "./separator";

const meta = {
  title: "Primitives/Separator",
  component: Separator,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {
  render: () => (
    <div className="w-[300px]">
      <div className="space-y-1">
        <h4 className="text-ui text-text-primary">methodex</h4>
        <p className="text-sm text-text-tertiary">Qualitative research analysis tool</p>
      </div>
      <Separator className="my-4" />
      <div className="flex h-5 items-center space-x-4 text-sm text-text-secondary">
        <div>Projects</div>
        <Separator orientation="vertical" />
        <div>Videos</div>
        <Separator orientation="vertical" />
        <div>Analysis</div>
      </div>
    </div>
  ),
};

export const Vertical: Story = {
  render: () => (
    <div className="flex h-8 items-center space-x-4 text-sm text-text-secondary">
      <div>Chunks</div>
      <Separator orientation="vertical" />
      <div>Inferences</div>
      <Separator orientation="vertical" />
      <div>Patterns</div>
    </div>
  ),
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input } from "./input";
import { Label } from "./label";

const meta = {
  title: "Primitives/Input",
  component: Input,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { type: "text", placeholder: "Enter text..." },
};

export const WithLabel: Story = {
  render: () => (
    <div className="grid w-full max-w-sm items-center gap-1">
      <Label htmlFor="email">Email</Label>
      <Input type="email" id="email" placeholder="you@example.com" />
    </div>
  ),
};

export const Disabled: Story = {
  args: { disabled: true, placeholder: "Disabled input" },
};

export const File: Story = {
  render: () => (
    <div className="grid w-full max-w-sm items-center gap-1">
      <Label htmlFor="video">Upload Video</Label>
      <Input id="video" type="file" />
    </div>
  ),
};

export const FocusState: Story = {
  name: "Focus State (click to see)",
  render: () => (
    <div className="grid w-full max-w-sm items-center gap-1">
      <Label htmlFor="focus-demo">Project Name</Label>
      <Input id="focus-demo" placeholder="Click to see accent focus ring" />
      <p className="text-sm text-text-placeholder">Focus shows accent-blue border + ring</p>
    </div>
  ),
};

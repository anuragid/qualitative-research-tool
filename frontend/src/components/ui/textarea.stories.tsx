import type { Meta, StoryObj } from "@storybook/react-vite";
import { Textarea } from "./textarea";
import { Label } from "./label";

const meta = {
  title: "Primitives/Textarea",
  component: Textarea,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { placeholder: "Type your message here..." },
};

export const WithLabel: Story = {
  render: () => (
    <div className="grid w-full max-w-sm gap-1">
      <Label htmlFor="notes">Research Notes</Label>
      <Textarea id="notes" placeholder="Add your observations..." />
    </div>
  ),
};

export const Disabled: Story = {
  args: { disabled: true, placeholder: "Disabled" },
};

export const LongContent: Story = {
  name: "With Content (resize-y)",
  render: () => (
    <div className="grid w-full max-w-sm gap-1">
      <Label htmlFor="long">Analysis Notes</Label>
      <Textarea
        id="long"
        defaultValue="The participant expressed frustration with the onboarding flow, specifically noting that the number of required fields felt overwhelming. They mentioned preferring a progressive approach where information is collected gradually."
      />
      <p className="text-sm text-text-placeholder">Drag bottom edge to resize vertically</p>
    </div>
  ),
};

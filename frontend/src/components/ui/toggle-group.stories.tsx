import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within, userEvent } from "storybook/test";
import { ToggleGroup, ToggleGroupItem } from "./toggle-group";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  LayoutGrid,
  List,
  Columns,
} from "lucide-react";

const meta = {
  title: "Primitives/ToggleGroup",
  component: ToggleGroup,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Segmented control for switching between mutually exclusive options.\n\n" +
          "**When to use:** View mode switches, theme toggles, alignment controls, and layout selectors.\n\n" +
          "**When NOT to use:** Form selections with many options (use RadioGroup or Select instead).",
      },
    },
  },
} satisfies Meta<typeof ToggleGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { type: "single" },
  render: () => (
    <ToggleGroup type="single" defaultValue="center">
      <ToggleGroupItem value="left" aria-label="Align left">
        <AlignLeft className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="center" aria-label="Align center">
        <AlignCenter className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="right" aria-label="Align right">
        <AlignRight className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="justify" aria-label="Justify">
        <AlignJustify className="size-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const centerButton = canvas.getByRole("radio", { name: /align center/i });
    await expect(centerButton).toBeInTheDocument();
    await expect(centerButton).toHaveAttribute("data-state", "on");
    const rightButton = canvas.getByRole("radio", { name: /align right/i });
    await userEvent.click(rightButton);
    await expect(rightButton).toHaveAttribute("data-state", "on");
    await expect(centerButton).toHaveAttribute("data-state", "off");
  },
};

export const WithLabels: Story = {
  name: "With Text Labels",
  args: { type: "single" },
  render: () => (
    <ToggleGroup type="single" defaultValue="grid">
      <ToggleGroupItem value="grid">
        <LayoutGrid className="size-4" />
        Grid
      </ToggleGroupItem>
      <ToggleGroupItem value="list">
        <List className="size-4" />
        List
      </ToggleGroupItem>
      <ToggleGroupItem value="columns">
        <Columns className="size-4" />
        Board
      </ToggleGroupItem>
    </ToggleGroup>
  ),
};

export const Multiple: Story = {
  name: "Multiple Selection",
  args: { type: "multiple" },
  render: () => (
    <ToggleGroup type="multiple" defaultValue={["bold"]}>
      <ToggleGroupItem value="bold" className="font-bold">
        B
      </ToggleGroupItem>
      <ToggleGroupItem value="italic" className="italic">
        I
      </ToggleGroupItem>
      <ToggleGroupItem value="underline" className="underline">
        U
      </ToggleGroupItem>
    </ToggleGroup>
  ),
};

export const Small: Story = {
  name: "Small Size",
  args: { type: "single" },
  render: () => (
    <ToggleGroup type="single" size="sm" defaultValue="left">
      <ToggleGroupItem value="left" aria-label="Align left">
        <AlignLeft className="size-3.5" />
      </ToggleGroupItem>
      <ToggleGroupItem value="center" aria-label="Align center">
        <AlignCenter className="size-3.5" />
      </ToggleGroupItem>
      <ToggleGroupItem value="right" aria-label="Align right">
        <AlignRight className="size-3.5" />
      </ToggleGroupItem>
    </ToggleGroup>
  ),
};

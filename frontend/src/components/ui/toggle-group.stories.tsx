import type { Meta, StoryObj } from "@storybook/react-vite";
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
  parameters: { layout: "centered" },
} satisfies Meta<typeof ToggleGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
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
};

export const WithLabels: Story = {
  name: "With Text Labels",
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

import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { CardView } from "./CardView";

const meta = {
  title: "Analysis/CardView",
  component: CardView,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
} satisfies Meta<typeof CardView>;

export default meta;
type Story = StoryObj<typeof meta>;

const sampleCards = (
  <>
    <div className="p-4 border rounded-lg">Card 1</div>
    <div className="p-4 border rounded-lg">Card 2</div>
    <div className="p-4 border rounded-lg">Card 3</div>
    <div className="p-4 border rounded-lg">Card 4</div>
  </>
);

/**
 * Default 2-column grid layout.
 */
export const TwoColumns: Story = {
  args: {
    columns: 2,
    children: sampleCards,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Card 1")).toBeInTheDocument();
    await expect(canvas.getByText("Card 4")).toBeInTheDocument();
  },
};

/**
 * 3-column grid layout.
 */
export const ThreeColumns: Story = {
  args: {
    columns: 3,
    children: sampleCards,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Card 1")).toBeInTheDocument();
    await expect(canvas.getByText("Card 3")).toBeInTheDocument();
  },
};

/**
 * Default columns value (should default to 2).
 */
export const DefaultColumns: Story = {
  args: {
    children: sampleCards,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // All cards rendered
    await expect(canvas.getByText("Card 1")).toBeInTheDocument();
    await expect(canvas.getByText("Card 2")).toBeInTheDocument();
  },
};

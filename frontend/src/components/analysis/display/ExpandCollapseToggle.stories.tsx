import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within, userEvent, fn } from "storybook/test";
import { useState } from "react";
import { ExpandCollapseToggle } from "./ExpandCollapseToggle";

const meta = {
  title: "Analysis/ExpandCollapseToggle",
  component: ExpandCollapseToggle,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: {
    onExpandAll: fn(),
    onCollapseAll: fn(),
  },
} satisfies Meta<typeof ExpandCollapseToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * When all items are expanded, shows "Collapse" and clicking calls onCollapseAll.
 */
export const AllExpanded: Story = {
  args: {
    expanded: "all",
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button", { name: /collapse all/i });
    await expect(button).toBeInTheDocument();
    await expect(button).toHaveTextContent("Collapse");
    await userEvent.click(button);
    await expect(args.onCollapseAll).toHaveBeenCalled();
  },
};

/**
 * When all items are collapsed, shows "Expand" and clicking calls onExpandAll.
 */
export const AllCollapsed: Story = {
  args: {
    expanded: "none",
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button", { name: /expand all/i });
    await expect(button).toBeInTheDocument();
    await expect(button).toHaveTextContent("Expand");
    await userEvent.click(button);
    await expect(args.onExpandAll).toHaveBeenCalled();
  },
};

/**
 * When expanded is a Set (partial), shows "Expand" (since it's not "all").
 */
export const PartialExpanded: Story = {
  args: {
    expanded: new Set(["item-1", "item-2"]),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    // Partial expansion shows "Expand" button since isAllExpanded is false
    const button = canvas.getByRole("button", { name: /expand all/i });
    await expect(button).toHaveTextContent("Expand");
    await userEvent.click(button);
    await expect(args.onExpandAll).toHaveBeenCalled();
  },
};

/**
 * Interactive demo with real state management.
 */
function ExpandCollapseDemo() {
  const [expanded, setExpanded] = useState<"all" | "none" | Set<string>>("all");
  return (
    <div>
      <ExpandCollapseToggle
        expanded={expanded}
        onExpandAll={() => setExpanded("all")}
        onCollapseAll={() => setExpanded("none")}
      />
      <p data-testid="expand-state" className="mt-4 text-sm text-text-tertiary">
        State: {expanded instanceof Set ? `partial (${expanded.size} items)` : expanded}
      </p>
    </div>
  );
}

export const Interactive: Story = {
  render: () => <ExpandCollapseDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Initially "all" -> shows Collapse
    await expect(canvas.getByTestId("expand-state")).toHaveTextContent("State: all");
    const collapseBtn = canvas.getByRole("button", { name: /collapse all/i });
    await userEvent.click(collapseBtn);
    await expect(canvas.getByTestId("expand-state")).toHaveTextContent("State: none");

    // Now shows Expand
    const expandBtn = canvas.getByRole("button", { name: /expand all/i });
    await userEvent.click(expandBtn);
    await expect(canvas.getByTestId("expand-state")).toHaveTextContent("State: all");
  },
};

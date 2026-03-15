import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within, userEvent, fn } from "storybook/test";
import { useState } from "react";
import { ViewModeToggle } from "./ViewModeToggle";
import type { ViewMode } from "../hooks/useAnalysisDisplay";

const meta = {
  title: "Analysis/ViewModeToggle",
  component: ViewModeToggle,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: {
    onChange: fn(),
  },
} satisfies Meta<typeof ViewModeToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default list view selected.
 */
export const ListMode: Story = {
  args: {
    viewMode: "list",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const listButton = canvas.getByRole("radio", { name: /list view/i });
    const gridButton = canvas.getByRole("radio", { name: /grid view/i });
    const tableButton = canvas.getByRole("radio", { name: /table view/i });
    await expect(listButton).toHaveAttribute("data-state", "on");
    await expect(gridButton).toHaveAttribute("data-state", "off");
    await expect(tableButton).toHaveAttribute("data-state", "off");
  },
};

/**
 * Grid view selected.
 */
export const GridMode: Story = {
  args: {
    viewMode: "grid",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const gridButton = canvas.getByRole("radio", { name: /grid view/i });
    await expect(gridButton).toHaveAttribute("data-state", "on");
  },
};

/**
 * Table view selected.
 */
export const TableMode: Story = {
  args: {
    viewMode: "table",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const tableButton = canvas.getByRole("radio", { name: /table view/i });
    await expect(tableButton).toHaveAttribute("data-state", "on");
  },
};

/**
 * Clicking a different view mode calls onChange with that mode.
 */
export const SwitchToGrid: Story = {
  args: {
    viewMode: "list",
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const gridButton = canvas.getByRole("radio", { name: /grid view/i });
    await userEvent.click(gridButton);
    await expect(args.onChange).toHaveBeenCalledWith("grid");
  },
};

/**
 * Clicking each view mode button fires the correct onChange call.
 */
export const SwitchToTable: Story = {
  args: {
    viewMode: "list",
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const tableButton = canvas.getByRole("radio", { name: /table view/i });
    await userEvent.click(tableButton);
    await expect(args.onChange).toHaveBeenCalledWith("table");
  },
};

/**
 * Clicking the already-selected mode should NOT call onChange (guards against empty value).
 */
export const ClickAlreadySelected: Story = {
  args: {
    viewMode: "list",
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const listButton = canvas.getByRole("radio", { name: /list view/i });
    // Click the already-active button — Radix emits empty string, guard should prevent onChange
    await userEvent.click(listButton);
    await expect(args.onChange).not.toHaveBeenCalled();
  },
};

/**
 * Interactive demo with real state to verify full cycling through modes.
 */
function ViewModeDemo() {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  return (
    <div>
      <ViewModeToggle viewMode={viewMode} onChange={setViewMode} />
      <p data-testid="view-mode" className="mt-4 text-sm text-text-tertiary">
        Mode: {viewMode}
      </p>
    </div>
  );
}

export const Interactive: Story = {
  render: () => <ViewModeDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Initially list mode
    await expect(canvas.getByTestId("view-mode")).toHaveTextContent("Mode: list");

    // Switch to grid
    const gridButton = canvas.getByRole("radio", { name: /grid view/i });
    await userEvent.click(gridButton);
    await expect(canvas.getByTestId("view-mode")).toHaveTextContent("Mode: grid");

    // Switch to table
    const tableButton = canvas.getByRole("radio", { name: /table view/i });
    await userEvent.click(tableButton);
    await expect(canvas.getByTestId("view-mode")).toHaveTextContent("Mode: table");

    // Switch back to list
    const listButton = canvas.getByRole("radio", { name: /list view/i });
    await userEvent.click(listButton);
    await expect(canvas.getByTestId("view-mode")).toHaveTextContent("Mode: list");
  },
};

import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within, userEvent, fn } from "storybook/test";
import { useState } from "react";
import { SortDropdown } from "./SortDropdown";
import type { SortOption } from "../config/displayConfig";
import type { SortConfig } from "../hooks/useAnalysisDisplay";

const sampleOptions: SortOption[] = [
  { field: "frequency", label: "Frequency", direction: "desc" },
  { field: "relationship_type", label: "Relationship" },
  { field: "pattern_name", label: "Name" },
];

const meta = {
  title: "Analysis/SortDropdown",
  component: SortDropdown,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: {
    onSort: fn(),
  },
} satisfies Meta<typeof SortDropdown>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default unsorted state — button shows "Sort" label.
 */
export const Default: Story = {
  args: {
    options: sampleOptions,
    sort: null,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: /sort/i });
    await expect(trigger).toBeInTheDocument();
    await expect(trigger).toHaveTextContent("Sort");
  },
};

/**
 * Clicking a sort option from the unsorted state calls onSort with desc direction.
 */
export const SelectSort: Story = {
  args: {
    options: sampleOptions,
    sort: null,
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    // Open dropdown
    const trigger = canvas.getByRole("button", { name: /sort/i });
    await userEvent.click(trigger);
    // Click "Frequency" option
    const menuItem = await within(document.body).findByText("Frequency");
    await userEvent.click(menuItem);
    // Should call onSort with desc (from option's default direction)
    await expect(args.onSort).toHaveBeenCalledWith({ field: "frequency", direction: "desc" });
  },
};

/**
 * Selecting an option without a default direction uses "desc".
 */
export const SelectSortNoDefaultDirection: Story = {
  args: {
    options: sampleOptions,
    sort: null,
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: /sort/i });
    await userEvent.click(trigger);
    // "Relationship" has no direction default
    const menuItem = await within(document.body).findByText("Relationship");
    await userEvent.click(menuItem);
    await expect(args.onSort).toHaveBeenCalledWith({ field: "relationship_type", direction: "desc" });
  },
};

/**
 * When active sort is desc, clicking same field toggles to asc.
 */
export const ToggleDescToAsc: Story = {
  args: {
    options: sampleOptions,
    sort: { field: "frequency", direction: "desc" },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button");
    // Should show "Sort: Frequency" label
    await expect(trigger).toHaveTextContent("Sort: Frequency");
    await userEvent.click(trigger);
    // Click Frequency again to toggle desc -> asc
    const menuItem = await within(document.body).findByText("Frequency");
    await userEvent.click(menuItem);
    await expect(args.onSort).toHaveBeenCalledWith({ field: "frequency", direction: "asc" });
  },
};

/**
 * When active sort is asc, clicking same field clears the sort (returns null).
 */
export const ToggleAscToClear: Story = {
  args: {
    options: sampleOptions,
    sort: { field: "frequency", direction: "asc" },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button");
    await expect(trigger).toHaveTextContent("Sort: Frequency");
    await userEvent.click(trigger);
    const menuItem = await within(document.body).findByText("Frequency");
    await userEvent.click(menuItem);
    // Should clear sort
    await expect(args.onSort).toHaveBeenCalledWith(null);
  },
};

/**
 * Interactive demo with real state management.
 */
function SortDemo() {
  const [sort, setSort] = useState<SortConfig | null>(null);
  return (
    <div>
      <SortDropdown options={sampleOptions} sort={sort} onSort={setSort} />
      <p data-testid="sort-state" className="mt-4 text-sm text-text-tertiary">
        Sort: {sort ? `${sort.field} (${sort.direction})` : "none"}
      </p>
    </div>
  );
}

export const Interactive: Story = {
  render: () => <SortDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button");

    // Initially unsorted
    await expect(canvas.getByTestId("sort-state")).toHaveTextContent("Sort: none");

    // Select Frequency (default desc)
    await userEvent.click(trigger);
    const freq = await within(document.body).findByText("Frequency");
    await userEvent.click(freq);
    await expect(canvas.getByTestId("sort-state")).toHaveTextContent("Sort: frequency (desc)");

    // Click Frequency again -> toggle to asc
    await userEvent.click(trigger);
    const freq2 = await within(document.body).findByText("Frequency");
    await userEvent.click(freq2);
    await expect(canvas.getByTestId("sort-state")).toHaveTextContent("Sort: frequency (asc)");

    // Click Frequency again -> clear sort
    await userEvent.click(trigger);
    const freq3 = await within(document.body).findByText("Frequency");
    await userEvent.click(freq3);
    await expect(canvas.getByTestId("sort-state")).toHaveTextContent("Sort: none");
  },
};

/**
 * When switching to a different sort field, starts at that field's default direction.
 */
export const SwitchSortField: Story = {
  args: {
    options: sampleOptions,
    sort: { field: "frequency", direction: "desc" },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button");
    await userEvent.click(trigger);
    // Select a different field - use Relationship to avoid ambiguity
    const relItem = await within(document.body).findByText("Relationship");
    await userEvent.click(relItem);
    await expect(args.onSort).toHaveBeenCalledWith({ field: "relationship_type", direction: "desc" });
  },
};

/**
 * When the active sort field doesn't match any option's field,
 * the button falls back to showing the raw field name.
 */
export const SortFieldNotInOptions: Story = {
  args: {
    options: sampleOptions,
    sort: { field: "unknown_field", direction: "desc" },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button");
    // Should show the raw field name as fallback
    await expect(trigger).toHaveTextContent("Sort: unknown_field");
  },
};

/**
 * Returns null when no options are provided.
 */
export const EmptyOptions: Story = {
  args: {
    options: [],
    sort: null,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("button")).not.toBeInTheDocument();
  },
};

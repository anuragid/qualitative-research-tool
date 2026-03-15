import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within, userEvent, fn } from "storybook/test";
import { FilterBar } from "./FilterBar";
import type { FilterOption } from "../config/displayConfig";

const sampleOptions: FilterOption[] = [
  { field: "type", label: "Type", values: ["quote", "fact", "context", "observation"] },
];

const multiFieldOptions: FilterOption[] = [
  { field: "type", label: "Type", values: ["non-consensus", "first-principles", "surprising", "revealing"] },
  { field: "confidence", label: "Confidence", values: ["high", "medium", "low"] },
];

const meta = {
  title: "Analysis/FilterBar",
  component: FilterBar,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: {
    onToggle: fn(),
    onClear: fn(),
  },
} satisfies Meta<typeof FilterBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default state with no active filters — all buttons rendered in inactive style.
 */
export const Default: Story = {
  args: {
    options: sampleOptions,
    activeFilters: {},
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // All four chip buttons should be rendered
    await expect(canvas.getByText("quote")).toBeInTheDocument();
    await expect(canvas.getByText("fact")).toBeInTheDocument();
    await expect(canvas.getByText("context")).toBeInTheDocument();
    await expect(canvas.getByText("observation")).toBeInTheDocument();
    // Clear button should not be visible
    await expect(canvas.queryByText("Clear")).not.toBeInTheDocument();
  },
};

/**
 * Clicking a filter chip calls onToggle with the correct field and value.
 */
export const ClickFilter: Story = {
  args: {
    options: sampleOptions,
    activeFilters: {},
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const quoteButton = canvas.getByText("quote");
    await userEvent.click(quoteButton);
    await expect(args.onToggle).toHaveBeenCalledWith("type", "quote");
  },
};

/**
 * When filters are active, the Clear button appears and chips show active styling.
 */
export const WithActiveFilters: Story = {
  args: {
    options: sampleOptions,
    activeFilters: { type: ["quote", "fact"] },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    // Clear button should be visible
    const clearButton = canvas.getByText("Clear");
    await expect(clearButton).toBeInTheDocument();
    // Click clear
    await userEvent.click(clearButton);
    await expect(args.onClear).toHaveBeenCalled();
  },
};

/**
 * Multiple filter fields shown together.
 */
export const MultipleFilterFields: Story = {
  args: {
    options: multiFieldOptions,
    activeFilters: { confidence: ["high"] },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    // Buttons from both fields should be present
    await expect(canvas.getByText("non-consensus")).toBeInTheDocument();
    await expect(canvas.getByText("high")).toBeInTheDocument();
    await expect(canvas.getByText("medium")).toBeInTheDocument();
    // Clear button should be visible because confidence filter is active
    await expect(canvas.getByText("Clear")).toBeInTheDocument();
    // Click a chip from the type field
    await userEvent.click(canvas.getByText("surprising"));
    await expect(args.onToggle).toHaveBeenCalledWith("type", "surprising");
  },
};

/**
 * Returns null when no options are provided.
 */
export const EmptyOptions: Story = {
  args: {
    options: [],
    activeFilters: {},
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Nothing should be rendered
    await expect(canvas.queryByRole("button")).not.toBeInTheDocument();
  },
};

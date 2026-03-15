import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within, userEvent, fn } from "storybook/test";
import { useState } from "react";
import { SearchInput } from "./SearchInput";

const meta = {
  title: "Analysis/SearchInput",
  component: SearchInput,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: {
    onChange: fn(),
  },
} satisfies Meta<typeof SearchInput>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Empty state — no text, no clear button.
 */
export const Default: Story = {
  args: {
    value: "",
    placeholder: "Search...",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: /search analysis results/i });
    await expect(input).toBeInTheDocument();
    await expect(input).toHaveValue("");
    // Clear button should not be visible when value is empty
    await expect(canvas.queryByRole("button", { name: /clear search/i })).not.toBeInTheDocument();
  },
};

/**
 * Typing into the search input calls onChange for each character.
 */
export const TypingText: Story = {
  args: {
    value: "",
    placeholder: "Search...",
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: /search analysis results/i });
    await userEvent.type(input, "hello");
    await expect(args.onChange).toHaveBeenCalled();
    // onChange should have been called for each character typed
    await expect(args.onChange).toHaveBeenCalledTimes(5);
  },
};

/**
 * Interactive wrapper showing real typing + clear behavior with state.
 */
function SearchInputDemo() {
  const [value, setValue] = useState("");
  return (
    <div>
      <SearchInput value={value} onChange={setValue} placeholder="Type to search..." />
      <p data-testid="search-value" className="mt-2 text-sm text-text-tertiary">
        Value: &quot;{value}&quot;
      </p>
    </div>
  );
}

export const Interactive: Story = {
  render: () => <SearchInputDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: /search analysis results/i });

    // Type something
    await userEvent.type(input, "test query");
    await expect(canvas.getByTestId("search-value")).toHaveTextContent('Value: "test query"');

    // Clear button should now be visible
    const clearButton = canvas.getByRole("button", { name: /clear search/i });
    await expect(clearButton).toBeInTheDocument();

    // Click clear
    await userEvent.click(clearButton);
    await expect(canvas.getByTestId("search-value")).toHaveTextContent('Value: ""');

    // Input should still be focused after clear
    await expect(input).toHaveFocus();

    // Clear button should disappear after clearing
    await expect(canvas.queryByRole("button", { name: /clear search/i })).not.toBeInTheDocument();
  },
};

/**
 * When value is present, the clear button is shown.
 */
export const WithValue: Story = {
  args: {
    value: "existing search",
    placeholder: "Search...",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: /search analysis results/i });
    await expect(input).toHaveValue("existing search");
    // Clear button should be visible
    const clearButton = canvas.getByRole("button", { name: /clear search/i });
    await expect(clearButton).toBeInTheDocument();
  },
};

/**
 * Clicking clear when value is present calls onChange("").
 */
export const ClearSearch: Story = {
  args: {
    value: "to be cleared",
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const clearButton = canvas.getByRole("button", { name: /clear search/i });
    await userEvent.click(clearButton);
    await expect(args.onChange).toHaveBeenCalledWith("");
  },
};

/**
 * Custom placeholder text.
 */
export const CustomPlaceholder: Story = {
  args: {
    value: "",
    placeholder: "Filter results...",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: /search analysis results/i });
    await expect(input).toHaveAttribute("placeholder", "Filter results...");
  },
};

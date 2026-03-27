import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within, userEvent } from "storybook/test";
import {
  Select, SelectTrigger, SelectValue, SelectContent,
  SelectGroup, SelectLabel, SelectItem, SelectSeparator,
} from "./select";
import { Label } from "./label";

const meta = {
  title: "Primitives/Select",
  component: Select,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Dropdown selection for choosing from a predefined list.\n\n" +
          "**When to use:** Choosing one option from a list of 3+ items (e.g., model picker, status selector).\n\n" +
          "**When NOT to use:** Command actions or contextual menus (use DropdownMenu instead).",
      },
    },
  },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Select>
      <SelectTrigger className="w-[220px]">
        <SelectValue placeholder="Select a model..." />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Free Models</SelectLabel>
          <SelectItem value="gemma">Gemma 2 9B</SelectItem>
          <SelectItem value="llama">Llama 3.1 8B</SelectItem>
          <SelectItem value="mistral">Mistral 7B</SelectItem>
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>Premium (BYOK)</SelectLabel>
          <SelectItem value="claude">Claude Sonnet</SelectItem>
          <SelectItem value="gpt4">GPT-4o</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("combobox");
    await userEvent.click(trigger);

    const body = within(document.body);
    const listbox = await body.findByRole("listbox");
    await expect(listbox).toBeInTheDocument();

    // Select an item
    const gemmaOption = within(listbox).getByText("Gemma 2 9B");
    await userEvent.click(gemmaOption);
  },
};

export const WithSeparator: Story = {
  render: () => (
    <Select>
      <SelectTrigger className="w-[220px]">
        <SelectValue placeholder="Select a model..." />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Free Models</SelectLabel>
          <SelectItem value="gemma">Gemma 2 9B</SelectItem>
          <SelectItem value="llama">Llama 3.1 8B</SelectItem>
          <SelectItem value="mistral">Mistral 7B</SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Premium (BYOK)</SelectLabel>
          <SelectItem value="claude">Claude Sonnet</SelectItem>
          <SelectItem value="gpt4">GPT-4o</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("combobox");
    await userEvent.click(trigger);

    const body = within(document.body);
    const listbox = await body.findByRole("listbox");
    await expect(listbox).toBeInTheDocument();
    await expect(within(listbox).getByText("Gemma 2 9B")).toBeInTheDocument();
    await expect(
      within(listbox).getByText("Claude Sonnet")
    ).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
  },
};

export const WithLabel: Story = {
  render: () => (
    <div className="grid w-full max-w-sm items-center gap-1">
      <Label htmlFor="model-select">AI Model</Label>
      <Select>
        <SelectTrigger className="w-[220px]">
          <SelectValue placeholder="Choose model..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="gemma">Gemma 2 9B</SelectItem>
          <SelectItem value="llama">Llama 3.1 8B</SelectItem>
          <SelectItem value="claude">Claude Sonnet</SelectItem>
        </SelectContent>
      </Select>
    </div>
  ),
};

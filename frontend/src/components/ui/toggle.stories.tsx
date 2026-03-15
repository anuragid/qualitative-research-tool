import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within, userEvent } from "storybook/test";
import { Toggle } from "./toggle";
import { Bold, Italic, Underline } from "lucide-react";

const meta = {
  title: "Primitives/Toggle",
  component: Toggle,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Toggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Toggle aria-label="Toggle bold">
      <Bold className="size-4" />
    </Toggle>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole("button", { name: /toggle bold/i });
    await expect(toggle).toBeInTheDocument();
    await expect(toggle).toHaveAttribute("data-state", "off");
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute("data-state", "on");
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute("data-state", "off");
  },
};

export const WithText: Story = {
  render: () => (
    <Toggle aria-label="Toggle italic">
      <Italic className="size-4" />
      Italic
    </Toggle>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole("button", { name: /toggle italic/i });
    await expect(toggle).toBeInTheDocument();
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute("data-state", "on");
  },
};

export const OutlineVariant: Story = {
  name: "Outline Variant",
  render: () => (
    <Toggle variant="outline" aria-label="Toggle underline">
      <Underline className="size-4" />
    </Toggle>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole("button", { name: /toggle underline/i });
    await expect(toggle).toBeInTheDocument();
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute("data-state", "on");
  },
};

export const AllSizes: Story = {
  name: "All Sizes",
  render: () => (
    <div className="flex items-center gap-4">
      <Toggle size="sm" aria-label="Small toggle">
        <Bold className="size-4" />
      </Toggle>
      <Toggle size="default" aria-label="Default toggle">
        <Bold className="size-4" />
      </Toggle>
      <Toggle size="lg" aria-label="Large toggle">
        <Bold className="size-4" />
      </Toggle>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const smallToggle = canvas.getByRole("button", { name: /small toggle/i });
    const defaultToggle = canvas.getByRole("button", {
      name: /default toggle/i,
    });
    const largeToggle = canvas.getByRole("button", { name: /large toggle/i });
    await expect(smallToggle).toBeInTheDocument();
    await expect(defaultToggle).toBeInTheDocument();
    await expect(largeToggle).toBeInTheDocument();
    await userEvent.click(smallToggle);
    await expect(smallToggle).toHaveAttribute("data-state", "on");
  },
};

export const Disabled: Story = {
  render: () => (
    <Toggle disabled aria-label="Disabled toggle">
      <Bold className="size-4" />
    </Toggle>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole("button", { name: /disabled toggle/i });
    await expect(toggle).toBeDisabled();
  },
};

export const DefaultPressed: Story = {
  name: "Default Pressed",
  render: () => (
    <Toggle defaultPressed aria-label="Pressed toggle">
      <Bold className="size-4" />
    </Toggle>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole("button", { name: /pressed toggle/i });
    await expect(toggle).toHaveAttribute("data-state", "on");
  },
};

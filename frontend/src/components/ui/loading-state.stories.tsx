import type { Meta, StoryObj } from "@storybook/react-vite";
import { LoadingState } from "./loading-state";

const meta = {
  title: "Composites/LoadingState",
  component: LoadingState,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  argTypes: {
    size: {
      control: "select",
      options: ["sm", "default", "lg"],
    },
  },
} satisfies Meta<typeof LoadingState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};

export const WithMessage: Story = {
  args: {
    message: "Loading your data...",
  },
};

export const Small: Story = {
  args: {
    size: "sm",
    message: "Loading...",
  },
};

export const Large: Story = {
  args: {
    size: "lg",
    message: "Preparing your analysis...",
  },
};

export const LoadingVideos: Story = {
  args: {
    message: "Loading videos...",
    size: "default",
  },
};

export const AllSizes: Story = {
  render: () => (
    <div className="flex items-end gap-8">
      <LoadingState size="sm" message="Small" />
      <LoadingState size="default" message="Default" />
      <LoadingState size="lg" message="Large" />
    </div>
  ),
};
